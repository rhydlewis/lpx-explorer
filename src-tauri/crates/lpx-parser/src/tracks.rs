//! Track scanner — ports `find_tracks` from `lpx-toolkit/lpx_inspect.py:731-762`.
//!
//! Tracks are anchored on a 16-byte name field that opens with `0x20` (a
//! leading space that's part of the format), then ASCII name, null-padded.
//! Immediately after the name field sits an 8-byte descriptor whose final
//! byte has the top two bits set (`0xC5` / `0xCD` / `0xCF` / `0xED`).
//!
//! Bytes-only contract: the parser crate cannot open files.

use serde::Serialize;

use crate::{is_auto_track_name, AURef, RegionCluster};

const NAME_FIELD_LEN: usize = 16;
const DESCRIPTOR_LEN: usize = 8;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum TrackKind {
    Audio,
    Instrument,
    Folder,
    SummingStack,
    Master,
    Output,
    Bus,
    Aux,
    Input,
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Track {
    pub name: String,
    /// User-given name recovered from a region-record cluster
    /// (`Track.name` keeps the channel-strip default like `"Inst 1"`).
    /// Some when [`assign_user_names`] found a matching cluster.
    pub user_name: Option<String>,
    pub kind: TrackKind,
    pub offset: usize,
    pub is_active: bool,
    pub instrument: Option<AURef>,
    pub midi_fx: Vec<AURef>,
    pub audio_fx: Vec<AURef>,
    pub sub_number: Option<u32>,
    pub parent_offset: Option<usize>,
}

/// For each cluster, find the nearest preceding track and set its
/// `user_name` to the cluster's `base_name` (only when `user_name` is
/// still `None`). Mirrors the byte-offset-based "nearest preceding
/// track" heuristic from [`assign_aus`].
///
/// Each Logic track's regions sit in `ProjectData` after the track's
/// channel-strip record, so a cluster's `first_offset` typically falls
/// just after the track it belongs to.
pub fn assign_user_names(tracks: &mut [Track], clusters: &[RegionCluster]) {
    if tracks.is_empty() {
        return;
    }
    tracks.sort_by_key(|t| t.offset);
    let mut sorted_clusters: Vec<&RegionCluster> = clusters.iter().collect();
    sorted_clusters.sort_by_key(|c| c.first_offset);

    for cluster in sorted_clusters {
        // Skip clusters whose base_name matches Logic's default
        // channel-strip pattern (`Audio 1`, `Inst 12`, etc.). When a
        // user records, then renames the track, BOTH names appear as
        // clusters — without this filter the auto-named cluster wins
        // because it sits earlier in the binary.
        if is_auto_track_name(&cluster.base_name) {
            continue;
        }
        let owner_idx = match tracks
            .iter()
            .rposition(|t| t.offset <= cluster.first_offset)
        {
            Some(i) => i,
            None => continue,
        };
        let owner = &mut tracks[owner_idx];
        if owner.user_name.is_none() {
            owner.user_name = Some(cluster.base_name.clone());
        }
    }
}

/// Route each AU to its nearest preceding track. Mirrors
/// `lpx_inspect.py:765-786`. `aumu` (instrument) descriptors only attach
/// when the owner track's kind is [`TrackKind::Instrument`] — phantom
/// instruments preceded by an audio/bus track are dropped (silent;
/// matches the JTBD of "show me what this track plays").
pub fn assign_aus(tracks: &mut Vec<Track>, aus: &[AURef]) {
    if tracks.is_empty() {
        return;
    }
    tracks.sort_by_key(|t| t.offset);

    let mut sorted: Vec<&AURef> = aus.iter().collect();
    sorted.sort_by_key(|a| a.offset);

    for au in sorted {
        let owner_idx = match tracks.iter().rposition(|t| t.offset <= au.offset) {
            Some(i) => i,
            None => continue,
        };
        let owner = &mut tracks[owner_idx];
        match au.type_code.as_str() {
            "aumu" => {
                if owner.kind == TrackKind::Instrument && owner.instrument.is_none() {
                    owner.instrument = Some(au.clone());
                }
            }
            "aumf" => owner.midi_fx.push(au.clone()),
            _ => owner.audio_fx.push(au.clone()),
        }
    }
}

/// Map a descriptor's first 4 bytes to a [`TrackKind`]. Mirrors the
/// `Track.kind` property in `lpx_inspect.py:69-82`.
fn classify_descriptor(descriptor: &[u8; 8]) -> TrackKind {
    let head = descriptor[0];
    let b1 = descriptor[1];
    let b2 = descriptor[2];
    match head {
        0x89 => TrackKind::Master,
        0x49 => TrackKind::Output,
        0xE9 => TrackKind::Bus,
        0xAB => {
            if b1 == 0xF5 {
                TrackKind::Aux
            } else {
                TrackKind::Audio
            }
        }
        0x29 => {
            if b2 == 0xF3 || b2 == 0xF7 {
                TrackKind::Instrument
            } else {
                TrackKind::Input
            }
        }
        _ => TrackKind::Unknown,
    }
}

/// Two independent activity signals — either flips a track to active.
/// Mirrors `Track.is_active` in `lpx_inspect.py:88-94`.
fn descriptor_is_active(descriptor: &[u8; 8]) -> bool {
    descriptor[2] & 0x04 != 0 || descriptor[4] != 0
}

/// Decode the ASCII name out of a 16-byte name field starting with `0x20`.
/// Returns `None` for empty / whitespace-only names so callers can skip
/// them (matches the Python `if not name:` guard).
fn decode_name(field: &[u8]) -> Option<String> {
    if field.first() != Some(&0x20) {
        return None;
    }
    // ASCII bytes 0x21..=0x7e starting at index 1, terminated by 0x00 or
    // the field's end.
    let mut name_bytes: Vec<u8> = Vec::new();
    for &b in &field[1..NAME_FIELD_LEN] {
        if b == 0x00 {
            break;
        }
        if !(0x20..=0x7e).contains(&b) {
            return None;
        }
        name_bytes.push(b);
    }

    // Everything after the name has to be NUL-padded.
    let name_end = 1 + name_bytes.len();
    if field[name_end..NAME_FIELD_LEN].iter().any(|&b| b != 0x00) {
        return None;
    }

    let name = String::from_utf8(name_bytes).ok()?;
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return None;
    }
    Some(trimmed.to_owned())
}

pub fn find_tracks(raw: &[u8]) -> Vec<Track> {
    let mut tracks: Vec<Track> = Vec::new();
    let mut seen: std::collections::HashSet<usize> = std::collections::HashSet::new();

    let mut i = 0;
    // Need a NUL byte preceding the 0x20 name marker; loop from index 1.
    while i + NAME_FIELD_LEN + DESCRIPTOR_LEN <= raw.len() {
        if raw[i] != 0x20 {
            i += 1;
            continue;
        }
        if i == 0 || raw[i - 1] != 0x00 {
            i += 1;
            continue;
        }

        let field = &raw[i..i + NAME_FIELD_LEN];
        let descriptor: [u8; 8] = match raw[i + NAME_FIELD_LEN..i + NAME_FIELD_LEN + DESCRIPTOR_LEN]
            .try_into()
        {
            Ok(arr) => arr,
            Err(_) => {
                i += 1;
                continue;
            }
        };

        // Final byte of the type-code (descriptor[3]) must have the high two
        // bits set — guards against random 0x20 bytes in the binary blob.
        if descriptor[3] & 0xC0 != 0xC0 {
            i += 1;
            continue;
        }

        let name = match decode_name(field) {
            Some(n) => n,
            None => {
                i += 1;
                continue;
            }
        };

        if seen.insert(i) {
            tracks.push(Track {
                name,
                user_name: None,
                kind: classify_descriptor(&descriptor),
                offset: i,
                is_active: descriptor_is_active(&descriptor),
                instrument: None,
                midi_fx: Vec::new(),
                audio_fx: Vec::new(),
                sub_number: None,
                parent_offset: None,
            });
        }
        // Advance past the whole record so we don't re-match inside it.
        i += NAME_FIELD_LEN;
    }

    tracks.sort_by_key(|t| t.offset);
    tracks
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Build a 24-byte track record: 16-byte name field + 8-byte descriptor.
    /// `descriptor` controls the kind via Python's Track.kind property
    /// (`lpx_inspect.py:69-82`). The descriptor's final byte must have
    /// `0xC0` set for the track to be recognised at all.
    fn track_bytes(name: &str, descriptor: [u8; 8]) -> Vec<u8> {
        assert!(name.len() <= 14, "name fits in the 14-byte ASCII window");
        let mut bytes = Vec::with_capacity(NAME_FIELD_LEN + DESCRIPTOR_LEN);
        bytes.push(0x20); // leading space
        bytes.extend_from_slice(name.as_bytes());
        // Pad with NULs to fill 16 bytes total.
        while bytes.len() < NAME_FIELD_LEN {
            bytes.push(0x00);
        }
        bytes.extend_from_slice(&descriptor);
        bytes
    }

    fn fixture_with(records: &[(&str, [u8; 8])]) -> Vec<u8> {
        let mut buf = vec![0u8; 8]; // 8 NULs of preceding context — TRACK_NAME_RE lookbehind needs a NUL before 0x20
        for (name, desc) in records {
            buf.extend_from_slice(&track_bytes(name, *desc));
        }
        buf
    }

    /// Descriptors per the `Track.kind` property in lpx_inspect.py:69-82.
    /// Final byte 0xC0 mask is mandatory; the head byte selects kind.
    const DESC_AUDIO: [u8; 8] = [0xAB, 0x00, 0x00, 0xC5, 0x00, 0x00, 0x00, 0x00];
    const DESC_AUX: [u8; 8] = [0xAB, 0xF5, 0x00, 0xC5, 0x00, 0x00, 0x00, 0x00];
    const DESC_INSTRUMENT: [u8; 8] = [0x29, 0x00, 0xF3, 0xCF, 0x00, 0x00, 0x00, 0x00];
    const DESC_INPUT: [u8; 8] = [0x29, 0x00, 0x00, 0xC5, 0x00, 0x00, 0x00, 0x00];
    const DESC_BUS: [u8; 8] = [0xE9, 0x00, 0x00, 0xCD, 0x00, 0x00, 0x00, 0x00];
    const DESC_MASTER: [u8; 8] = [0x89, 0x00, 0x00, 0xED, 0x00, 0x00, 0x00, 0x00];
    const DESC_OUTPUT: [u8; 8] = [0x49, 0x00, 0x00, 0xED, 0x00, 0x00, 0x00, 0x00];

    #[test]
    fn finds_an_audio_track() {
        let bytes = fixture_with(&[("Audio 1", DESC_AUDIO)]);

        let tracks = find_tracks(&bytes);

        assert_eq!(tracks.len(), 1);
        assert_eq!(tracks[0].name, "Audio 1");
        assert_eq!(tracks[0].kind, TrackKind::Audio);
    }

    #[test]
    fn classifies_each_descriptor_head_byte() {
        let bytes = fixture_with(&[
            ("Audio 1", DESC_AUDIO),
            ("Aux 1", DESC_AUX),
            ("Inst 1", DESC_INSTRUMENT),
            ("Input 1", DESC_INPUT),
            ("Bus 1", DESC_BUS),
            ("Master", DESC_MASTER),
            ("Output 1", DESC_OUTPUT),
        ]);

        let tracks = find_tracks(&bytes);
        let kinds: Vec<TrackKind> = tracks.iter().map(|t| t.kind).collect();

        assert_eq!(
            kinds,
            vec![
                TrackKind::Audio,
                TrackKind::Aux,
                TrackKind::Instrument,
                TrackKind::Input,
                TrackKind::Bus,
                TrackKind::Master,
                TrackKind::Output,
            ]
        );
    }

    #[test]
    fn rejects_records_with_garbage_in_the_null_padding() {
        // Hand-build a fixture: 0x20 + "Audio" + GARBAGE bytes instead of NUL pad.
        let mut buf = vec![0u8; 8];
        buf.push(0x20);
        buf.extend_from_slice(b"Audio");
        // Should be NUL-padded; planting non-NUL bytes here violates the format.
        buf.extend_from_slice(&[0xFF, 0xFE, 0xFD, 0xFC, 0xFB, 0xFA, 0xF9, 0xF8, 0xF7, 0xF6]);
        buf.extend_from_slice(&DESC_AUDIO);

        let tracks = find_tracks(&buf);

        assert!(tracks.is_empty(), "expected no tracks; got {:?}", tracks);
    }

    #[test]
    fn rejects_descriptor_without_high_two_bits_set() {
        // Final byte 0x05 lacks the 0xC0 mask, so the candidate is not a
        // valid track.
        let bad = [0xAB, 0x00, 0x00, 0x05, 0x00, 0x00, 0x00, 0x00];
        let bytes = fixture_with(&[("Audio 1", bad)]);

        let tracks = find_tracks(&bytes);

        assert!(tracks.is_empty());
    }

    #[test]
    fn detects_active_via_descriptor_bit_0x04() {
        let mut desc = DESC_AUDIO;
        desc[2] = 0x04; // activity bit set
        let bytes = fixture_with(&[("Audio 1", desc)]);

        let tracks = find_tracks(&bytes);

        assert_eq!(tracks.len(), 1);
        assert!(tracks[0].is_active);
    }

    #[test]
    fn detects_active_via_descriptor_byte_4_nonzero() {
        let mut desc = DESC_AUDIO;
        desc[4] = 0x42; // alternate activity signal
        let bytes = fixture_with(&[("Audio 1", desc)]);

        let tracks = find_tracks(&bytes);

        assert_eq!(tracks.len(), 1);
        assert!(tracks[0].is_active);
    }

    #[test]
    fn inactive_when_neither_signal_set() {
        let bytes = fixture_with(&[("Audio 1", DESC_AUDIO)]);

        let tracks = find_tracks(&bytes);

        assert_eq!(tracks.len(), 1);
        assert!(!tracks[0].is_active);
    }

    #[test]
    fn skips_empty_or_whitespace_only_names() {
        // 0x20 + spaces + NULs produces an empty name after .strip()
        let mut buf = vec![0u8; 8];
        buf.push(0x20);
        buf.extend_from_slice(b" ");
        while buf.len() - 8 < NAME_FIELD_LEN {
            buf.push(0x00);
        }
        buf.extend_from_slice(&DESC_AUDIO);

        let tracks = find_tracks(&buf);

        assert!(tracks.is_empty());
    }

    #[test]
    fn returns_offsets_in_byte_order() {
        let bytes = fixture_with(&[
            ("Audio 1", DESC_AUDIO),
            ("Audio 2", DESC_AUDIO),
            ("Audio 3", DESC_AUDIO),
        ]);

        let tracks = find_tracks(&bytes);

        assert_eq!(tracks.len(), 3);
        assert!(tracks[0].offset < tracks[1].offset);
        assert!(tracks[1].offset < tracks[2].offset);
    }

    #[test]
    fn instrument_midi_audio_lists_start_empty() {
        let bytes = fixture_with(&[("Audio 1", DESC_AUDIO)]);

        let tracks = find_tracks(&bytes);

        assert!(tracks[0].instrument.is_none());
        assert!(tracks[0].midi_fx.is_empty());
        assert!(tracks[0].audio_fx.is_empty());
        assert!(tracks[0].sub_number.is_none());
        assert!(tracks[0].parent_offset.is_none());
    }

    // ─── assign_aus ────────────────────────────────────────────────────

    fn au_at(offset: usize, type_code: &str) -> AURef {
        AURef {
            type_code: type_code.into(),
            subtype: "Subt".into(),
            manufacturer: "Mfgr".into(),
            offset,
        }
    }

    fn track(name: &str, kind: TrackKind, offset: usize) -> Track {
        Track {
            name: name.into(),
            user_name: None,
            kind,
            offset,
            is_active: false,
            instrument: None,
            midi_fx: Vec::new(),
            audio_fx: Vec::new(),
            sub_number: None,
            parent_offset: None,
        }
    }

    #[test]
    fn assigns_audio_effect_to_nearest_preceding_track_audio_fx() {
        let mut tracks = vec![track("Audio 1", TrackKind::Audio, 100)];
        let aus = vec![au_at(200, "aufx")];

        assign_aus(&mut tracks, &aus);

        assert_eq!(tracks[0].audio_fx.len(), 1);
        assert_eq!(tracks[0].audio_fx[0].offset, 200);
    }

    #[test]
    fn assigns_midi_effect_to_midi_fx() {
        let mut tracks = vec![track("Inst 1", TrackKind::Instrument, 100)];
        let aus = vec![au_at(150, "aumf")];

        assign_aus(&mut tracks, &aus);

        assert_eq!(tracks[0].midi_fx.len(), 1);
        assert!(tracks[0].audio_fx.is_empty());
    }

    #[test]
    fn assigns_instrument_to_instrument_field_only_when_track_is_instrument() {
        let mut tracks = vec![track("Inst 1", TrackKind::Instrument, 100)];
        let aus = vec![au_at(150, "aumu")];

        assign_aus(&mut tracks, &aus);

        assert!(tracks[0].instrument.is_some());
        assert_eq!(tracks[0].instrument.as_ref().unwrap().offset, 150);
    }

    #[test]
    fn drops_instrument_au_when_owner_is_not_an_instrument_track() {
        let mut tracks = vec![track("Audio 1", TrackKind::Audio, 100)];
        let aus = vec![au_at(150, "aumu")];

        assign_aus(&mut tracks, &aus);

        assert!(tracks[0].instrument.is_none());
        assert!(tracks[0].midi_fx.is_empty());
        assert!(tracks[0].audio_fx.is_empty());
    }

    #[test]
    fn keeps_only_the_first_instrument_per_track() {
        let mut tracks = vec![track("Inst 1", TrackKind::Instrument, 100)];
        let aus = vec![au_at(150, "aumu"), au_at(200, "aumu")];

        assign_aus(&mut tracks, &aus);

        assert_eq!(tracks[0].instrument.as_ref().unwrap().offset, 150);
    }

    #[test]
    fn drops_aus_preceding_all_tracks() {
        let mut tracks = vec![track("Audio 1", TrackKind::Audio, 200)];
        let aus = vec![au_at(50, "aufx")];

        assign_aus(&mut tracks, &aus);

        assert!(tracks[0].audio_fx.is_empty());
    }

    #[test]
    fn assigns_to_the_nearest_preceding_track_when_multiple_exist() {
        let mut tracks = vec![
            track("Audio 1", TrackKind::Audio, 100),
            track("Audio 2", TrackKind::Audio, 300),
            track("Audio 3", TrackKind::Audio, 500),
        ];
        let aus = vec![au_at(400, "aufx")];

        assign_aus(&mut tracks, &aus);

        assert!(tracks[0].audio_fx.is_empty());
        assert_eq!(tracks[1].audio_fx.len(), 1);
        assert!(tracks[2].audio_fx.is_empty());
    }

    #[test]
    fn empty_track_list_is_a_no_op() {
        let mut tracks: Vec<Track> = Vec::new();
        let aus = vec![au_at(100, "aufx")];

        assign_aus(&mut tracks, &aus);

        assert!(tracks.is_empty());
    }

    // ─── assign_user_names ─────────────────────────────────────────────

    fn cluster_at(offset: usize, base_name: &str) -> RegionCluster {
        RegionCluster {
            base_name: base_name.into(),
            count: 1,
            first_offset: offset,
            last_offset: offset,
        }
    }

    #[test]
    fn assigns_cluster_name_to_nearest_preceding_track() {
        let mut tracks = vec![track("Inst 1", TrackKind::Instrument, 100)];
        let clusters = vec![cluster_at(150, "Pocket Strings")];

        assign_user_names(&mut tracks, &clusters);

        assert_eq!(tracks[0].user_name.as_deref(), Some("Pocket Strings"));
    }

    #[test]
    fn picks_the_correct_owner_when_multiple_tracks_exist() {
        let mut tracks = vec![
            track("Inst 1", TrackKind::Instrument, 100),
            track("Inst 2", TrackKind::Instrument, 300),
            track("Inst 3", TrackKind::Instrument, 500),
        ];
        let clusters = vec![
            cluster_at(150, "Pocket Strings"),
            cluster_at(350, "Vaults"),
            cluster_at(550, "Glass Strings"),
        ];

        assign_user_names(&mut tracks, &clusters);

        assert_eq!(tracks[0].user_name.as_deref(), Some("Pocket Strings"));
        assert_eq!(tracks[1].user_name.as_deref(), Some("Vaults"));
        assert_eq!(tracks[2].user_name.as_deref(), Some("Glass Strings"));
    }

    #[test]
    fn drops_clusters_preceding_all_tracks() {
        let mut tracks = vec![track("Inst 1", TrackKind::Instrument, 200)];
        let clusters = vec![cluster_at(50, "Orphan")];

        assign_user_names(&mut tracks, &clusters);

        assert!(tracks[0].user_name.is_none());
    }

    #[test]
    fn does_not_overwrite_an_existing_user_name() {
        // First cluster wins; later clusters owned by the same track
        // (e.g. a take/comp run that didn't strip cleanly) don't overwrite.
        let mut tracks = vec![track("Inst 1", TrackKind::Instrument, 100)];
        let clusters = vec![
            cluster_at(150, "Pocket Strings"),
            cluster_at(160, "Different Name"),
        ];

        assign_user_names(&mut tracks, &clusters);

        assert_eq!(tracks[0].user_name.as_deref(), Some("Pocket Strings"));
    }

    #[test]
    fn empty_clusters_are_a_no_op() {
        let mut tracks = vec![track("Inst 1", TrackKind::Instrument, 100)];

        assign_user_names(&mut tracks, &[]);

        assert!(tracks[0].user_name.is_none());
    }

    #[test]
    fn empty_tracks_with_clusters_is_a_no_op() {
        let mut tracks: Vec<Track> = Vec::new();
        let clusters = vec![cluster_at(100, "Anything")];

        assign_user_names(&mut tracks, &clusters);

        assert!(tracks.is_empty());
    }

    #[test]
    fn skips_auto_named_clusters_so_user_renames_win_when_both_exist() {
        // Real-world case: user records into "Audio 3", THEN renames to
        // "Acoustic GTR" and records again. Both clusters exist; the
        // auto-named one sits earlier in the binary. Without the auto-name
        // filter the user would still see "Audio 3" because first-cluster-
        // wins. The filter ignores the auto-named cluster and lets the
        // user-renamed one through.
        let mut tracks = vec![track("Audio 3", TrackKind::Audio, 100)];
        let clusters = vec![
            cluster_at(150, "Audio 3"),       // earlier — auto-named, skipped
            cluster_at(250, "Acoustic GTR"),  // user rename — wins
        ];

        assign_user_names(&mut tracks, &clusters);

        assert_eq!(tracks[0].user_name.as_deref(), Some("Acoustic GTR"));
    }

    #[test]
    fn does_not_assign_auto_named_clusters_even_when_no_alternative_exists() {
        // If the ONLY cluster for a track is auto-named, leave user_name
        // as None — the track's channel-strip name carries the same
        // information already.
        let mut tracks = vec![track("Audio 3", TrackKind::Audio, 100)];
        let clusters = vec![cluster_at(150, "Audio 3")];

        assign_user_names(&mut tracks, &clusters);

        assert!(tracks[0].user_name.is_none());
    }
}
