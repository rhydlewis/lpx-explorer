//! Filesystem walk for `.logicx` bundles.
//!
//! Treats `.logicx` directories as leaves — never recurses into them. The
//! parser crate stays bytes-only, so path walking lives here at the Tauri
//! boundary per `docs/decisions.md`.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

use serde::Serialize;
use thiserror::Error;

const LOGICX_SUFFIX: &str = ".logicx";

#[derive(Debug, Error, Serialize)]
#[serde(tag = "kind", content = "message")]
pub enum ScanError {
    #[error("folder not found: {0}")]
    NotFound(String),
}

fn is_logicx_dir(name: &str) -> bool {
    let lower = name.to_lowercase();
    lower.ends_with(LOGICX_SUFFIX)
}

fn walk(dir: &Path, cancel: &AtomicBool, out: &mut Vec<PathBuf>) {
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
            out.push(path);
            // Logic doesn't store sub-projects inside a `.logicx`; treat as leaf.
            continue;
        }

        walk(&path, cancel, out);
    }
}

/// Recursively collect `.logicx` bundle paths under `root`.
///
/// `cancel` is sampled at every directory entry; flipping it true mid-flight
/// returns the partial result. The full cancel-mid-flight integration ships
/// with bead `lpx-explorer-has.6` (progressive streaming).
pub fn scan_for_logicx(root: &Path, cancel: &AtomicBool) -> Vec<PathBuf> {
    let mut out = Vec::new();
    walk(root, cancel, &mut out);
    out
}

#[tauri::command]
pub async fn scan_folder(path: String) -> Result<Vec<String>, ScanError> {
    let root = PathBuf::from(&path);
    if !root.is_dir() {
        return Err(ScanError::NotFound(path));
    }
    let cancel = AtomicBool::new(false);
    let results = scan_for_logicx(&root, &cancel);
    Ok(results
        .into_iter()
        .map(|p| p.to_string_lossy().into_owned())
        .collect())
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
        // The integration of cancel-mid-flight ships in D.6 (progressive
        // streaming requires a different shape). For D.1 we ship the
        // primitive: if the token is set when the walker enters, it bails
        // out cleanly with whatever it has so far (zero, here).
        let dir = tempdir().expect("tempdir");
        create_logicx(dir.path(), "ignored.logicx");

        let cancel = AtomicBool::new(true);
        cancel.store(true, Ordering::Relaxed);
        let found = scan_for_logicx(dir.path(), &cancel);

        assert!(found.is_empty(), "expected no results when cancellation pre-set");
    }
}
