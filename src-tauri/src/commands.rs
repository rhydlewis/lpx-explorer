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

/// Tauri command return shape for `list_alternatives`. Combines the
/// bytes-only `lpx_parser::Alternative` with filesystem-derived data
/// (the path to `WindowImage.jpg` if Logic wrote one). Denormalized
/// rather than wrapping so frontend JSON stays flat and Rust call sites
/// keep `entry.display_name` style access.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct AlternativeEntry {
    pub index: u32,
    pub display_name: String,
    pub is_active: bool,
    pub window_image_path: Option<String>,
    /// Mtime of `<bundle>/Alternatives/<NNN>/ProjectData` in unix
    /// seconds. 0 when the file is missing or mtime is unreadable —
    /// callers treat 0 as "unknown" and render a fallback caption.
    pub last_saved_unix: i64,
}

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
pub fn list_alternatives(path: String) -> Vec<AlternativeEntry> {
    let bundle = PathBuf::from(&path);
    let bundle_name = bundle_basename(&bundle);
    let manifest_path = bundle.join("Resources").join("ProjectInformation.plist");

    let parsed: Vec<Alternative> = if let Ok(bytes) = fs::read(&manifest_path) {
        match lpx_parser::parse_alternatives_manifest(&bytes, &bundle_name) {
            Ok(alts) if !alts.is_empty() => alts,
            _ => Vec::new(),
        }
    } else {
        Vec::new()
    };

    let parsed = if parsed.is_empty() && locate_alternative(&bundle).is_some() {
        // No (or invalid) manifest: synthesize a single entry from
        // Alternatives/000/. If even that's missing, return empty.
        vec![Alternative {
            index: 0,
            display_name: bundle_name,
            is_active: true,
        }]
    } else {
        parsed
    };

    parsed
        .into_iter()
        .map(|alt| {
            let window_image_path = window_image_for(&bundle, alt.index);
            let last_saved_unix = last_saved_for(&bundle, alt.index);
            AlternativeEntry {
                index: alt.index,
                display_name: alt.display_name,
                is_active: alt.is_active,
                window_image_path,
                last_saved_unix,
            }
        })
        .collect()
}

/// Mtime of `<bundle>/Alternatives/<index:03>/ProjectData` in unix
/// seconds, or 0 when the file is missing or mtime is unreadable.
fn last_saved_for(bundle: &Path, index: u32) -> i64 {
    let path = bundle
        .join("Alternatives")
        .join(format!("{index:03}"))
        .join("ProjectData");
    fs::metadata(&path)
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// Returns the path to `<bundle>/Alternatives/<index:03>/WindowImage.jpg`
/// as a string when the file exists. Logic writes this screenshot on save
/// (recent versions only — projects last saved in older Logic versions
/// won't have it). Returns None for missing files; callers render a
/// placeholder rather than an error.
fn window_image_for(bundle: &Path, index: u32) -> Option<String> {
    let path = bundle
        .join("Alternatives")
        .join(format!("{index:03}"))
        .join("WindowImage.jpg");
    if path.is_file() {
        Some(path.to_string_lossy().into_owned())
    } else {
        None
    }
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
    fn list_alternatives_includes_last_saved_unix_from_project_data_mtime() {
        // Each alternative's last-saved time = mtime of its ProjectData
        // file. The frontend renders this as a relative-time caption
        // under each AlternativeStrip thumbnail so users can tell which
        // alternative they last touched.
        let tmp = tempdir().unwrap();
        let bundle = tmp.path().join("song.logicx");
        write_alternative(&bundle, 0, b"\x00\x00");

        let alts = list_alternatives(bundle.to_string_lossy().into_owned());

        assert_eq!(alts.len(), 1);
        let mtime = fs::metadata(bundle.join("Alternatives/000/ProjectData"))
            .unwrap()
            .modified()
            .unwrap()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        assert_eq!(alts[0].last_saved_unix, mtime);
    }

    #[test]
    fn list_alternatives_includes_window_image_path_when_present() {
        // Logic writes a screenshot of the main window to each alternative
        // on save: <bundle>/Alternatives/<NNN>/WindowImage.jpg. Surface it
        // in the entry so the frontend can render the recognition hero.
        let tmp = tempdir().unwrap();
        let bundle = tmp.path().join("song.logicx");
        write_alternative(&bundle, 0, b"\x00\x00");
        let image_path = bundle.join("Alternatives/000/WindowImage.jpg");
        fs::write(&image_path, b"fake-jpeg-bytes").unwrap();

        let alts = list_alternatives(bundle.to_string_lossy().into_owned());

        assert_eq!(alts.len(), 1);
        assert_eq!(
            alts[0].window_image_path.as_deref(),
            Some(image_path.to_string_lossy().as_ref()),
        );
    }

    #[test]
    fn list_alternatives_window_image_path_is_none_when_file_missing() {
        // Older Logic versions / projects never re-opened in recent Logic
        // don't have WindowImage.jpg at all. None signals 'render placeholder'.
        let tmp = tempdir().unwrap();
        let bundle = tmp.path().join("old.logicx");
        write_alternative(&bundle, 0, b"\x00\x00");

        let alts = list_alternatives(bundle.to_string_lossy().into_owned());

        assert_eq!(alts.len(), 1);
        assert!(alts[0].window_image_path.is_none());
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

    // ─── Read-only invariant (command-layer e2e) ───────────────────────
    //
    // Snapshots SHA-256 + mtime of every file in a synthesized .logicx
    // bundle before and after parse_project. Catches command-layer file
    // handling regressions that the parser-level readonly_invariant test
    // (in crates/lpx-parser/tests/) cannot — anything between fs::read
    // and the parser would slip past a bytes-only-API test.

    use sha2::{Digest, Sha256};
    use std::time::SystemTime;

    fn xml_plist_bytes(body: &str) -> Vec<u8> {
        xml_plist(body).into_bytes()
    }

    /// Walk every file under `root` and return (path, sha256, mtime)
    /// triples sorted by path. Sort makes the before/after vectors
    /// directly comparable.
    fn snapshot_bundle(root: &Path) -> Vec<(PathBuf, String, SystemTime)> {
        let mut out = Vec::new();
        let mut stack = vec![root.to_path_buf()];
        while let Some(dir) = stack.pop() {
            for entry in fs::read_dir(&dir).expect("read_dir").flatten() {
                let path = entry.path();
                let ft = entry.file_type().expect("file_type");
                if ft.is_dir() {
                    stack.push(path);
                } else if ft.is_file() {
                    let bytes = fs::read(&path).expect("read");
                    let mut hasher = Sha256::new();
                    hasher.update(&bytes);
                    let sha = format!("{:x}", hasher.finalize());
                    let mtime = fs::metadata(&path).unwrap().modified().unwrap();
                    out.push((path, sha, mtime));
                }
            }
        }
        out.sort_by(|a, b| a.0.cmp(&b.0));
        out
    }

    #[test]
    fn parse_project_does_not_mutate_any_file_in_the_bundle() {
        let tmp = tempdir().unwrap();
        let bundle = tmp.path().join("My Project.logicx");

        // ProjectData with bytes shaped to hit every parser branch
        // exercised by parse_project: find_aus, find_tracks,
        // find_region_records, find_track_registry_records.
        let mut project_data: Vec<u8> = vec![0u8; 8];
        // Track record: 0x20 + "Audio 1" + NUL pad + audio descriptor.
        project_data.push(0x20);
        project_data.extend_from_slice(b"Audio 1");
        while project_data.len() < 8 + 16 {
            project_data.push(0x00);
        }
        project_data.extend_from_slice(&[0xAB, 0x00, 0x00, 0xC5, 0x00, 0x00, 0x00, 0x00]);
        // AU descriptor: nooT umua + 4-byte subtype.
        project_data.extend_from_slice(b"PADDING_");
        project_data.extend_from_slice(b"nooT");
        project_data.extend_from_slice(b"umua");
        project_data.extend_from_slice(b"2kZE");
        // Region marker + length-prefixed name.
        project_data.extend_from_slice(&[
            0x61, 0xff, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        ]);
        let region_name = b"Acoustic GTR";
        project_data.extend_from_slice(&(region_name.len() as u16).to_le_bytes());
        project_data.extend_from_slice(region_name);

        write_alternative(&bundle, 0, &project_data);
        fs::write(
            bundle.join("Alternatives/000/MetaData.plist"),
            xml_plist_bytes(
                "<key>SongKey</key><string>C</string>\
                 <key>BeatsPerMinute</key><real>120.0</real>\
                 <key>NumberOfTracks</key><integer>1</integer>",
            ),
        )
        .unwrap();
        // Sibling files that aren't read by parse_project but live
        // inside the bundle — a regression that touched anything in the
        // tree (e.g. a stray write to WindowImage during stat) needs to
        // fail this test.
        fs::write(
            bundle.join("Alternatives/000/WindowImage.jpg"),
            b"fake-jpeg-bytes",
        )
        .unwrap();
        write_manifest(
            &bundle,
            &xml_plist(
                r#"<key>VariantNames</key><dict>
                     <key>0</key><string>main</string>
                   </dict>"#,
            ),
        );

        let before = snapshot_bundle(&bundle);
        assert!(!before.is_empty(), "fixture bundle must contain files");

        let summary = parse_project(bundle.to_string_lossy().into_owned())
            .expect("parse_project must succeed against a valid synthetic bundle");
        // Sanity: the parser actually ran against the planted bytes.
        assert_eq!(summary.fingerprints.len(), 1);
        assert_eq!(summary.tracks.len(), 1);

        let after = snapshot_bundle(&bundle);

        assert_eq!(
            before.len(),
            after.len(),
            "parse_project changed the file count in the bundle"
        );
        for ((p1, s1, m1), (p2, s2, m2)) in before.iter().zip(after.iter()) {
            assert_eq!(p1, p2, "file set changed");
            assert_eq!(
                s1,
                s2,
                "parse_project altered SHA-256 of {} — read-only contract violated",
                p1.display()
            );
            assert_eq!(
                m1,
                m2,
                "parse_project altered mtime of {} — read-only contract violated",
                p1.display()
            );
        }
    }
}
