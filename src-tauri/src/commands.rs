//! Tauri command surface for the walking skeleton.
//!
//! Locates `<bundle>/Alternatives/*/ProjectData` for a `.logicx` path,
//! reads its bytes, and runs them through `lpx_parser::find_aus`. The
//! crate stays bytes-only per the architecture decision in
//! `docs/decisions.md` — path-walking lives here at the IPC boundary.

use std::fs;
use std::path::{Path, PathBuf};

use lpx_parser::AURef;
use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Serialize)]
pub struct ProjectSummary {
    pub fingerprints: Vec<AURef>,
}

#[derive(Debug, Error, Serialize)]
#[serde(tag = "kind", content = "message")]
pub enum ParseError {
    #[error("ProjectData not found inside bundle at {0}")]
    ProjectDataMissing(String),
    #[error("failed to read ProjectData: {0}")]
    Io(String),
}

#[tauri::command]
pub fn parse_project(path: String) -> Result<ProjectSummary, ParseError> {
    let bundle = PathBuf::from(&path);
    let project_data = locate_project_data(&bundle)
        .ok_or_else(|| ParseError::ProjectDataMissing(path.clone()))?;
    let bytes = fs::read(&project_data).map_err(|e| ParseError::Io(e.to_string()))?;
    let fingerprints = lpx_parser::find_aus(&bytes);
    Ok(ProjectSummary { fingerprints })
}

/// Walk `<bundle>/Alternatives/*/ProjectData` and return the first match.
/// Logic always stores at least one alternative; multi-alternative
/// projects are out of scope for the walking skeleton.
fn locate_project_data(bundle: &Path) -> Option<PathBuf> {
    let alternatives = bundle.join("Alternatives");
    let entries = fs::read_dir(&alternatives).ok()?;
    for entry in entries.flatten() {
        let candidate = entry.path().join("ProjectData");
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}
