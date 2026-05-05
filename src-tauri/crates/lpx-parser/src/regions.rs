//! Region-record scanner — recovers user-given track names that live
//! in audio region (`gRuA`) blocks rather than in channel-strip
//! records.
//!
//! Each region record carries:
//!   `<4-byte id> 0x61 0xff <24 zeros> <uint16-LE length> <ascii name>`
//!
//! When a user renames "Audio 3" → "Acoustic GTR" in Logic, the new
//! name lives in the region records, not in `find_tracks`'s output —
//! `find_tracks` keeps reporting "Audio 3" because the channel-strip
//! record never updates. Mirrors the Python implementation in
//! `lpx-toolkit/lpx_inspect.py:677-693, 402-431, 205-223`.

use serde::Serialize;

const REGION_NAME_MAX_LEN: usize = 200;
// `\x61\xff` followed by 24 NUL bytes — the marker preceding a region's
// length-prefixed name.
const REGION_MARKER: &[u8] = &[
    0x61, 0xff, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
];

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct RegionRecord {
    pub offset: usize,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct RegionCluster {
    pub base_name: String,
    pub first_offset: usize,
    pub last_offset: usize,
    pub count: u32,
}

/// Scan `raw` for region records: `0x61 0xff` + 24 NULs + uint16-LE
/// length + ascii name.
pub fn find_region_records(raw: &[u8]) -> Vec<RegionRecord> {
    let mut out = Vec::new();
    let mut i = 0;
    while i + REGION_MARKER.len() + 2 <= raw.len() {
        if raw[i..i + REGION_MARKER.len()] != *REGION_MARKER {
            i += 1;
            continue;
        }
        let len_off = i + REGION_MARKER.len();
        let length = u16::from_le_bytes([raw[len_off], raw[len_off + 1]]) as usize;
        if length == 0 || length > REGION_NAME_MAX_LEN {
            i += 1;
            continue;
        }
        let name_off = len_off + 2;
        if name_off + length > raw.len() {
            i += 1;
            continue;
        }
        let name_bytes = &raw[name_off..name_off + length];
        if !name_bytes.iter().all(|&b| (0x20..0x7f).contains(&b)) {
            i += 1;
            continue;
        }
        let name = match std::str::from_utf8(name_bytes) {
            Ok(s) => s.to_owned(),
            Err(_) => {
                i += 1;
                continue;
            }
        };
        out.push(RegionRecord { offset: i, name });
        // Advance past this record so we don't re-enter inside the name bytes.
        i = name_off + length;
    }
    out
}

/// Strip take/comp/numeric suffixes Logic appends to region names.
/// Iterates until no pattern matches — handles e.g. "Vocal: Take 14.1"
/// → "Vocal: Take 14" → "Vocal" via two passes.
fn strip_region_suffixes(name: &str) -> String {
    let mut current = name.trim_end().to_owned();
    loop {
        let before = current.clone();
        current = strip_one_pass(&current);
        if current == before {
            return current;
        }
    }
}

fn strip_one_pass(name: &str) -> String {
    let mut s = name;
    // ": Comp A", ": Comp A.1"
    if let Some(pos) = find_comp_tag(s) {
        s = &s[..pos];
    }
    // ": Take 14", ": Take 14.1"
    if let Some(pos) = find_colon_take(s) {
        s = &s[..pos];
    }
    // " - Take 14"
    if let Some(pos) = find_dash_take(s) {
        s = &s[..pos];
    }
    // " #06", " #08.2"
    if let Some(pos) = find_hash_number(s) {
        s = &s[..pos];
    }
    // ".1", ".2" — trailing numeric duplicate
    if let Some(pos) = find_trailing_dot_number(s) {
        s = &s[..pos];
    }
    s.trim_end().to_owned()
}

fn find_comp_tag(s: &str) -> Option<usize> {
    let pos = s.rfind(": Comp ")?;
    let tail = &s[pos + ": Comp ".len()..];
    if tail.is_empty() {
        return None;
    }
    let bytes = tail.as_bytes();
    if !bytes[0].is_ascii_alphanumeric() {
        return None;
    }
    if bytes
        .iter()
        .all(|&b| b.is_ascii_alphanumeric() || b == b'.')
    {
        Some(pos)
    } else {
        None
    }
}

fn find_colon_take(s: &str) -> Option<usize> {
    let pos = s.rfind(": Take ")?;
    let tail = &s[pos + ": Take ".len()..];
    if tail.is_empty() {
        return None;
    }
    if tail.bytes().all(|b| b.is_ascii_digit() || b == b'.') {
        Some(pos)
    } else {
        None
    }
}

fn find_dash_take(s: &str) -> Option<usize> {
    let pos = s.rfind(" - Take ")?;
    let tail = &s[pos + " - Take ".len()..];
    if tail.is_empty() {
        return None;
    }
    if tail.bytes().all(|b| b.is_ascii_digit() || b == b'.') {
        Some(pos)
    } else {
        None
    }
}

fn find_hash_number(s: &str) -> Option<usize> {
    let pos = s.rfind(" #")?;
    let tail = &s[pos + 2..];
    if tail.is_empty() {
        return None;
    }
    if tail.bytes().all(|b| b.is_ascii_digit() || b == b'.') {
        Some(pos)
    } else {
        None
    }
}

fn find_trailing_dot_number(s: &str) -> Option<usize> {
    let pos = s.rfind('.')?;
    let tail = &s[pos + 1..];
    if tail.is_empty() {
        return None;
    }
    if tail.bytes().all(|b| b.is_ascii_digit()) {
        Some(pos)
    } else {
        None
    }
}

fn is_user_track_name(name: &str) -> bool {
    if name.is_empty() {
        return false;
    }
    if is_bare_comp_tag(name) {
        return false;
    }
    if has_recording_filename_suffix(name) {
        return false;
    }
    true
}

/// `true` when `name` matches Logic's default channel-strip pattern
/// (`Audio 1`, `Inst 12`, `Bus 7`, `Output 1-2`, `Master`, etc.). These
/// names are auto-generated when the user creates a track; only explicit
/// renames produce non-matching cluster names.
///
/// Mirrors `_AUTO_TRACK_NAME_RE` in `lpx_inspect.py:228-230`.
pub fn is_auto_track_name(name: &str) -> bool {
    let mut chars = name.chars();
    let prefix: String = chars.by_ref().take_while(|c| c.is_ascii_alphabetic()).collect();
    match prefix.as_str() {
        "Audio" | "Inst" | "Bus" | "Aux" | "Output" | "Input" | "Master" => {}
        _ => return false,
    }
    let rest = name[prefix.len()..].as_bytes();
    // "Master" with no suffix → auto. Same for any prefix with no suffix.
    if rest.is_empty() {
        return true;
    }
    // Otherwise: " <digits>" or " <digits>-<digits>"
    if rest[0] != b' ' {
        return false;
    }
    let after_space = &rest[1..];
    if after_space.is_empty() {
        return false;
    }
    let mut saw_digit = false;
    let mut i = 0;
    while i < after_space.len() && after_space[i].is_ascii_digit() {
        saw_digit = true;
        i += 1;
    }
    if !saw_digit {
        return false;
    }
    if i == after_space.len() {
        return true;
    }
    if after_space[i] != b'-' {
        return false;
    }
    i += 1;
    let mut saw_second_digit = false;
    while i < after_space.len() && after_space[i].is_ascii_digit() {
        saw_second_digit = true;
        i += 1;
    }
    saw_second_digit && i == after_space.len()
}

fn is_bare_comp_tag(name: &str) -> bool {
    let bytes = name.as_bytes();
    if bytes.len() != "Comp X".len() || !name.starts_with("Comp ") {
        return false;
    }
    bytes[5].is_ascii_uppercase()
}

fn has_recording_filename_suffix(name: &str) -> bool {
    // Matches `_<digits>` or `_<digits> #<digits>` at the end.
    let trimmed = name.trim_end();
    let underscore = match trimmed.rfind('_') {
        Some(pos) => pos,
        None => return false,
    };
    let tail = &trimmed[underscore + 1..];
    if tail.is_empty() {
        return false;
    }
    let mut bytes = tail.bytes().peekable();
    let mut saw_digit = false;
    while let Some(b) = bytes.peek().copied() {
        if b.is_ascii_digit() {
            saw_digit = true;
            bytes.next();
        } else {
            break;
        }
    }
    if !saw_digit {
        return false;
    }
    // Optionally allow `<spaces>#<digits>` after the underscore-digits.
    if bytes.peek().is_none() {
        return true;
    }
    while bytes.peek().copied() == Some(b' ') {
        bytes.next();
    }
    if bytes.peek().copied() != Some(b'#') {
        return false;
    }
    bytes.next();
    let mut saw_hash_digit = false;
    for b in bytes {
        if b.is_ascii_digit() {
            saw_hash_digit = true;
        } else if b == b' ' {
            // trailing whitespace already trimmed; mid-tail space is bogus
            return false;
        } else {
            return false;
        }
    }
    saw_hash_digit
}

/// Group consecutive records (in offset order) by their stripped base
/// name. A run of regions sharing one base name corresponds to one
/// user-perceived track. Bare comp tags + recording filenames are
/// dropped — they don't open clusters and don't break surrounding
/// ones.
pub fn cluster_regions(records: &[RegionRecord]) -> Vec<RegionCluster> {
    let mut out: Vec<RegionCluster> = Vec::new();
    for record in records {
        let cleaned = strip_region_suffixes(&record.name);
        if !is_user_track_name(&cleaned) {
            continue;
        }
        if let Some(last) = out.last_mut() {
            if last.base_name == cleaned {
                last.count += 1;
                last.last_offset = record.offset;
                continue;
            }
        }
        out.push(RegionCluster {
            base_name: cleaned,
            count: 1,
            first_offset: record.offset,
            last_offset: record.offset,
        });
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn region_bytes(name: &str) -> Vec<u8> {
        // 4 leading "id" bytes (we use printable junk so any preceding context is
        // present), then marker, then uint16-LE length, then ascii name.
        let mut bytes = Vec::new();
        bytes.extend_from_slice(b"ID01");
        bytes.extend_from_slice(REGION_MARKER);
        let len = name.len() as u16;
        bytes.extend_from_slice(&len.to_le_bytes());
        bytes.extend_from_slice(name.as_bytes());
        bytes
    }

    #[test]
    fn finds_a_single_region_record() {
        let bytes = region_bytes("Acoustic GTR");

        let records = find_region_records(&bytes);

        assert_eq!(records.len(), 1);
        assert_eq!(records[0].name, "Acoustic GTR");
    }

    #[test]
    fn rejects_zero_length_names() {
        let mut bytes = vec![b'I', b'D', b'0', b'1'];
        bytes.extend_from_slice(REGION_MARKER);
        bytes.extend_from_slice(&0u16.to_le_bytes());

        let records = find_region_records(&bytes);

        assert!(records.is_empty());
    }

    #[test]
    fn rejects_oversize_names() {
        let mut bytes = vec![b'I', b'D', b'0', b'1'];
        bytes.extend_from_slice(REGION_MARKER);
        // 201 length — over the 200-byte cap that filters 16-bit garbage.
        bytes.extend_from_slice(&201u16.to_le_bytes());
        bytes.extend(std::iter::repeat(b'A').take(201));

        let records = find_region_records(&bytes);

        assert!(records.is_empty());
    }

    #[test]
    fn rejects_names_with_non_printable_bytes() {
        let mut bytes = vec![b'I', b'D', b'0', b'1'];
        bytes.extend_from_slice(REGION_MARKER);
        // Plant a name with a NUL byte mid-string — should be rejected.
        let bad_name = b"Bad\x00Name";
        bytes.extend_from_slice(&(bad_name.len() as u16).to_le_bytes());
        bytes.extend_from_slice(bad_name);

        let records = find_region_records(&bytes);

        assert!(records.is_empty());
    }

    #[test]
    fn finds_multiple_records_in_offset_order() {
        let mut bytes = Vec::new();
        bytes.extend_from_slice(&region_bytes("Acoustic GTR"));
        // Padding between records — need at least one non-zero, non-marker byte
        // so the second marker doesn't get matched twice.
        bytes.extend_from_slice(b"PADDING_BLOCK_HERE");
        bytes.extend_from_slice(&region_bytes("Lead GTR"));

        let records = find_region_records(&bytes);

        assert_eq!(records.len(), 2);
        assert_eq!(records[0].name, "Acoustic GTR");
        assert_eq!(records[1].name, "Lead GTR");
        assert!(records[0].offset < records[1].offset);
    }

    fn record_at(offset: usize, name: &str) -> RegionRecord {
        RegionRecord {
            offset,
            name: name.into(),
        }
    }

    #[test]
    fn cluster_regions_groups_consecutive_same_named_records() {
        let records = vec![
            record_at(100, "Pocket Strings"),
            record_at(200, "Pocket Strings"),
            record_at(300, "Pocket Strings"),
        ];

        let clusters = cluster_regions(&records);

        assert_eq!(clusters.len(), 1);
        assert_eq!(clusters[0].base_name, "Pocket Strings");
        assert_eq!(clusters[0].count, 3);
        assert_eq!(clusters[0].first_offset, 100);
        assert_eq!(clusters[0].last_offset, 300);
    }

    #[test]
    fn cluster_regions_starts_a_new_cluster_when_the_name_changes() {
        let records = vec![
            record_at(100, "Pocket Strings"),
            record_at(200, "Vaults"),
            record_at(300, "Glass Strings"),
        ];

        let clusters = cluster_regions(&records);

        assert_eq!(clusters.len(), 3);
        assert_eq!(clusters[0].base_name, "Pocket Strings");
        assert_eq!(clusters[1].base_name, "Vaults");
        assert_eq!(clusters[2].base_name, "Glass Strings");
    }

    #[test]
    fn cluster_regions_strips_take_and_comp_suffixes() {
        let records = vec![
            record_at(100, "Vocal: Take 14"),
            record_at(200, "Vocal: Take 15"),
            record_at(300, "Vocal: Comp A"),
            record_at(400, "Vocal: Comp A.1"),
        ];

        let clusters = cluster_regions(&records);

        // All four region records strip down to "Vocal" — one cluster.
        assert_eq!(clusters.len(), 1);
        assert_eq!(clusters[0].base_name, "Vocal");
        assert_eq!(clusters[0].count, 4);
    }

    #[test]
    fn cluster_regions_rejects_recording_filenames() {
        let records = vec![
            record_at(100, "ProjectName_001"),
            record_at(200, "ProjectName_002 #03"),
        ];

        let clusters = cluster_regions(&records);

        assert!(clusters.is_empty(), "recording filenames should not open clusters");
    }

    #[test]
    fn cluster_regions_rejects_bare_comp_tags() {
        let records = vec![record_at(100, "Comp A")];

        let clusters = cluster_regions(&records);

        assert!(clusters.is_empty());
    }

    // ─── is_auto_track_name ────────────────────────────────────────────

    #[test]
    fn is_auto_track_name_matches_default_channel_strip_names() {
        assert!(is_auto_track_name("Audio 1"));
        assert!(is_auto_track_name("Audio 12"));
        assert!(is_auto_track_name("Inst 1"));
        assert!(is_auto_track_name("Inst 99"));
        assert!(is_auto_track_name("Bus 7"));
        assert!(is_auto_track_name("Aux 3"));
        assert!(is_auto_track_name("Input 1"));
        assert!(is_auto_track_name("Master"));
        assert!(is_auto_track_name("Output 1-2"));
        assert!(is_auto_track_name("Output 3-4"));
    }

    #[test]
    fn is_auto_track_name_rejects_user_renames() {
        assert!(!is_auto_track_name("Acoustic GTR"));
        assert!(!is_auto_track_name("Pocket Strings"));
        assert!(!is_auto_track_name("Vocal"));
        assert!(!is_auto_track_name("Audio 1 with extra"));
        assert!(!is_auto_track_name(""));
        assert!(!is_auto_track_name("AudioStuff"));
        // bare prefix (e.g. "Audio") matches Python's regex too — kept
        // consistent with `_AUTO_TRACK_NAME_RE` in lpx_inspect.py.
        assert!(is_auto_track_name("Audio"));
    }
}
