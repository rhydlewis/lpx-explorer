//! Non-negotiable contract test: parsing a `ProjectData` blob must not
//! mutate the source file. `.logicx` projects are irreplaceable user
//! work; any byte change here is a P0 bug.
//!
//! Mirrors `lpx-toolkit/tests/test_readonly_invariant.py`. The Python
//! tool guards this with a SHA-256 + mtime snapshot before/after
//! `parse_project()`. We snapshot before/after `find_aus` here.
//!
//! `find_aus` takes `&[u8]`, so by construction it cannot open a file
//! at all — but this test is the *contract gate*. If anyone ever
//! refactors the API to take a path (or a future parser surface does),
//! this test must keep passing.

use std::fs;
use std::time::SystemTime;

use sha2::{Digest, Sha256};

fn sha256_of(path: &std::path::Path) -> String {
    let bytes = fs::read(path).expect("read fixture");
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    format!("{:x}", hasher.finalize())
}

fn mtime_of(path: &std::path::Path) -> SystemTime {
    fs::metadata(path)
        .expect("metadata")
        .modified()
        .expect("mtime")
}

#[test]
fn find_aus_does_not_mutate_source_file() {
    let dir = tempfile::tempdir().expect("tempdir");
    let fixture_path = dir.path().join("ProjectData");

    // Plant a known AU descriptor so the parser has something to find —
    // matches the layout of `single_descriptor_fixture` in the unit
    // tests but read off disk.
    let mut fixture: Vec<u8> = Vec::new();
    fixture.extend_from_slice(b"PADDING_");
    fixture.extend_from_slice(b"nooT");
    fixture.extend_from_slice(b"umua");
    fixture.extend_from_slice(b"2kZE");
    fs::write(&fixture_path, &fixture).expect("write fixture");

    let sha_before = sha256_of(&fixture_path);
    let mtime_before = mtime_of(&fixture_path);

    let bytes = fs::read(&fixture_path).expect("read");
    let found = lpx_parser::find_aus(&bytes);
    assert_eq!(
        found.len(),
        1,
        "sanity: parser must find the planted descriptor"
    );

    let sha_after = sha256_of(&fixture_path);
    let mtime_after = mtime_of(&fixture_path);

    assert_eq!(
        sha_before, sha_after,
        "find_aus altered the source file's SHA-256 — read-only contract violated"
    );
    assert_eq!(
        mtime_before, mtime_after,
        "find_aus altered the source file's mtime — read-only contract violated"
    );
}
