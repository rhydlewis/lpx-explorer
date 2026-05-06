//! Apple Drummer / Bass Player scanner.
//!
//! Logic's "Drummer" plug-in (which powers both the drum-track and the
//! Bass Player feature) is not stored as a 4CC AU descriptor or a
//! `GAME` 4CC slot. Its identity lives in embedded JSON state strings:
//!
//! ```text
//!   ...,"selectedCharacterIdentifier":"Electric Bass - Pop Songwriter",
//!       "selectedPersistentCharacterTypeIdentifier":"Type_ElectricBassV2",...
//! ```
//!
//! These JSON blobs sit inside per-region-UUID-keyed dictionaries:
//! a single Drummer plug-in slot can produce many nearby JSON snapshots
//! (one per region / character experiment / save-state). Counting raw
//! occurrences overcounts the number of plug-in instances.
//!
//! We cluster occurrences by byte-offset proximity and emit one
//! [`AURef`] per cluster, using the *latest* character type in each
//! cluster as the currently-active state. The cluster threshold
//! (currently 32 KB) is generous enough to merge per-region snapshots
//! and historical state but tight enough to separate genuinely distinct
//! Drummer instances on different tracks.
//!
//! Empirically derived against `~/Music/Logic/ new idea.logicx` on
//! 2026-05-06 (lpx-explorer-0ph): 6 JSON states (5 × Acoustic Drummer +
//! 1 × Electric Bass / Bass Player) collapse to 1 cluster → 1 AURef
//! representing Bass Player. Combined with the 12 AUs from
//! [`find_aus`]'s other strategies, this lifts the repro project from
//! 12/13 to 13/13.
//!
//! Bytes-only contract: the parser crate cannot open files.

use crate::AURef;

const KEY_NEEDLE: &[u8] = br#""selectedPersistentCharacterTypeIdentifier":""#;
const TYPE_PREFIX: &str = "Type_";
const MAX_TYPE_VALUE_LEN: usize = 96;
/// Two JSON occurrences within this many bytes of each other are
/// treated as one Drummer plug-in slot (they're per-region snapshots,
/// not separate instances). Picked to safely cover the 6-snapshot,
/// ~1.7 KB cluster observed in the repro project while staying short
/// enough to separate Drummer instances on distinct tracks.
const CLUSTER_THRESHOLD: usize = 32_768;

/// Scan `raw` for Apple Drummer / Bass Player plug-in state and emit
/// one [`AURef`] per Drummer plug-in instance.
pub fn find_apple_drummer_aus(raw: &[u8]) -> Vec<AURef> {
    let mut hits: Vec<(usize, String)> = Vec::new();
    let mut i = 0usize;
    while i + KEY_NEEDLE.len() < raw.len() {
        let Some(rel) = find_at(&raw[i..], KEY_NEEDLE) else {
            break;
        };
        let key_off = i + rel;
        let value_start = key_off + KEY_NEEDLE.len();
        let scan_end = (value_start + MAX_TYPE_VALUE_LEN).min(raw.len());
        let close_quote = match raw[value_start..scan_end]
            .iter()
            .position(|&b| b == b'"')
        {
            Some(p) => value_start + p,
            None => {
                i = key_off + 1;
                continue;
            }
        };
        match std::str::from_utf8(&raw[value_start..close_quote]) {
            Ok(s) if s.starts_with(TYPE_PREFIX) && s.len() > TYPE_PREFIX.len() => {
                hits.push((key_off, s.to_owned()));
            }
            _ => {}
        }
        i = close_quote + 1;
    }

    if hits.is_empty() {
        return Vec::new();
    }

    let mut out: Vec<AURef> = Vec::new();
    let mut cluster_start = hits[0].0;
    let mut last_offset = hits[0].0;
    let mut latest_value = hits[0].1.clone();
    for (off, value) in hits.iter().skip(1) {
        if off - last_offset > CLUSTER_THRESHOLD {
            out.push(au_ref_for_cluster(cluster_start, &latest_value));
            cluster_start = *off;
        }
        last_offset = *off;
        latest_value = value.clone();
    }
    out.push(au_ref_for_cluster(cluster_start, &latest_value));
    out
}

fn au_ref_for_cluster(cluster_offset: usize, latest_type: &str) -> AURef {
    let display_name = display_name_for_type(latest_type);
    AURef {
        type_code: "aumu".into(),
        subtype: synth_subtype(&display_name),
        manufacturer: "appl".into(),
        offset: cluster_offset,
        display_name: Some(display_name),
    }
}

/// Translate an Apple Drummer character-type identifier into the
/// user-facing plug-in label as it appears in Logic's UI. Falls back to
/// stripping the `Type_` prefix when the identifier isn't in the table.
fn display_name_for_type(type_id: &str) -> String {
    match type_id {
        "Type_AcousticDrummerV2" => "Drummer".to_owned(),
        "Type_ElectricBassV2" => "Bass Player".to_owned(),
        _ => type_id.strip_prefix(TYPE_PREFIX).unwrap_or(type_id).to_owned(),
    }
}

fn synth_subtype(display_name: &str) -> String {
    let mut chars = display_name
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .map(|c| c.to_ascii_lowercase());
    let mut s = String::with_capacity(4);
    for _ in 0..4 {
        s.push(chars.next().unwrap_or('x'));
    }
    s
}

fn find_at(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    if needle.is_empty() || haystack.len() < needle.len() {
        return None;
    }
    haystack
        .windows(needle.len())
        .position(|w| w == needle)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn json_blob(character: &str, type_id: &str) -> Vec<u8> {
        format!(
            r#"{{"selectedCharacterIdentifier":"{character}",\
"selectedPersistentCharacterTypeIdentifier":"{type_id}"}}"#
        )
        .into_bytes()
    }

    #[test]
    fn finds_a_single_drummer_instance() {
        let bytes = json_blob("Electric Bass - Pop Songwriter", "Type_ElectricBassV2");

        let found = find_apple_drummer_aus(&bytes);

        assert_eq!(found.len(), 1);
        assert_eq!(found[0].type_code, "aumu");
        assert_eq!(found[0].manufacturer, "appl");
        assert_eq!(found[0].display_name.as_deref(), Some("Bass Player"));
    }

    #[test]
    fn collapses_clustered_snapshots_into_one_au_using_the_latest_character() {
        // Five Acoustic Drummer snapshots followed by a final Bass Player
        // snapshot — same Drummer plug-in slot's per-region state
        // evolution. The active state is the *last* one written.
        let mut buf = Vec::new();
        for _ in 0..5 {
            buf.extend_from_slice(&json_blob(
                "Acoustic Drummer - Pop Rock",
                "Type_AcousticDrummerV2",
            ));
        }
        buf.extend_from_slice(&json_blob(
            "Electric Bass - Pop Songwriter",
            "Type_ElectricBassV2",
        ));

        let found = find_apple_drummer_aus(&buf);

        assert_eq!(found.len(), 1);
        assert_eq!(found[0].display_name.as_deref(), Some("Bass Player"));
    }

    #[test]
    fn separates_distinct_clusters_when_far_apart() {
        // Two Drummer snapshots separated by enough binary noise to
        // exceed the cluster threshold — these must be treated as
        // separate plug-in instances.
        let mut buf = Vec::new();
        buf.extend_from_slice(&json_blob(
            "Acoustic Drummer - Pop Rock",
            "Type_AcousticDrummerV2",
        ));
        buf.resize(buf.len() + CLUSTER_THRESHOLD + 100, 0u8);
        buf.extend_from_slice(&json_blob(
            "Electric Bass - Pop Songwriter",
            "Type_ElectricBassV2",
        ));

        let found = find_apple_drummer_aus(&buf);

        assert_eq!(found.len(), 2);
        let names: Vec<_> = found
            .iter()
            .filter_map(|a| a.display_name.clone())
            .collect();
        assert_eq!(names, vec!["Drummer".to_owned(), "Bass Player".to_owned()]);
    }

    #[test]
    fn ignores_value_that_does_not_start_with_type_prefix() {
        let bytes =
            br#"{"selectedPersistentCharacterTypeIdentifier":"GarbledNoise"}"#.to_vec();

        let found = find_apple_drummer_aus(&bytes);

        assert!(found.is_empty(), "expected no records, got {:?}", found);
    }

    #[test]
    fn ignores_truncated_value_with_no_closing_quote() {
        // No closing `"` within the search window.
        let mut bytes =
            br#""selectedPersistentCharacterTypeIdentifier":"Type_"#.to_vec();
        bytes.extend(std::iter::repeat(b'A').take(MAX_TYPE_VALUE_LEN));

        let found = find_apple_drummer_aus(&bytes);

        assert!(found.is_empty());
    }

    #[test]
    fn falls_back_to_stripped_type_id_when_unknown_character() {
        let bytes = json_blob("?", "Type_FutureCharacterV9");

        let found = find_apple_drummer_aus(&bytes);

        assert_eq!(found.len(), 1);
        assert_eq!(found[0].display_name.as_deref(), Some("FutureCharacterV9"));
    }

    #[test]
    fn returns_empty_when_no_drummer_state_present() {
        let bytes = b"some unrelated binary content with no drummer JSON anywhere";

        let found = find_apple_drummer_aus(bytes);

        assert!(found.is_empty());
    }

    #[test]
    fn cluster_offset_points_at_the_first_match_in_the_cluster() {
        // The byte-offset heuristic in `assign_aus` uses this offset
        // to join AURefs to channel-strip records — it must point at
        // the first sighting of the Drummer state, not the latest.
        let mut buf = vec![0u8; 100]; // padding
        let blob1 = json_blob("Acoustic Drummer - Pop Rock", "Type_AcousticDrummerV2");
        let blob1_off = buf.len();
        buf.extend_from_slice(&blob1);
        buf.extend_from_slice(&json_blob(
            "Electric Bass - Pop Songwriter",
            "Type_ElectricBassV2",
        ));

        let found = find_apple_drummer_aus(&buf);

        assert_eq!(found.len(), 1);
        // The key is at blob1_off + len("{") + len('"selectedCharacterIdentifier":"...","')
        // Easier just to check that the offset is within blob1.
        let key_in_blob1 = blob1_off + blob1.windows(KEY_NEEDLE.len())
            .position(|w| w == KEY_NEEDLE)
            .expect("key in blob1");
        assert_eq!(found[0].offset, key_in_blob1);
    }
}
