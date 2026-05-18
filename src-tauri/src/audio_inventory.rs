//! Audio file inventory for `.logicx` bundles (lpx-explorer-34y).
//!
//! Walks the three well-known audio subdirectories that Logic uses
//! (`Bounces/`, `Audio Files/`, `Freeze Files/`) at the bundle root
//! *and* mirrored under each `Alternatives/<NNN>/`. Returns a flat
//! list — per scope decision, alternatives are not enumerated as
//! separate buckets in v1.
//!
//! Read-only contract: filesystem reads only, never writes.

use std::path::Path;

use serde::Serialize;

/// Logic's three audio storage buckets. Drives the smart-pick fallback
/// chain (Bounce → AudioRegion → FreezeFile) and the UI label that tells
/// the user *what* they're listening to.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum AudioCategory {
    /// `Bounces/` — finished or in-progress mixdowns. The full song.
    Bounce,
    /// `Audio Files/` — raw recorded regions. Unmixed fragments.
    AudioRegion,
    /// `Freeze Files/` — single-track CPU renders.
    FreezeFile,
}

/// One audio file found inside a `.logicx` bundle.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct AudioFile {
    /// Absolute path to the file. Pass through `convertFileSrc` for
    /// `<audio src>` use — the `**/*.logicx/**` asset-protocol scope
    /// covers it.
    pub path: String,
    /// Basename only, for UI labels. `final_mix.wav`, not the full path.
    pub file_name: String,
    pub category: AudioCategory,
    pub size_bytes: u64,
    /// Mtime in unix seconds; 0 when unreadable.
    pub mtime_unix: i64,
    /// `true` when the WebView's HTML5 `<audio>` element can play the
    /// file natively (AIFF/AIF/WAV/MP3/M4A/AAC). `false` for CAF, which
    /// macOS WebKit can't decode — the UI shows the file but disables ▶.
    pub previewable: bool,
}

/// File extensions HTML5 `<audio>` can play on macOS WebKit. Lowercased,
/// no leading dot. CAF deliberately excluded — see `previewable`.
const PLAYABLE_EXTENSIONS: &[&str] = &["aiff", "aif", "wav", "mp3", "m4a", "aac"];

/// All audio extensions we recognise, including those we list but can't
/// preview. CAF is listed so the user sees freeze files exist; rare
/// formats Logic doesn't produce are intentionally absent.
const KNOWN_EXTENSIONS: &[&str] = &["aiff", "aif", "wav", "mp3", "m4a", "aac", "caf"];

fn lowercase_extension(path: &Path) -> Option<String> {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_ascii_lowercase())
}

fn is_known_audio(path: &Path) -> bool {
    match lowercase_extension(path) {
        Some(ext) => KNOWN_EXTENSIONS.iter().any(|k| *k == ext),
        None => false,
    }
}

fn is_previewable(path: &Path) -> bool {
    match lowercase_extension(path) {
        Some(ext) => PLAYABLE_EXTENSIONS.iter().any(|k| *k == ext),
        None => false,
    }
}

/// Walk a single audio bucket directory recursively, returning one
/// `AudioFile` per recognised file. Silent on unreadable entries —
/// we'd rather under-report than fail the whole inventory.
fn walk_bucket(root: &Path, category: AudioCategory, out: &mut Vec<AudioFile>) {
    if !root.is_dir() {
        return;
    }
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let entries = match std::fs::read_dir(&dir) {
            Ok(e) => e,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let file_type = match entry.file_type() {
                Ok(t) => t,
                Err(_) => continue,
            };
            if file_type.is_dir() {
                stack.push(path);
                continue;
            }
            if !file_type.is_file() || !is_known_audio(&path) {
                continue;
            }
            let meta = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };
            let file_name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_owned();
            let mtime_unix = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs() as i64)
                .unwrap_or(0);
            out.push(AudioFile {
                path: path.to_string_lossy().into_owned(),
                file_name,
                category,
                size_bytes: meta.len(),
                mtime_unix,
                previewable: is_previewable(&path),
            });
        }
    }
}

/// Walk all three audio buckets under every known parent inside the
/// bundle. Three parent layouts coexist in the wild:
///   1. Bundle root: `<bundle>/Audio Files/` — older project format.
///   2. `Media/` subdirectory: `<bundle>/Media/Audio Files/` — what
///      modern Logic writes when a project is saved as a package.
///   3. Per-alternative: `<bundle>/Alternatives/<NNN>/Audio Files/`.
/// Flattens per-alternative + per-parent duplicates into the single
/// returned list — callers don't get told which parent a file came
/// from in v1.
pub fn collect_audio(bundle: &Path) -> Vec<AudioFile> {
    let mut files = Vec::new();
    let buckets: [(&str, AudioCategory); 3] = [
        ("Bounces", AudioCategory::Bounce),
        ("Audio Files", AudioCategory::AudioRegion),
        ("Freeze Files", AudioCategory::FreezeFile),
    ];

    let mut parents: Vec<std::path::PathBuf> =
        vec![bundle.to_path_buf(), bundle.join("Media")];
    if let Ok(entries) = std::fs::read_dir(bundle.join("Alternatives")) {
        for entry in entries.flatten() {
            let alt_dir = entry.path();
            if alt_dir.is_dir() {
                parents.push(alt_dir.clone());
                parents.push(alt_dir.join("Media"));
            }
        }
    }

    for parent in &parents {
        for (name, category) in buckets {
            walk_bucket(&parent.join(name), category, &mut files);
        }
    }
    files
}

/// Smart-pick the file that best answers "what does this song sound
/// like?". Preference: Bounce (most recent) → AudioRegion (largest) →
/// FreezeFile (most recent). Within each tier, only `previewable`
/// files are eligible — CAF gets surfaced in the list but never as the
/// hero (the play button would just be disabled). Returns `None` when
/// no previewable file exists in any tier.
pub fn pick_hero(files: &[AudioFile]) -> Option<&AudioFile> {
    fn most_recent<'a>(
        files: &'a [AudioFile],
        category: AudioCategory,
    ) -> Option<&'a AudioFile> {
        files
            .iter()
            .filter(|f| f.category == category && f.previewable)
            .max_by_key(|f| f.mtime_unix)
    }
    fn largest<'a>(files: &'a [AudioFile], category: AudioCategory) -> Option<&'a AudioFile> {
        files
            .iter()
            .filter(|f| f.category == category && f.previewable)
            .max_by_key(|f| f.size_bytes)
    }
    most_recent(files, AudioCategory::Bounce)
        .or_else(|| largest(files, AudioCategory::AudioRegion))
        .or_else(|| most_recent(files, AudioCategory::FreezeFile))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    fn write_file(path: &Path, contents: &[u8]) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("mkdir parent");
        }
        fs::write(path, contents).expect("write");
    }

    #[test]
    fn collect_audio_returns_empty_when_bundle_has_no_audio_subdirs() {
        // A bundle with only ProjectData and no audio subdirectories
        // should yield an empty inventory — the UI surfaces the empty
        // state. No errors, no panic, just zero files.
        let tmp = tempdir().unwrap();
        let bundle = tmp.path().join("empty.logicx");
        write_file(
            &bundle.join("Alternatives/000/ProjectData"),
            b"\x00\x00",
        );

        let files = collect_audio(&bundle);

        assert!(files.is_empty(), "expected empty inventory, got {:?}", files);
    }

    #[test]
    fn collect_audio_finds_bounces_audio_files_freeze_files_at_root() {
        // Verifies the three known buckets at bundle root. Each gets
        // tagged with its category so the UI can label playback.
        let tmp = tempdir().unwrap();
        let bundle = tmp.path().join("song.logicx");
        write_file(&bundle.join("Bounces/final_mix.wav"), b"AAA");
        write_file(&bundle.join("Audio Files/vocal_take.aif"), b"BBBB");
        write_file(&bundle.join("Freeze Files/track_1.caf"), b"CC");

        let files = collect_audio(&bundle);

        assert_eq!(files.len(), 3, "got {:?}", files);
        let categories: Vec<AudioCategory> = files.iter().map(|f| f.category).collect();
        assert!(categories.contains(&AudioCategory::Bounce));
        assert!(categories.contains(&AudioCategory::AudioRegion));
        assert!(categories.contains(&AudioCategory::FreezeFile));
    }

    #[test]
    fn collect_audio_walks_buckets_recursively() {
        // Logic occasionally nests audio files inside per-take or
        // per-instrument subdirectories under the bucket root. We must
        // recurse, not just read the top level.
        let tmp = tempdir().unwrap();
        let bundle = tmp.path().join("song.logicx");
        write_file(
            &bundle.join("Audio Files/Drum Takes/Take 03/kick.wav"),
            b"AAAA",
        );

        let files = collect_audio(&bundle);

        assert_eq!(files.len(), 1);
        assert_eq!(files[0].file_name, "kick.wav");
        assert_eq!(files[0].category, AudioCategory::AudioRegion);
    }

    #[test]
    fn collect_audio_walks_media_subdirectory_for_modern_logic_packages() {
        // Modern Logic (~10.5+) saves package-format projects with
        // recorded audio under <bundle>/Media/Audio Files/, not the
        // bundle root. The walker must look in both spots — older
        // projects use root, newer ones use Media/. Found via testing
        // against ~/Music/Logic/new idea.logicx where a single
        // Monsters Inc acapella file lived in Media/Audio Files/.
        let tmp = tempdir().unwrap();
        let bundle = tmp.path().join("song.logicx");
        write_file(&bundle.join("Media/Audio Files/take.wav"), b"AAA");
        write_file(&bundle.join("Media/Bounces/mix.wav"), b"BBB");

        let files = collect_audio(&bundle);

        assert_eq!(files.len(), 2, "got {:?}", files);
        let names: Vec<&str> = files.iter().map(|f| f.file_name.as_str()).collect();
        assert!(names.contains(&"take.wav"));
        assert!(names.contains(&"mix.wav"));
    }

    #[test]
    fn collect_audio_flattens_per_alternative_buckets() {
        // Per scope decision (2026-05-18): alternatives are flattened.
        // Audio inside Alternatives/<NNN>/Bounces/ appears in the same
        // list as bundle-root Bounces/ with no UI distinction.
        let tmp = tempdir().unwrap();
        let bundle = tmp.path().join("song.logicx");
        write_file(&bundle.join("Bounces/root_mix.wav"), b"AAA");
        write_file(&bundle.join("Alternatives/000/Bounces/alt_mix.wav"), b"BBB");
        write_file(&bundle.join("Alternatives/001/Bounces/v2_mix.wav"), b"CCC");

        let files = collect_audio(&bundle);

        assert_eq!(files.len(), 3, "got {:?}", files);
        let names: Vec<&str> = files.iter().map(|f| f.file_name.as_str()).collect();
        assert!(names.contains(&"root_mix.wav"));
        assert!(names.contains(&"alt_mix.wav"));
        assert!(names.contains(&"v2_mix.wav"));
    }

    #[test]
    fn collect_audio_ignores_non_audio_files() {
        // `Audio Files/` can contain Logic-internal sidecars (e.g.
        // `.peak` files used for waveform caching). They are not
        // audio — must be filtered out.
        let tmp = tempdir().unwrap();
        let bundle = tmp.path().join("song.logicx");
        write_file(&bundle.join("Audio Files/take.wav"), b"AAA");
        write_file(&bundle.join("Audio Files/take.wav.peak"), b"PK");
        write_file(&bundle.join("Audio Files/.DS_Store"), b"DS");

        let files = collect_audio(&bundle);

        assert_eq!(files.len(), 1);
        assert_eq!(files[0].file_name, "take.wav");
    }

    #[test]
    fn collect_audio_marks_caf_as_non_previewable() {
        // CAF is what Freeze Files are written as. macOS WebKit's
        // HTML5 <audio> can't decode it. We still list it (so the
        // inventory is honest) but flag previewable=false so the UI
        // can disable the ▶ button.
        let tmp = tempdir().unwrap();
        let bundle = tmp.path().join("song.logicx");
        write_file(&bundle.join("Freeze Files/track.caf"), b"AAA");
        write_file(&bundle.join("Bounces/mix.wav"), b"BBB");

        let files = collect_audio(&bundle);

        let caf = files.iter().find(|f| f.file_name == "track.caf").unwrap();
        let wav = files.iter().find(|f| f.file_name == "mix.wav").unwrap();
        assert!(!caf.previewable, "CAF must be flagged non-previewable");
        assert!(wav.previewable, "WAV must be flagged previewable");
    }

    #[test]
    fn pick_hero_prefers_most_recent_bounce_over_audio_files() {
        // Bounces win the smart-pick tier ranking unconditionally.
        // Within Bounces, the most recent file wins — that's the
        // version of the song the user last touched.
        let tmp = tempdir().unwrap();
        let bundle = tmp.path().join("song.logicx");
        write_file(&bundle.join("Audio Files/take_huge.wav"), &vec![0u8; 10_000]);
        write_file(&bundle.join("Bounces/old_mix.wav"), b"AA");
        // Sleep just enough to guarantee a later mtime — on the macOS
        // filesystems this lands on, 1.1s is comfortably above HFS's
        // 1-second mtime granularity.
        std::thread::sleep(std::time::Duration::from_millis(1100));
        write_file(&bundle.join("Bounces/new_mix.wav"), b"BB");

        let files = collect_audio(&bundle);
        let hero = pick_hero(&files).expect("expected a hero pick");

        assert_eq!(hero.category, AudioCategory::Bounce);
        assert_eq!(hero.file_name, "new_mix.wav");
    }

    #[test]
    fn pick_hero_falls_back_to_largest_audio_region_when_no_bounces() {
        // No Bounces folder at all. The largest Audio Files entry is
        // the best fallback — likely the lead vocal take or longest
        // performance, not a fragment.
        let tmp = tempdir().unwrap();
        let bundle = tmp.path().join("song.logicx");
        write_file(&bundle.join("Audio Files/snippet.wav"), b"AA");
        write_file(&bundle.join("Audio Files/full_take.wav"), &vec![0u8; 5_000]);

        let files = collect_audio(&bundle);
        let hero = pick_hero(&files).expect("expected a hero pick");

        assert_eq!(hero.category, AudioCategory::AudioRegion);
        assert_eq!(hero.file_name, "full_take.wav");
    }

    #[test]
    fn pick_hero_skips_caf_freeze_files_when_no_previewable_files_exist() {
        // CAF freeze files can't be played in WebView. If they're the
        // only audio in the bundle, there's no hero — UI shows the
        // empty/disabled state. Returning None forces honest UX.
        let tmp = tempdir().unwrap();
        let bundle = tmp.path().join("song.logicx");
        write_file(&bundle.join("Freeze Files/track_a.caf"), b"AA");
        write_file(&bundle.join("Freeze Files/track_b.caf"), b"BB");

        let files = collect_audio(&bundle);
        let hero = pick_hero(&files);

        assert!(hero.is_none(), "no previewable files → no hero");
        assert_eq!(files.len(), 2, "but the files are still listed");
    }
}
