//! Filesystem walk for `.logicx` bundles.
//!
//! Treats `.logicx` directories as leaves — never recurses into them. The
//! parser crate stays bytes-only, so path walking lives here at the Tauri
//! boundary per `docs/decisions.md`.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

use serde::Serialize;
use tauri::ipc::Channel;
use thiserror::Error;

const LOGICX_SUFFIX: &str = ".logicx";

#[derive(Debug, Error, Serialize)]
#[serde(tag = "kind", content = "message")]
pub enum ScanError {
    #[error("folder not found: {0}")]
    NotFound(String),
    #[error("can't read folder: {0}")]
    ReadFailed(String),
}

/// Streamed events from a folder scan. Each `Project` is a discovered
/// `.logicx` bundle path; `Done` signals the walk has finished.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type")]
pub enum ScanEvent {
    Project { path: String },
    Done,
}

fn is_logicx_dir(name: &str) -> bool {
    name.to_lowercase().ends_with(LOGICX_SUFFIX)
}

fn walk<F>(dir: &Path, cancel: &AtomicBool, on_match: &mut F)
where
    F: FnMut(PathBuf),
{
    if cancel.load(Ordering::Relaxed) {
        return;
    }

    let entries = match std::fs::read_dir(dir) {
        Ok(it) => it,
        Err(_) => return, // unreadable subtree — skip silently for now
    };

    for entry in entries.flatten() {
        if cancel.load(Ordering::Relaxed) {
            return;
        }

        let path = entry.path();

        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
        if !is_dir {
            continue;
        }

        let name = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n,
            None => continue,
        };

        if is_logicx_dir(name) {
            on_match(path);
            // Logic doesn't store sub-projects inside a `.logicx`; treat as leaf.
            continue;
        }

        walk(&path, cancel, on_match);
    }
}

#[cfg(test)]
fn scan_for_logicx(root: &Path, cancel: &AtomicBool) -> Vec<PathBuf> {
    let mut out = Vec::new();
    walk(root, cancel, &mut |p| out.push(p));
    out
}

/// Streaming Tauri command: emits a `ScanEvent::Project` for each
/// discovered bundle, then `ScanEvent::Done` when the walk finishes.
///
/// The frontend creates a `Channel<ScanEvent>` and passes it as
/// `onEvent`; events arrive at `channel.onmessage` in walk order.
/// Validates the scan root: must be a directory we can `read_dir`. The
/// per-subtree walk swallows read errors (one locked subdirectory shouldn't
/// fail the whole scan), but if the *root* itself fails, the user would
/// otherwise see "0 projects found" instead of an explanation.
fn validate_scan_root(path: &Path) -> Result<(), ScanError> {
    if !path.is_dir() {
        return Err(ScanError::NotFound(path.to_string_lossy().into_owned()));
    }
    if let Err(err) = std::fs::read_dir(path) {
        return Err(ScanError::ReadFailed(format!("{}: {}", path.display(), err)));
    }
    Ok(())
}

#[tauri::command]
pub async fn scan_folder(
    path: String,
    on_event: Channel<ScanEvent>,
) -> Result<(), ScanError> {
    let root = PathBuf::from(&path);
    validate_scan_root(&root)?;

    let cancel = AtomicBool::new(false);
    walk(&root, &cancel, &mut |found| {
        // Channel send only fails if the frontend has unsubscribed; nothing
        // useful to do mid-walk if it has, so swallow.
        let _ = on_event.send(ScanEvent::Project {
            path: found.to_string_lossy().into_owned(),
        });
    });

    let _ = on_event.send(ScanEvent::Done);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    use std::fs;
    use std::sync::atomic::{AtomicBool, Ordering};

    use tempfile::tempdir;

    fn create_logicx(parent: &Path, name: &str) -> PathBuf {
        let bundle = parent.join(name);
        fs::create_dir_all(bundle.join("Alternatives/000")).expect("create bundle");
        fs::write(bundle.join("Alternatives/000/ProjectData"), b"stub").expect("write");
        bundle
    }

    #[test]
    fn returns_logicx_bundles_in_a_flat_directory() {
        let dir = tempdir().expect("tempdir");
        let a = create_logicx(dir.path(), "alpha.logicx");
        let b = create_logicx(dir.path(), "beta.logicx");

        let cancel = AtomicBool::new(false);
        let mut found = scan_for_logicx(dir.path(), &cancel);
        found.sort();

        let mut want = vec![a, b];
        want.sort();
        assert_eq!(found, want);
    }

    #[test]
    fn descends_into_nested_subdirectories() {
        let dir = tempdir().expect("tempdir");
        let nested = dir.path().join("subA/subB");
        fs::create_dir_all(&nested).expect("nest");
        let bundle = create_logicx(&nested, "deep.logicx");

        let cancel = AtomicBool::new(false);
        let found = scan_for_logicx(dir.path(), &cancel);

        assert_eq!(found, vec![bundle]);
    }

    #[test]
    fn does_not_recurse_into_logicx_packages() {
        // `.logicx` is itself a directory containing `Alternatives/*/ProjectData`,
        // and Logic doesn't store sub-projects — so descending in is wasteful and
        // could confuse the user. Treat `.logicx` as a leaf.
        let dir = tempdir().expect("tempdir");
        let outer = create_logicx(dir.path(), "outer.logicx");

        // Plant a fake nested `.logicx` inside the outer — should NOT appear.
        let trap = outer.join("oops.logicx");
        fs::create_dir_all(trap.join("Alternatives/000")).expect("nest");
        fs::write(trap.join("Alternatives/000/ProjectData"), b"x").expect("w");

        let cancel = AtomicBool::new(false);
        let found = scan_for_logicx(dir.path(), &cancel);

        assert_eq!(found, vec![outer]);
    }

    #[test]
    fn skips_non_directory_entries() {
        let dir = tempdir().expect("tempdir");
        fs::write(dir.path().join("song.wav"), b"audio").expect("write");
        fs::write(dir.path().join("notes.txt"), b"notes").expect("write");
        let bundle = create_logicx(dir.path(), "real.logicx");

        let cancel = AtomicBool::new(false);
        let found = scan_for_logicx(dir.path(), &cancel);

        assert_eq!(found, vec![bundle]);
    }

    #[test]
    fn empty_folder_returns_empty_list() {
        let dir = tempdir().expect("tempdir");

        let cancel = AtomicBool::new(false);
        let found = scan_for_logicx(dir.path(), &cancel);

        assert!(found.is_empty());
    }

    #[test]
    fn pre_set_cancellation_token_returns_no_results() {
        let dir = tempdir().expect("tempdir");
        create_logicx(dir.path(), "ignored.logicx");

        let cancel = AtomicBool::new(true);
        cancel.store(true, Ordering::Relaxed);
        let found = scan_for_logicx(dir.path(), &cancel);

        assert!(found.is_empty(), "expected no results when cancellation pre-set");
    }

    #[test]
    fn validate_returns_not_found_for_missing_path() {
        let err = validate_scan_root(Path::new("/this/does/not/exist/lpx-explorer-test"))
            .expect_err("expected NotFound");

        assert!(matches!(err, ScanError::NotFound(_)), "got {:?}", err);
    }

    #[test]
    fn validate_returns_not_found_for_a_regular_file() {
        let dir = tempdir().expect("tempdir");
        let f = dir.path().join("not_a_dir.txt");
        fs::write(&f, b"hi").expect("write");

        let err = validate_scan_root(&f).expect_err("expected NotFound");

        assert!(matches!(err, ScanError::NotFound(_)), "got {:?}", err);
    }

    #[test]
    fn validate_returns_read_failed_for_unreadable_directory() {
        // macOS-only project — chmod 000 reliably blocks read_dir while
        // letting `is_dir()` (which only needs metadata) still succeed.
        use std::os::unix::fs::PermissionsExt;
        let dir = tempdir().expect("tempdir");
        let locked = dir.path().join("locked");
        fs::create_dir(&locked).expect("create locked dir");
        fs::set_permissions(&locked, fs::Permissions::from_mode(0o000)).expect("chmod 000");

        let err = validate_scan_root(&locked);

        // Always restore permissions so tempdir can clean up.
        fs::set_permissions(&locked, fs::Permissions::from_mode(0o755)).ok();

        let err = err.expect_err("expected ReadFailed");
        assert!(matches!(err, ScanError::ReadFailed(_)), "got {:?}", err);
    }

    #[test]
    fn validate_returns_ok_for_a_readable_empty_directory() {
        let dir = tempdir().expect("tempdir");
        validate_scan_root(dir.path()).expect("expected Ok");
    }
}
