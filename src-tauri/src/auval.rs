//! Audio Unit registry — reads/writes `~/.cache/lpx-explorer/auval.json`
//! and (later) spawns `auval -l` to populate it.
//!
//! Per docs/decisions.md 2026-05-04 #1 + 2026-05-05: the cache lives
//! exclusively under `~/.cache/lpx-explorer/`. We do **not** read or
//! write `~/.cache/lpx-toolkit/auval.json` — keeps tool boundaries
//! clean.

use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use lpx_parser::{parse_auval_line, AuvalEntry};
use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;
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

/// Streamed events emitted by [`run_au_scan`]. One [`AuvalEvent::Entry`]
/// per parsed `auval -l` line; a final [`AuvalEvent::Done`] when the
/// scan completes successfully.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", content = "entry")]
pub enum AuvalEvent {
    Entry(AuvalEntry),
    Done,
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

fn now_unix() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// Drain `reader` line-by-line, parse each line as an `auval -l` row,
/// invoke `on_entry` per parsed entry, and return the collected list.
/// Lines that don't parse (header / blank / footer) are silently
/// dropped — matches Python's `auval_lookup` semantics.
pub fn parse_auval_output<R, F>(reader: R, mut on_entry: F) -> Vec<AuvalEntry>
where
    R: BufRead,
    F: FnMut(&AuvalEntry),
{
    let mut entries = Vec::new();
    for line in reader.lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => break, // I/O error mid-stream — bail with what we have
        };
        if let Some(entry) = parse_auval_line(&line) {
            on_entry(&entry);
            entries.push(entry);
        }
    }
    entries
}

/// Spawn `program args...`, parse its stdout as `auval -l` output, and
/// call `on_entry` for each parsed line. Returns the collected list on
/// clean exit; returns [`AuvalError::SpawnFailed`] if spawn fails or
/// the child exits with a non-zero status.
pub fn scan_via_command<F>(
    program: &Path,
    args: &[&str],
    on_entry: F,
) -> Result<Vec<AuvalEntry>, AuvalError>
where
    F: FnMut(&AuvalEntry),
{
    let mut child = Command::new(program)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| AuvalError::SpawnFailed(format!("spawn {}: {}", program.display(), e)))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| AuvalError::SpawnFailed("auval: no stdout".into()))?;
    let entries = parse_auval_output(BufReader::new(stdout), on_entry);

    let status = child
        .wait()
        .map_err(|e| AuvalError::SpawnFailed(format!("wait: {e}")))?;
    if !status.success() {
        return Err(AuvalError::SpawnFailed(format!(
            "auval exited with {status}"
        )));
    }

    Ok(entries)
}

/// Tauri command: spawn `auval -l`, stream each parsed entry as
/// [`AuvalEvent::Entry`] via `on_event`, write the registry to the
/// default cache path on clean exit, then send [`AuvalEvent::Done`].
///
/// On non-zero exit (commonly: `auval` segfaults on a broken plug-in
/// install per `lpx-toolkit/CLAUDE.md`), the cache is **not** written —
/// a partial cache could mislead future sessions.
#[tauri::command]
pub async fn run_au_scan(on_event: Channel<AuvalEvent>) -> Result<(), AuvalError> {
    let entries = scan_via_command(Path::new("auval"), &["-l"], |entry| {
        let _ = on_event.send(AuvalEvent::Entry(entry.clone()));
    })?;

    if let Some(path) = default_cache_path() {
        let registry = AuRegistry {
            entries,
            scanned_at_unix: now_unix(),
        };
        write_cache(&path, &registry)?;
    }

    let _ = on_event.send(AuvalEvent::Done);
    Ok(())
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

    // ─── parse_auval_output (unit tests; no subprocess) ──────────────

    #[test]
    fn parse_auval_output_collects_entries_and_invokes_callback_per_line() {
        let stdout = "AU Validation Tool\n\
                      aumu EZk2 Toon  -  EZdrummer 2\n\
                      aufx Cmpr appl  -  AUDynamicsProcessor (file:/sys)\n\
                      aufx EB   SToy  -  EchoBoy\n\
                      \n\
                      done.\n";
        let mut callback_count = 0;

        let entries = parse_auval_output(stdout.as_bytes(), |_| {
            callback_count += 1;
        });

        assert_eq!(entries.len(), 3);
        assert_eq!(callback_count, 3);
        assert_eq!(entries[0].fingerprint, "aumu/EZk2/Toon");
        assert_eq!(entries[1].name, "AUDynamicsProcessor");
        assert_eq!(entries[2].subtype_4cc, "EB  ");
    }

    #[test]
    fn parse_auval_output_returns_empty_for_no_parseable_lines() {
        let stdout = "AU Validation Tool\nVersion: 1.x\n\n";

        let entries = parse_auval_output(stdout.as_bytes(), |_| {});

        assert!(entries.is_empty());
    }

    // ─── scan_via_command (integration; spawns a fake auval) ─────────

    fn make_fake_auval(dir: &Path, body: &str) -> PathBuf {
        let path = dir.join("auval");
        let script = format!("#!/bin/sh\n{body}");
        std::fs::write(&path, script).expect("write script");
        // Mark executable.
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = std::fs::metadata(&path).expect("meta").permissions();
            perms.set_mode(0o755);
            std::fs::set_permissions(&path, perms).expect("chmod");
        }
        path
    }

    #[test]
    fn scan_via_command_streams_entries_and_returns_collected_list() {
        let dir = tempdir().expect("tempdir");
        let fake = make_fake_auval(
            dir.path(),
            "echo 'aumu EZk2 Toon  -  EZdrummer 2'\n\
             echo 'aufx Cmpr appl  -  AUDynamicsProcessor'\n\
             echo 'aufx EB   SToy  -  EchoBoy'\n",
        );
        let mut streamed: Vec<String> = Vec::new();

        let result = scan_via_command(&fake, &[], |entry| {
            streamed.push(entry.fingerprint.clone());
        })
        .expect("ok");

        assert_eq!(result.len(), 3);
        assert_eq!(streamed.len(), 3, "callback fires per entry");
        assert_eq!(result[0].fingerprint, "aumu/EZk2/Toon");
        assert_eq!(streamed[0], "aumu/EZk2/Toon");
    }

    #[test]
    fn scan_via_command_returns_spawn_failed_on_non_zero_exit() {
        let dir = tempdir().expect("tempdir");
        let fake = make_fake_auval(
            dir.path(),
            "echo 'aumu EZk2 Toon  -  EZdrummer 2'\nexit 139\n",
        );

        let result = scan_via_command(&fake, &[], |_| {});

        assert!(matches!(result, Err(AuvalError::SpawnFailed(_))));
    }

    #[test]
    fn scan_via_command_returns_spawn_failed_on_missing_program() {
        let result = scan_via_command(
            Path::new("/this/program/does/not/exist"),
            &[],
            |_| {},
        );

        assert!(matches!(result, Err(AuvalError::SpawnFailed(_))));
    }
}
