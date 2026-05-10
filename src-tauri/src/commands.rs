//! Tauri command surface for the walking skeleton.
//!
//! Locates `<bundle>/Alternatives/*/ProjectData` + `MetaData.plist`, reads
//! their bytes, and runs them through the bytes-only `lpx-parser`. Bundle
//! filesystem stats (size + dates) come from `crate::bundle`.

use std::fs;
use std::path::{Path, PathBuf};

use lpx_parser::{AURef, Alternative, ProjectMetadata, Track, TrackRegistryEntry};
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

/// Bundle basename without the `.logicx` extension. Used as the
/// substitution value for `{PROJECT_NAME}` in `VariantNamesV2` entries.
fn bundle_basename(bundle: &Path) -> String {
    let raw = bundle
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("");
    raw.strip_suffix(".logicx").unwrap_or(raw).to_owned()
}

/// List the alternatives inside a `.logicx` bundle (lpx-explorer-unl).
///
/// Reads `<bundle>/Resources/ProjectInformation.plist` and returns one
/// entry per variant. Single-variant projects without a manifest fall
/// back to a synthetic `[Alternative { 0, bundle_name, true }]` so
/// callers don't need to special-case the absence of the plist.
///
/// Returns an empty vec when the bundle has no alternatives at all
/// (no manifest AND no `Alternatives/000/ProjectData`) — caller can
/// surface that as 'unparseable bundle'.
#[tauri::command]
pub fn list_alternatives(path: String) -> Vec<Alternative> {
    let bundle = PathBuf::from(&path);
    let bundle_name = bundle_basename(&bundle);
    let manifest_path = bundle.join("Resources").join("ProjectInformation.plist");

    if let Ok(bytes) = fs::read(&manifest_path) {
        if let Ok(alts) = lpx_parser::parse_alternatives_manifest(&bytes, &bundle_name) {
            if !alts.is_empty() {
                return alts;
            }
        }
    }

    // No (or invalid) manifest: synthesize a single entry from
    // Alternatives/000/. If even that's missing, return empty.
    if locate_alternative(&bundle).is_some() {
        return vec![Alternative {
            index: 0,
            display_name: bundle_name,
            is_active: true,
        }];
    }
    Vec::new()
}

/// Parse a specific alternative inside a `.logicx` bundle
/// (lpx-explorer-unl). Same pipeline as `parse_project`, but reads
/// `Alternatives/{index:03}/` instead of always-`000`. The frontend
/// calls this once it knows which variant to load (default: the
/// `is_active` entry from `list_alternatives`).
#[tauri::command]
pub fn parse_alternative(
    path: String,
    variant_index: u32,
) -> Result<ProjectSummary, ParseError> {
    let started = std::time::Instant::now();
    crate::tlog!(
        "[parse_alternative] start path={path:?} variant={variant_index}"
    );

    let bundle = PathBuf::from(&path);
    let alt = bundle
        .join("Alternatives")
        .join(format!("{variant_index:03}"));
    if !alt.join("ProjectData").is_file() {
        crate::tlog!(
            "[parse_alternative] FAIL no ProjectData path={path:?} variant={variant_index}"
        );
        return Err(ParseError::ProjectDataMissing(path.clone()));
    }

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
        "[parse_alternative] done elapsed={:?} variant={variant_index} fps={} tracks={} path={path:?}",
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

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn write_manifest(bundle: &Path, contents: &str) {
        fs::create_dir_all(bundle.join("Resources")).unwrap();
        fs::write(bundle.join("Resources/ProjectInformation.plist"), contents).unwrap();
    }

    fn write_alternative(bundle: &Path, index: u32, project_data: &[u8]) {
        let dir = bundle.join("Alternatives").join(format!("{index:03}"));
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("ProjectData"), project_data).unwrap();
    }

    fn xml_plist(body: &str) -> String {
        format!(
            "<?xml version=\"1.0\"?>\n\
             <plist version=\"1.0\"><dict>{body}</dict></plist>"
        )
    }

    #[test]
    fn list_alternatives_reads_manifest_and_resolves_placeholder() {
        let tmp = tempdir().unwrap();
        let bundle = tmp.path().join("new idea.logicx");
        fs::create_dir_all(&bundle).unwrap();
        write_manifest(
            &bundle,
            &xml_plist(
                r#"<key>ActiveVariant</key><integer>1</integer>
                   <key>VariantNamesV2</key><dict>
                     <key>0</key><string>{PROJECT_NAME}</string>
                     <key>1</key><string>{PROJECT_NAME} - alt 1</string>
                   </dict>"#,
            ),
        );

        let alts = list_alternatives(bundle.to_string_lossy().into_owned());

        assert_eq!(alts.len(), 2);
        assert_eq!(alts[0].display_name, "new idea");
        assert_eq!(alts[1].display_name, "new idea - alt 1");
        assert!(!alts[0].is_active);
        assert!(alts[1].is_active);
    }

    #[test]
    fn list_alternatives_falls_back_to_synthetic_entry_when_manifest_is_absent() {
        // Bundle has Alternatives/000/ but no ProjectInformation.plist.
        // Mirrors very old Logic projects that lack the manifest.
        let tmp = tempdir().unwrap();
        let bundle = tmp.path().join("old project.logicx");
        write_alternative(&bundle, 0, b"\x00\x00");

        let alts = list_alternatives(bundle.to_string_lossy().into_owned());

        assert_eq!(alts.len(), 1);
        assert_eq!(alts[0].index, 0);
        assert_eq!(alts[0].display_name, "old project");
        assert!(alts[0].is_active);
    }

    #[test]
    fn list_alternatives_returns_empty_when_bundle_has_no_alternatives_directory() {
        let tmp = tempdir().unwrap();
        let bundle = tmp.path().join("empty.logicx");
        fs::create_dir_all(&bundle).unwrap();

        let alts = list_alternatives(bundle.to_string_lossy().into_owned());

        assert!(alts.is_empty());
    }

    #[test]
    fn list_alternatives_strips_logicx_suffix_for_placeholder_substitution() {
        let tmp = tempdir().unwrap();
        let bundle = tmp.path().join("Drum Loops.logicx");
        write_manifest(
            &bundle,
            &xml_plist(
                r#"<key>VariantNamesV2</key><dict>
                     <key>0</key><string>{PROJECT_NAME} live</string>
                   </dict>"#,
            ),
        );

        let alts = list_alternatives(bundle.to_string_lossy().into_owned());

        assert_eq!(alts[0].display_name, "Drum Loops live");
    }

    #[test]
    fn parse_alternative_reads_the_correct_zero_padded_subdirectory() {
        let tmp = tempdir().unwrap();
        let bundle = tmp.path().join("song.logicx");
        // Variant 5 → "005".
        let dir = bundle.join("Alternatives/005");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("ProjectData"), b"").unwrap();
        fs::write(
            dir.join("MetaData.plist"),
            xml_plist(r#"<key>BeatsPerMinute</key><real>120.0</real>"#),
        )
        .unwrap();

        let result = parse_alternative(bundle.to_string_lossy().into_owned(), 5);

        let summary = result.expect("ok");
        assert_eq!(summary.metadata.bpm, 120.0);
    }

    #[test]
    fn parse_alternative_returns_project_data_missing_for_unknown_variant() {
        let tmp = tempdir().unwrap();
        let bundle = tmp.path().join("song.logicx");
        write_alternative(&bundle, 0, b"");

        let err = parse_alternative(bundle.to_string_lossy().into_owned(), 7).unwrap_err();

        assert!(matches!(err, ParseError::ProjectDataMissing(_)));
    }
}
