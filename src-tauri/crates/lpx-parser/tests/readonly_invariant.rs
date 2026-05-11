//! Non-negotiable contract test: parsing a `ProjectData` blob (or any
//! `.logicx` bundle file) must not mutate the source. `.logicx`
//! projects are irreplaceable user work; any byte change here is a P0
//! bug.
//!
//! Each public parser entry point gets its own subtest: plant a
//! minimum-viable fixture in a tempdir, snapshot SHA-256 + mtime, call
//! the parser via `fs::read`, then assert nothing changed. The bytes-
//! only signature already makes file mutation impossible by
//! construction — these tests are the contract gate that catches a
//! future API refactor (or a misbehaved test helper) before it ships.
//!
//! Mirrors `lpx-toolkit/tests/test_readonly_invariant.py`.

use std::fs;
use std::path::Path;
use std::time::SystemTime;

use sha2::{Digest, Sha256};

fn sha256_of(path: &Path) -> String {
    let bytes = fs::read(path).expect("read fixture");
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    format!("{:x}", hasher.finalize())
}

fn mtime_of(path: &Path) -> SystemTime {
    fs::metadata(path)
        .expect("metadata")
        .modified()
        .expect("mtime")
}

/// Snapshot SHA-256 + mtime around `action`, asserting both are
/// unchanged. The closure receives the fixture path so it can read
/// bytes and call whichever parser is under test.
fn assert_readonly_around(path: &Path, action: impl FnOnce(&Path)) {
    let sha_before = sha256_of(path);
    let mtime_before = mtime_of(path);

    action(path);

    let sha_after = sha256_of(path);
    let mtime_after = mtime_of(path);

    assert_eq!(
        sha_before, sha_after,
        "parser altered the source file's SHA-256 — read-only contract violated"
    );
    assert_eq!(
        mtime_before, mtime_after,
        "parser altered the source file's mtime — read-only contract violated"
    );
}

fn write_fixture(name: &str, bytes: &[u8]) -> (tempfile::TempDir, std::path::PathBuf) {
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join(name);
    fs::write(&path, bytes).expect("write fixture");
    (dir, path)
}

fn xml_plist(body: &str) -> Vec<u8> {
    format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\
         <!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \
         \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">\n\
         <plist version=\"1.0\"><dict>{body}</dict></plist>"
    )
    .into_bytes()
}

#[test]
fn find_aus_does_not_mutate_source_file() {
    // Plant a known AU descriptor so the parser has something to find —
    // matches the layout of `single_descriptor_fixture` in the unit
    // tests but read off disk.
    let mut fixture: Vec<u8> = Vec::new();
    fixture.extend_from_slice(b"PADDING_");
    fixture.extend_from_slice(b"nooT");
    fixture.extend_from_slice(b"umua");
    fixture.extend_from_slice(b"2kZE");

    let (_dir, path) = write_fixture("ProjectData", &fixture);

    assert_readonly_around(&path, |p| {
        let bytes = fs::read(p).expect("read");
        let found = lpx_parser::find_aus(&bytes);
        assert_eq!(found.len(), 1, "sanity: parser must find the planted descriptor");
    });
}

#[test]
fn parse_metadata_plist_does_not_mutate_source_file() {
    let fixture = xml_plist(
        "<key>SongKey</key><string>C</string>\
         <key>BeatsPerMinute</key><real>120.0</real>\
         <key>NumberOfTracks</key><integer>3</integer>",
    );
    let (_dir, path) = write_fixture("MetaData.plist", &fixture);

    assert_readonly_around(&path, |p| {
        let bytes = fs::read(p).expect("read");
        let meta = lpx_parser::parse_metadata_plist(&bytes).expect("ok");
        assert_eq!(meta.song_key, "C", "sanity: parser must extract the planted key");
    });
}

#[test]
fn find_tracks_does_not_mutate_source_file() {
    // 8-byte NUL preamble (so the 0x20 marker has a NUL behind it),
    // followed by a 16-byte name field + 8-byte descriptor that hits
    // the `Audio` classification (head=0xAB, final byte 0xC5).
    let mut fixture: Vec<u8> = vec![0u8; 8];
    fixture.push(0x20);
    fixture.extend_from_slice(b"Audio 1");
    while fixture.len() < 8 + 16 {
        fixture.push(0x00);
    }
    fixture.extend_from_slice(&[0xAB, 0x00, 0x00, 0xC5, 0x00, 0x00, 0x00, 0x00]);

    let (_dir, path) = write_fixture("ProjectData", &fixture);

    assert_readonly_around(&path, |p| {
        let bytes = fs::read(p).expect("read");
        let tracks = lpx_parser::find_tracks(&bytes);
        assert_eq!(tracks.len(), 1, "sanity: parser must find the planted track");
    });
}

#[test]
fn find_region_records_does_not_mutate_source_file() {
    // Region marker (0x61 0xff + 24 NULs) + uint16-LE length + ascii
    // name. Mirrors the format in regions.rs.
    let name = b"Acoustic GTR";
    let mut fixture: Vec<u8> = Vec::new();
    fixture.extend_from_slice(&[
        0x61, 0xff, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]);
    fixture.extend_from_slice(&(name.len() as u16).to_le_bytes());
    fixture.extend_from_slice(name);

    let (_dir, path) = write_fixture("ProjectData", &fixture);

    assert_readonly_around(&path, |p| {
        let bytes = fs::read(p).expect("read");
        let records = lpx_parser::find_region_records(&bytes);
        assert_eq!(records.len(), 1, "sanity: parser must find the planted region");
    });
}

#[test]
fn find_track_registry_records_does_not_mutate_source_file() {
    // Preamble: 4 zeros + 2-byte signature + 4 zeros + 2 control bytes
    // + 2 zeros = 14 bytes. Then uint16-LE length (high byte must be 0)
    // + ASCII name. Signature 0x22 0x12 picks the Instrument kind.
    let name = b"Piano";
    let mut fixture: Vec<u8> = vec![0u8; 4];
    fixture.extend_from_slice(&[0x22, 0x12]);
    fixture.extend_from_slice(&[0u8; 4]);
    fixture.extend_from_slice(&[0x00, 0x00]); // control bytes (don't care)
    fixture.extend_from_slice(&[0u8; 2]);
    fixture.push(name.len() as u8);
    fixture.push(0x00);
    fixture.extend_from_slice(name);

    let (_dir, path) = write_fixture("ProjectData", &fixture);

    assert_readonly_around(&path, |p| {
        let bytes = fs::read(p).expect("read");
        let _records = lpx_parser::find_track_registry_records(&bytes);
        // The registry layout has subtleties (track-link preamble,
        // noise-name filtering) that make a sanity assertion on the
        // result count brittle. The readonly assertion is the contract
        // gate here — the parser ran to completion against on-disk
        // bytes without mutating them, which is the only invariant we
        // need to prove.
    });
}

#[test]
fn parse_alternatives_manifest_does_not_mutate_source_file() {
    let fixture = xml_plist(
        r#"<key>ActiveVariant</key><integer>0</integer>
           <key>VariantNames</key><dict>
             <key>0</key><string>main</string>
           </dict>"#,
    );
    let (_dir, path) = write_fixture("ProjectInformation.plist", &fixture);

    assert_readonly_around(&path, |p| {
        let bytes = fs::read(p).expect("read");
        let alts = lpx_parser::parse_alternatives_manifest(&bytes, "main").expect("ok");
        assert_eq!(alts.len(), 1, "sanity: parser must find the planted variant");
        assert_eq!(alts[0].display_name, "main");
    });
}
