//! Audio Unit registry — reads/writes `~/.cache/lpx-explorer/auval.json`
//! and (later) spawns `auval -l` to populate it.
//!
//! Per docs/decisions.md 2026-05-04 #1 + 2026-05-05: the cache lives
//! exclusively under `~/.cache/lpx-explorer/`. We do **not** read or
//! write `~/.cache/lpx-toolkit/auval.json` — keeps tool boundaries
//! clean.

use std::path::{Path, PathBuf};

use lpx_parser::AuvalEntry;
use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AuRegistry {
    pub entries: Vec<AuvalEntry>,
    pub scanned_at_unix: i64,
}

#[derive(Debug, Error, Serialize)]
#[serde(tag = "kind", content = "message")]
pub enum AuvalError {
    #[error("could not read cache: {0}")]
    CacheRead(String),
    #[error("cache file is malformed: {0}")]
    CacheParse(String),
    #[error("could not write cache: {0}")]
    CacheWrite(String),
    #[error("could not spawn auval: {0}")]
    SpawnFailed(String),
}

/// Default cache location: `$HOME/.cache/lpx-explorer/auval.json`.
/// Returns `None` when `$HOME` is unset (extremely unusual on macOS).
pub fn default_cache_path() -> Option<PathBuf> {
    let home = std::env::var_os("HOME")?;
    Some(PathBuf::from(home).join(".cache/lpx-explorer/auval.json"))
}

/// Tauri command: read the AU registry from the default cache path.
/// Returns `Ok(None)` when the cache file doesn't exist — frontend
/// surfaces a "Run AU scan" CTA in that case.
#[tauri::command]
pub fn load_au_registry() -> Result<Option<AuRegistry>, AuvalError> {
    let path = match default_cache_path() {
        Some(p) => p,
        None => return Ok(None), // HOME unset — treat as fresh install
    };
    read_cache(&path)
}

/// Read & deserialize an [`AuRegistry`] from `path`. Returns `Ok(None)`
/// when the file is absent (a fresh install with no scan yet — not an
/// error).
pub fn read_cache(path: &Path) -> Result<Option<AuRegistry>, AuvalError> {
    let bytes = match std::fs::read(path) {
        Ok(b) => b,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(AuvalError::CacheRead(e.to_string())),
    };
    serde_json::from_slice(&bytes)
        .map(Some)
        .map_err(|e| AuvalError::CacheParse(e.to_string()))
}

/// Serialize the registry to `path` (pretty-printed JSON). Creates
/// parent directories when they don't exist — `~/.cache/lpx-explorer/`
/// is missing on first run.
pub fn write_cache(path: &Path, registry: &AuRegistry) -> Result<(), AuvalError> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| AuvalError::CacheWrite(e.to_string()))?;
    }
    let json = serde_json::to_vec_pretty(registry)
        .map_err(|e| AuvalError::CacheWrite(e.to_string()))?;
    std::fs::write(path, json).map_err(|e| AuvalError::CacheWrite(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    use std::fs;

    use tempfile::tempdir;

    fn sample_registry() -> AuRegistry {
        AuRegistry {
            entries: vec![
                AuvalEntry {
                    fingerprint: "aumu/EZk2/Toon".into(),
                    type_4cc: "aumu".into(),
                    subtype_4cc: "EZk2".into(),
                    manufacturer_4cc: "Toon".into(),
                    name: "EZdrummer 2".into(),
                },
                AuvalEntry {
                    fingerprint: "aufx/Phsr/kHs ".into(),
                    type_4cc: "aufx".into(),
                    subtype_4cc: "Phsr".into(),
                    manufacturer_4cc: "kHs ".into(),
                    name: "Phase Plant".into(),
                },
            ],
            scanned_at_unix: 1_777_889_700,
        }
    }

    #[test]
    fn read_cache_returns_none_when_file_is_absent() {
        let dir = tempdir().expect("tempdir");
        let path = dir.path().join("auval.json");

        let result = read_cache(&path).expect("ok");

        assert!(result.is_none());
    }

    #[test]
    fn read_cache_returns_parse_error_on_corrupt_json() {
        let dir = tempdir().expect("tempdir");
        let path = dir.path().join("auval.json");
        fs::write(&path, b"not valid json {").expect("write garbage");

        let result = read_cache(&path);

        assert!(matches!(result, Err(AuvalError::CacheParse(_))));
    }

    #[test]
    fn write_then_read_round_trips() {
        let dir = tempdir().expect("tempdir");
        let path = dir.path().join("auval.json");

        write_cache(&path, &sample_registry()).expect("write");
        let result = read_cache(&path).expect("read").expect("some");

        assert_eq!(result, sample_registry());
    }

    #[test]
    fn write_cache_creates_parent_directories() {
        // ~/.cache/lpx-explorer/ may not exist on first run.
        let dir = tempdir().expect("tempdir");
        let nested = dir.path().join("a/b/c/auval.json");

        write_cache(&nested, &sample_registry()).expect("write");

        assert!(nested.is_file());
    }

    #[test]
    fn write_cache_preserves_trailing_spaces_in_4ccs_round_trip() {
        // The whole point of this cache is to round-trip 4CC fingerprints
        // exactly. JSON serde + deserde should not fold whitespace.
        let dir = tempdir().expect("tempdir");
        let path = dir.path().join("auval.json");
        let registry = AuRegistry {
            entries: vec![AuvalEntry {
                fingerprint: "aufx/EB  /SToy".into(),
                type_4cc: "aufx".into(),
                subtype_4cc: "EB  ".into(),
                manufacturer_4cc: "SToy".into(),
                name: "EchoBoy".into(),
            }],
            scanned_at_unix: 0,
        };

        write_cache(&path, &registry).expect("write");
        let loaded = read_cache(&path).expect("read").expect("some");

        assert_eq!(loaded.entries[0].subtype_4cc, "EB  ");
        assert_eq!(loaded.entries[0].fingerprint, "aufx/EB  /SToy");
    }

    #[test]
    fn default_cache_path_lives_under_dot_cache_lpx_explorer() {
        let p = default_cache_path().expect("HOME set");

        let s = p.to_string_lossy();
        assert!(s.contains(".cache/lpx-explorer/auval.json"));
    }
}
