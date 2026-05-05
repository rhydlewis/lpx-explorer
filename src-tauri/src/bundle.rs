//! Filesystem statistics about a `.logicx` bundle.
//!
//! `.logicx` is a macOS package (a directory the OS treats as a single
//! file). Sizes / dates need to be computed at the directory level
//! since macOS doesn't track them automatically.

use std::path::Path;

use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct BundleStats {
    /// Total size in bytes — recursive sum of every file inside the bundle.
    pub size_bytes: u64,
    /// Unix epoch seconds. macOS exposes `st_birthtime`; on filesystems
    /// without one this falls back to mtime so created never reports later
    /// than modified.
    pub created_at_unix: i64,
    /// Unix epoch seconds — bundle directory's mtime.
    pub modified_at_unix: i64,
}

/// Recursive sum of every file size beneath `bundle`. Unreadable
/// children are skipped silently — the size becomes a lower bound rather
/// than aborting the whole stat read.
fn recursive_size(bundle: &Path) -> std::io::Result<u64> {
    let mut total = 0u64;
    let entries = std::fs::read_dir(bundle)?;
    for entry in entries.flatten() {
        let file_type = match entry.file_type() {
            Ok(t) => t,
            Err(_) => continue,
        };
        if file_type.is_dir() {
            // Symlink-following stops at non-dir entries; we don't follow
            // arbitrary symlinks (could escape the bundle).
            total = total.saturating_add(recursive_size(&entry.path())?);
        } else if file_type.is_file() {
            if let Ok(meta) = entry.metadata() {
                total = total.saturating_add(meta.len());
            }
        }
    }
    Ok(total)
}

fn unix_seconds(time: std::time::SystemTime) -> i64 {
    match time.duration_since(std::time::UNIX_EPOCH) {
        Ok(d) => d.as_secs() as i64,
        Err(e) => -(e.duration().as_secs() as i64),
    }
}

#[cfg(target_os = "macos")]
fn created_seconds(meta: &std::fs::Metadata) -> Option<i64> {
    use std::os::macos::fs::MetadataExt;
    let secs = meta.st_birthtime();
    if secs <= 0 {
        return None;
    }
    Some(secs)
}

#[cfg(not(target_os = "macos"))]
fn created_seconds(_meta: &std::fs::Metadata) -> Option<i64> {
    None
}

/// Compute size + dates for a `.logicx` bundle directory.
pub fn bundle_stats(bundle: &Path) -> std::io::Result<BundleStats> {
    let meta = std::fs::metadata(bundle)?;
    let modified = meta.modified().map(unix_seconds).unwrap_or(0);
    let created = created_seconds(&meta).unwrap_or(modified);
    let size_bytes = recursive_size(bundle).unwrap_or(0);
    Ok(BundleStats {
        size_bytes,
        created_at_unix: created,
        modified_at_unix: modified,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    fn make_bundle(parent: &Path, name: &str, files: &[(&str, &[u8])]) -> std::path::PathBuf {
        let bundle = parent.join(name);
        fs::create_dir_all(&bundle).expect("mkdir bundle");
        for (rel, content) in files {
            let path = bundle.join(rel);
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent).expect("mkdir parent");
            }
            fs::write(&path, content).expect("write");
        }
        bundle
    }

    #[test]
    fn size_is_recursive_sum_of_file_bytes() {
        let dir = tempdir().expect("tempdir");
        let bundle = make_bundle(
            dir.path(),
            "song.logicx",
            &[
                ("Alternatives/000/ProjectData", b"abcdefgh"), // 8 bytes
                ("Alternatives/000/MetaData.plist", b"xyz"),   // 3 bytes
            ],
        );

        let stats = bundle_stats(&bundle).expect("stats");

        assert_eq!(stats.size_bytes, 11);
    }

    #[test]
    fn empty_bundle_reports_zero_size() {
        let dir = tempdir().expect("tempdir");
        let bundle = dir.path().join("empty.logicx");
        fs::create_dir_all(&bundle).expect("mkdir");

        let stats = bundle_stats(&bundle).expect("stats");

        assert_eq!(stats.size_bytes, 0);
    }

    #[test]
    fn modified_at_is_close_to_now() {
        let dir = tempdir().expect("tempdir");
        let bundle = make_bundle(dir.path(), "song.logicx", &[("ProjectData", b"x")]);

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("epoch")
            .as_secs() as i64;

        let stats = bundle_stats(&bundle).expect("stats");

        // Tempdir was just written, mtime should be within a few seconds.
        assert!(
            (now - stats.modified_at_unix).abs() < 5,
            "modified_at {} too far from now {}",
            stats.modified_at_unix,
            now,
        );
    }

    #[test]
    fn created_never_reports_later_than_modified() {
        let dir = tempdir().expect("tempdir");
        let bundle = make_bundle(dir.path(), "song.logicx", &[("ProjectData", b"x")]);

        let stats = bundle_stats(&bundle).expect("stats");

        assert!(stats.created_at_unix <= stats.modified_at_unix);
    }

    #[test]
    fn missing_bundle_path_returns_error() {
        let result = bundle_stats(Path::new("/this/path/does/not/exist.logicx"));

        assert!(result.is_err());
    }
}
