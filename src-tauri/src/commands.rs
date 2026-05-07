//! Tauri command surface for the walking skeleton.
//!
//! Locates `<bundle>/Alternatives/*/ProjectData` + `MetaData.plist`, reads
//! their bytes, and runs them through the bytes-only `lpx-parser`. Bundle
//! filesystem stats (size + dates) come from `crate::bundle`.

use std::fs;
use std::path::{Path, PathBuf};

use lpx_parser::{AURef, ProjectMetadata, Track, TrackRegistryEntry};
use serde::Serialize;
use thiserror::Error;

use crate::bundle::{bundle_stats, BundleStats};

#[derive(Debug, Serialize)]
pub struct ProjectSummary {
    pub fingerprints: Vec<AURef>,
    pub metadata: ProjectMetadata,
    pub stats: BundleStats,
    pub tracks: Vec<Track>,
    pub tracks_registry: Vec<TrackRegistryEntry>,
}

#[derive(Debug, Error, Serialize)]
#[serde(tag = "kind", content = "message")]
pub enum ParseError {
    #[error("ProjectData not found inside bundle at {0}")]
    ProjectDataMissing(String),
    #[error("MetaData.plist not found inside bundle at {0}")]
    MetadataMissing(String),
    #[error("failed to read bundle: {0}")]
    Io(String),
    #[error("invalid MetaData.plist: {0}")]
    MetadataInvalid(String),
}

#[tauri::command]
pub fn parse_project(path: String) -> Result<ProjectSummary, ParseError> {
    let started = std::time::Instant::now();
    crate::tlog!("[parse_project] start path={path:?}");

    let bundle = PathBuf::from(&path);
    let alt = locate_alternative(&bundle).ok_or_else(|| {
        crate::tlog!("[parse_project] FAIL no Alternatives/*/ProjectData path={path:?}");
        ParseError::ProjectDataMissing(path.clone())
    })?;

    let project_data_bytes = read_required(&alt.join("ProjectData"))?;
    let plist_bytes = read_required(&alt.join("MetaData.plist"))
        .map_err(|e| match e {
            ParseError::Io(msg) if msg.starts_with("file not found") => {
                ParseError::MetadataMissing(path.clone())
            }
            other => other,
        })?;

    let fingerprints = lpx_parser::find_aus(&project_data_bytes);
    let metadata = lpx_parser::parse_metadata_plist(&plist_bytes)
        .map_err(|e| ParseError::MetadataInvalid(format!("{e:?}")))?;
    let stats = bundle_stats(&bundle).map_err(|e| ParseError::Io(e.to_string()))?;

    let mut tracks = lpx_parser::find_tracks(&project_data_bytes);
    lpx_parser::assign_aus(&mut tracks, &fingerprints);
    let region_records = lpx_parser::find_region_records(&project_data_bytes);
    let clusters = lpx_parser::cluster_regions(&region_records);
    lpx_parser::assign_user_names(&mut tracks, &clusters);

    let tracks_registry = lpx_parser::find_track_registry_records(&project_data_bytes);
    lpx_parser::assign_registry_names(&mut tracks, &tracks_registry);

    crate::tlog!(
        "[parse_project] done elapsed={:?} fps={} tracks={} path={path:?}",
        started.elapsed(),
        fingerprints.len(),
        tracks.len(),
    );
    Ok(ProjectSummary {
        fingerprints,
        metadata,
        stats,
        tracks,
        tracks_registry,
    })
}

fn read_required(path: &Path) -> Result<Vec<u8>, ParseError> {
    if !path.is_file() {
        return Err(ParseError::Io(format!(
            "file not found: {}",
            path.display()
        )));
    }
    fs::read(path).map_err(|e| ParseError::Io(e.to_string()))
}

/// Tauri command: `true` when `path` exists and is a directory.
/// Used by the drop-routing logic to distinguish folder drops from
/// stray-file drops without bothering the library store.
#[tauri::command]
pub fn is_dir(path: String) -> bool {
    PathBuf::from(path).is_dir()
}

/// Tauri command: the user's HOME directory as a string, or `None`
/// when the env var is unset (e.g. sandboxed contexts where $HOME is
/// blank). The frontend uses it to build the default-library path
/// `~/Music/Logic` on first launch (lpx-explorer-3mo) — see
/// `App.tsx`'s persistence-hydration effect.
#[tauri::command]
pub fn home_dir() -> Option<String> {
    std::env::var("HOME").ok().filter(|s| !s.is_empty())
}

/// Tauri command: relay a frontend log line to the Rust process's
/// stderr (the `tauri dev` terminal). Avoids the user having to open
/// Web Inspector to see JS-side traces — handy for triage when the
/// renderer is hung.
#[tauri::command]
pub fn log_event(level: String, message: String) {
    crate::tlog!("[js:{level}] {message}");
}

#[derive(Debug, Serialize)]
pub struct ProjectDataStat {
    /// Mtime of the ProjectData file in unix epoch seconds.
    pub mtime_unix: i64,
    /// Size in bytes of the ProjectData file.
    pub size_bytes: u64,
}

/// Cheap stat of `<bundle>/Alternatives/*/ProjectData` — used by the
/// frontend parse cache (lpx-explorer-aay) to decide whether a
/// previously-parsed summary is still valid. Stats *only* the
/// ProjectData file (not the recursive bundle), since that's the
/// single input whose change can alter parse output. Returns None when
/// the bundle has no Alternatives directory or the ProjectData file is
/// missing — callers treat None as "cache miss, parse fresh."
#[tauri::command]
pub fn project_data_stat(path: String) -> Option<ProjectDataStat> {
    let bundle = PathBuf::from(&path);
    let alt = locate_alternative(&bundle)?;
    let meta = fs::metadata(alt.join("ProjectData")).ok()?;
    let mtime_unix = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    Some(ProjectDataStat {
        mtime_unix,
        size_bytes: meta.len(),
    })
}

/// First `<bundle>/Alternatives/<n>/` directory containing ProjectData.
fn locate_alternative(bundle: &Path) -> Option<PathBuf> {
    let alternatives = bundle.join("Alternatives");
    let entries = fs::read_dir(&alternatives).ok()?;
    for entry in entries.flatten() {
        let dir = entry.path();
        if dir.join("ProjectData").is_file() {
            return Some(dir);
        }
    }
    None
}
