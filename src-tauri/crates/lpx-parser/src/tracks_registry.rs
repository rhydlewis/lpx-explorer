//! Track-registry record scanner — ports `find_track_registry_records`
//! from `lpx-toolkit/lpx_inspect.py:516-642`.
//!
//! Logic emits one registry record per user-visible track in the Tracks
//! Area. Distinct from `find_tracks` (which scans channel-strip records:
//! every audio bus / aux / instrument slot, not just user tracks) — this
//! is the source of truth for "what does the user see in their Tracks
//! Area?". Header summing-stacks and folder containers appear here; their
//! children (which `find_tracks` returns as channel strips) do not.
//!
//! Record layout:
//!   `<4 zeros> <2-byte signature> <4 zeros> <2 control bytes>
//!    <2 zeros> <uint16-LE length: high byte forced to 0> <ASCII name>`
//!
//! Bytes-only contract: the parser crate cannot open files.

use serde::Serialize;

use crate::TrackKind;

const REGISTRY_NAME_MAX_LEN: usize = 200;
/// Bytes of fixed preamble before the name field.
const PREAMBLE_LEN: usize = 16;

/// Empirically-derived 2-byte signatures and the track kind they represent.
/// Sourced from `lpx_inspect.py:516-528` plus 04d additions captured against
/// `for my lover.logicx` (docs/audits/2026-05-10-for-my-lover-registry-scan.txt).
/// Buses and plug-in preset entries share the outer record shape, so the
/// pairing in `assign_registry_names` filters entries by strip_id range
/// (registry entries whose strip_id exceeds the project's audio strip count
/// are dropped — catches arrangement-marker / song-title records like
/// "For My Lover (Cm)" that share signature 0x9a11 with real audio tracks).
const TRACK_SIGNATURE_KIND: &[([u8; 2], TrackKind)] = &[
    ([0x22, 0x12], TrackKind::Instrument),   // MIDI / instrument tracks
    ([0xa8, 0x11], TrackKind::Instrument),   // single-instrument tracks (Dome Kick)
    ([0xda, 0x11], TrackKind::Instrument),   // Apple stock-instrument tracks (Bass)
    ([0xe7, 0x10], TrackKind::Instrument),   // Alchemy / sampler instrument tracks
    ([0x23, 0x12], TrackKind::Audio),        // audio tracks (Andy & Red)
    ([0xdc, 0x11], TrackKind::Audio),        // audio tracks (some)
    ([0xdf, 0x11], TrackKind::Audio),        // audio tracks (Slide GTR / Intro Lead GTR)
    ([0x47, 0x11], TrackKind::Audio),        // audio tracks (Lead GTR L/R/C — 04d)
    ([0xc7, 0x10], TrackKind::Audio),        // audio tracks (Backing Vox L/R — 04d)
    ([0x4c, 0x10], TrackKind::Audio),        // audio tracks (Acoustic Gtr — 04d)
    ([0x9a, 0x11], TrackKind::Audio),        // audio tracks (Lead Vox / Vocal — 04d)
    ([0x7a, 0x11], TrackKind::Audio),        // audio tracks (Rhythm Gtr R — 04d)
    ([0x74, 0x10], TrackKind::Folder),       // sub / percussion
    ([0xcb, 0x10], TrackKind::Folder),       // sub / dialogue
    ([0xe3, 0x11], TrackKind::Folder),       // sub / keys
    ([0xe4, 0x10], TrackKind::Folder),       // sub / bells & synth keys
    ([0xeb, 0x11], TrackKind::Folder),       // sub / strings & pads
    ([0xe7, 0x11], TrackKind::Folder),       // atmosphere / pad-cluster
];

/// Names that show up under track signatures but are Logic-internal
/// placeholders or system buses, not user-named tracks. Note that
/// `"Untitled"` is *not* in this list: an unrenamed instrument track
/// in Logic's UI is labelled `Untitled`, so the registry record carries
/// real user-facing intent (and the count needs to match channel-strip
/// records for [`assign_registry_names`] to align by ordinal position).
const REGISTRY_NOISE: &[&str] = &[
    "@ (=Context Name)",
    "(Folder)",
    "Not Assigned",
    "Transform Parameter Set",
    "Unused",
    "Click",
    "MIDI Click",
    "Master",
    "Stereo Out",
    "Preview",
    "VCA 1",
];

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct TrackRegistryEntry {
    pub offset: usize,
    pub name: String,
    pub kind: TrackKind,
    /// Per-track ID from the 32-byte 'track-link' structure that
    /// precedes each registry record. 0 when the structure isn't
    /// present (record sits within the first 62 bytes of the file).
    pub track_id: u16,
    /// Channel-strip number for audio tracks (uint16-LE following the
    /// name). 0 for non-audio kinds and when not recoverable.
    pub strip_id: u16,
}

pub fn find_track_registry_records(raw: &[u8]) -> Vec<TrackRegistryEntry> {
    let mut out: Vec<TrackRegistryEntry> = Vec::new();
    if raw.len() < PREAMBLE_LEN {
        return out;
    }

    let mut i = 0usize;
    while i + PREAMBLE_LEN <= raw.len() {
        // 4 leading zeros
        if raw[i] | raw[i + 1] | raw[i + 2] | raw[i + 3] != 0 {
            i += 1;
            continue;
        }
        // 2-byte signature
        let sig = [raw[i + 4], raw[i + 5]];
        let kind = match TRACK_SIGNATURE_KIND.iter().find(|(s, _)| *s == sig) {
            Some((_, k)) => *k,
            None => {
                i += 1;
                continue;
            }
        };
        // 4 zeros
        if raw[i + 6] | raw[i + 7] | raw[i + 8] | raw[i + 9] != 0 {
            i += 1;
            continue;
        }
        // 2 control bytes (any) at i+10..i+12, then 2 zeros
        if raw[i + 12] | raw[i + 13] != 0 {
            i += 1;
            continue;
        }
        // length-lo at i+14, length-hi must be zero at i+15
        let length = raw[i + 14] as usize;
        if raw[i + 15] != 0 || length == 0 || length > REGISTRY_NAME_MAX_LEN {
            i += 1;
            continue;
        }
        let name_off = i + PREAMBLE_LEN;
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
        if REGISTRY_NOISE.iter().any(|n| *n == name) {
            i += 1;
            continue;
        }

        let trailer_start = name_off + length;
        let trailer = &raw[trailer_start..raw.len().min(trailer_start + 8)];
        let entry_kind = if is_summing_stack_trailer(trailer) {
            TrackKind::SummingStack
        } else {
            kind
        };

        let track_id: u16 = if i >= 62 {
            u16::from_le_bytes([raw[i - 62], raw[i - 61]])
        } else {
            0
        };
        let strip_id: u16 = if entry_kind == TrackKind::Audio {
            decode_audio_strip_id(trailer)
        } else {
            0
        };

        out.push(TrackRegistryEntry {
            offset: i,
            name,
            kind: entry_kind,
            track_id,
            strip_id,
        });

        // Skip past the name to avoid re-matching inside the trailer area.
        // Names are printable ASCII so they can't contain the 4-NUL prefix
        // that anchors the next record, but advancing past the name keeps
        // the inner loop strictly ascending in O(n).
        i = trailer_start;
    }

    out
}

/// Summing stacks (Sub N) carry trailer pattern `XX 01 00 NN 00 01`
/// immediately after the name, where XX varies (looks like `0x54 +
/// sub_number`) and NN is the Sub number. Other folder kinds (Aux Stack,
/// child tracks inside an Aux Stack) have `XX 00 00 ff 00 01` — second
/// byte is `0x00` not `0x01`.
///
/// Some records emit a trailing null after the name, so we accept the
/// pattern at offset 0 *or* at offset 1 (skipping one null).
fn is_summing_stack_trailer(trailer: &[u8]) -> bool {
    for start in [0usize, 1usize] {
        if let Some(c) = trailer.get(start..start + 6) {
            if c[1] == 0x01 && c[2] == 0x00 && c[4] == 0x00 && c[5] == 0x01 {
                return true;
            }
        }
    }
    false
}

/// First non-zero uint16-LE in the bytes after the name. Audio-track
/// registry records encode their channel-strip number here. Padding can
/// be 0 or 1 bytes depending on name length (records appear to be
/// 2-byte-aligned), so we accept either offset.
fn decode_audio_strip_id(post_name: &[u8]) -> u16 {
    if post_name.len() >= 2 {
        let v = u16::from_le_bytes([post_name[0], post_name[1]]);
        if v > 0 && v < 512 {
            return v;
        }
    }
    if post_name.len() >= 3 {
        let v = u16::from_le_bytes([post_name[1], post_name[2]]);
        if v > 0 && v < 512 {
            return v;
        }
    }
    0
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Build a registry record at the start of a buffer:
    ///   `0000 SIG 0000 0000 CTRL CTRL 0000 LENLO 00 NAME TRAILER`
    /// Caller supplies optional 32-byte preamble (the track-link structure
    /// that carries `track_id`) by setting `with_link` to a u16.
    fn record(
        sig: [u8; 2],
        name: &str,
        trailer: &[u8],
        with_link: Option<u16>,
    ) -> Vec<u8> {
        let mut buf = Vec::new();
        if let Some(track_id) = with_link {
            // Pad before the regex match so the 'track-link' u16 lives at
            // m.start() - 62. We need exactly 62 leading bytes; bytes
            // [0..2] are the track_id u16-LE.
            buf.extend_from_slice(&track_id.to_le_bytes());
            buf.extend(std::iter::repeat(0u8).take(60));
        }
        // 4 zeros
        buf.extend_from_slice(&[0, 0, 0, 0]);
        // signature
        buf.extend_from_slice(&sig);
        // 4 zeros
        buf.extend_from_slice(&[0, 0, 0, 0]);
        // 2 control bytes (arbitrary)
        buf.extend_from_slice(&[0xAB, 0xCD]);
        // 2 zeros
        buf.extend_from_slice(&[0, 0]);
        // length_lo + 0
        assert!(name.len() <= 255);
        buf.push(name.len() as u8);
        buf.push(0x00);
        // name
        buf.extend_from_slice(name.as_bytes());
        // trailer
        buf.extend_from_slice(trailer);
        buf
    }

    #[test]
    fn finds_an_instrument_record() {
        let bytes = record([0x22, 0x12], "Piano", &[0u8; 8], None);

        let found = find_track_registry_records(&bytes);

        assert_eq!(found.len(), 1);
        assert_eq!(found[0].name, "Piano");
        assert_eq!(found[0].kind, TrackKind::Instrument);
    }

    #[test]
    fn finds_an_audio_record() {
        let bytes = record([0x23, 0x12], "Vocals", &[0u8; 8], None);

        let found = find_track_registry_records(&bytes);

        assert_eq!(found.len(), 1);
        assert_eq!(found[0].kind, TrackKind::Audio);
    }

    #[test]
    fn maps_each_whitelisted_signature_to_its_kind() {
        // One record per signature, separated by 8 NULs.
        let mut buf = Vec::new();
        let cases: &[([u8; 2], TrackKind, &str)] = &[
            ([0x22, 0x12], TrackKind::Instrument, "I22"),
            ([0xa8, 0x11], TrackKind::Instrument, "Ia8"),
            ([0xda, 0x11], TrackKind::Instrument, "Ida"),
            ([0xe7, 0x10], TrackKind::Instrument, "Ie7lo"),
            ([0x23, 0x12], TrackKind::Audio, "A23"),
            ([0xdc, 0x11], TrackKind::Audio, "Adc"),
            ([0xdf, 0x11], TrackKind::Audio, "Adf"),
            ([0x47, 0x11], TrackKind::Audio, "A47lo"),     // 04d
            ([0xc7, 0x10], TrackKind::Audio, "Ac7"),       // 04d
            ([0x4c, 0x10], TrackKind::Audio, "A4c"),       // 04d
            ([0x9a, 0x11], TrackKind::Audio, "A9a"),       // 04d
            ([0x7a, 0x11], TrackKind::Audio, "A7a"),       // 04d
            ([0x74, 0x10], TrackKind::Folder, "F74"),
            ([0xcb, 0x10], TrackKind::Folder, "Fcb"),
            ([0xe3, 0x11], TrackKind::Folder, "Fe3"),
            ([0xe4, 0x10], TrackKind::Folder, "Fe4"),
            ([0xeb, 0x11], TrackKind::Folder, "Feb"),
            ([0xe7, 0x11], TrackKind::Folder, "Fe7hi"),
        ];
        for (sig, _, name) in cases {
            buf.extend_from_slice(&record(*sig, name, &[0u8; 8], None));
        }

        let found = find_track_registry_records(&buf);

        assert_eq!(found.len(), cases.len());
        for (i, (_, expected_kind, expected_name)) in cases.iter().enumerate() {
            assert_eq!(found[i].kind, *expected_kind, "case {}: {}", i, expected_name);
            assert_eq!(found[i].name, *expected_name);
        }
    }

    #[test]
    fn recognises_da_11_as_instrument_signature() {
        // Real-world example: track named "Bass" (Apple Logic stock instrument)
        // in `~/Music/Logic/ new idea.logicx` lives under signature 0xda 0x11.
        // Before this whitelist entry the registry scanner skipped it.
        let bytes = record([0xda, 0x11], "Bass", &[0u8; 8], None);

        let found = find_track_registry_records(&bytes);

        assert_eq!(found.len(), 1);
        assert_eq!(found[0].name, "Bass");
        assert_eq!(found[0].kind, TrackKind::Instrument);
    }

    #[test]
    fn recognises_e7_10_as_instrument_signature() {
        // Real-world example: track named "Luscious Arp Layers" (Alchemy
        // instrument) lives under signature 0xe7 0x10. Note the close
        // collision with the existing folder signature 0xe7 0x11 — only
        // the high byte distinguishes the two kinds.
        let bytes = record([0xe7, 0x10], "Luscious Arp Layers", &[0u8; 8], None);

        let found = find_track_registry_records(&bytes);

        assert_eq!(found.len(), 1);
        assert_eq!(found[0].name, "Luscious Arp Layers");
        assert_eq!(found[0].kind, TrackKind::Instrument);
    }

    #[test]
    fn ignores_unknown_signatures() {
        // 0xff 0xff is not in the whitelist.
        let bytes = record([0xff, 0xff], "Bus 1", &[0u8; 8], None);

        let found = find_track_registry_records(&bytes);

        assert!(found.is_empty(), "expected no records, got {:?}", found);
    }

    #[test]
    fn filters_out_known_noise_names() {
        // "Click" is a Logic-internal system track — never user-named.
        let bytes = record([0x22, 0x12], "Click", &[0u8; 8], None);

        let found = find_track_registry_records(&bytes);

        assert!(found.is_empty());
    }

    #[test]
    fn keeps_untitled_records_so_join_alignment_works() {
        // Logic's default name for an unrenamed instrument track is
        // "Untitled" — that's a real user-facing name (matches what
        // appears in the Tracks Area), and it has to flow through the
        // registry list so [`assign_registry_names`] can ordinally
        // pair registry entries with channel-strip records 1:1.
        let bytes = record([0x22, 0x12], "Untitled", &[0u8; 8], None);

        let found = find_track_registry_records(&bytes);

        assert_eq!(found.len(), 1);
        assert_eq!(found[0].name, "Untitled");
        assert_eq!(found[0].kind, TrackKind::Instrument);
    }

    #[test]
    fn rejects_non_printable_name() {
        // Manually build a record with a non-printable byte in the name.
        let mut buf = Vec::new();
        buf.extend_from_slice(&[0, 0, 0, 0]);
        buf.extend_from_slice(&[0x22, 0x12]);
        buf.extend_from_slice(&[0, 0, 0, 0]);
        buf.extend_from_slice(&[0xAB, 0xCD]);
        buf.extend_from_slice(&[0, 0]);
        buf.push(3); // length
        buf.push(0); // length-hi
        buf.extend_from_slice(&[b'P', 0x07, b'!']); // 0x07 isn't printable

        let found = find_track_registry_records(&buf);

        assert!(found.is_empty());
    }

    #[test]
    fn upgrades_folder_kind_to_summing_stack_on_trailer_match() {
        // Trailer pattern XX 01 00 NN 00 01 means summing-stack.
        let trailer = [0x54, 0x01, 0x00, 0x42, 0x00, 0x01, 0x00, 0x00];
        let bytes = record([0x74, 0x10], "Sub 1", &trailer, None);

        let found = find_track_registry_records(&bytes);

        assert_eq!(found.len(), 1);
        assert_eq!(found[0].kind, TrackKind::SummingStack);
    }

    #[test]
    fn keeps_folder_kind_when_trailer_does_not_match_summing_stack() {
        // Trailer XX 00 00 ff 00 01 — looks like a non-summing folder.
        let trailer = [0x54, 0x00, 0x00, 0xff, 0x00, 0x01, 0x00, 0x00];
        let bytes = record([0x74, 0x10], "GTRs", &trailer, None);

        let found = find_track_registry_records(&bytes);

        assert_eq!(found.len(), 1);
        assert_eq!(found[0].kind, TrackKind::Folder);
    }

    #[test]
    fn extracts_track_id_from_preceding_link_structure() {
        let bytes = record([0x22, 0x12], "Drums", &[0u8; 8], Some(7));

        let found = find_track_registry_records(&bytes);

        assert_eq!(found.len(), 1);
        assert_eq!(found[0].track_id, 7);
    }

    #[test]
    fn track_id_is_zero_when_not_enough_preamble_room() {
        // No leading 62-byte room → track_id falls back to 0.
        let bytes = record([0x22, 0x12], "Piano", &[0u8; 8], None);

        let found = find_track_registry_records(&bytes);

        assert_eq!(found.len(), 1);
        assert_eq!(found[0].track_id, 0);
    }

    #[test]
    fn extracts_strip_id_for_audio_tracks() {
        // Trailer = 0x05 0x00 → uint16-LE = 5
        let trailer = [0x05, 0x00, 0, 0, 0, 0, 0, 0];
        let bytes = record([0x23, 0x12], "Vocals", &trailer, None);

        let found = find_track_registry_records(&bytes);

        assert_eq!(found.len(), 1);
        assert_eq!(found[0].kind, TrackKind::Audio);
        assert_eq!(found[0].strip_id, 5);
    }

    #[test]
    fn falls_back_to_offset_one_when_first_uint16_is_zero() {
        // Trailer = 0x00 0x07 0x00 → first u16 is zero, second is 7.
        let trailer = [0x00, 0x07, 0x00, 0, 0, 0, 0, 0];
        let bytes = record([0x23, 0x12], "Vocals", &trailer, None);

        let found = find_track_registry_records(&bytes);

        assert_eq!(found.len(), 1);
        assert_eq!(found[0].strip_id, 7);
    }

    #[test]
    fn strip_id_is_zero_for_non_audio_records() {
        let trailer = [0x05, 0x00, 0, 0, 0, 0, 0, 0];
        let bytes = record([0x22, 0x12], "Piano", &trailer, None);

        let found = find_track_registry_records(&bytes);

        assert_eq!(found.len(), 1);
        assert_eq!(found[0].kind, TrackKind::Instrument);
        assert_eq!(found[0].strip_id, 0);
    }

    #[test]
    fn empty_input_returns_empty_vec() {
        let found = find_track_registry_records(&[]);
        assert!(found.is_empty());
    }

    #[test]
    fn rejects_record_with_high_length_byte_set() {
        // Manually build: length-lo = 5, but length-hi = 1 (should be 0).
        let mut buf = Vec::new();
        buf.extend_from_slice(&[0, 0, 0, 0]);
        buf.extend_from_slice(&[0x22, 0x12]);
        buf.extend_from_slice(&[0, 0, 0, 0]);
        buf.extend_from_slice(&[0xAB, 0xCD]);
        buf.extend_from_slice(&[0, 0]);
        buf.push(5);
        buf.push(1); // length-hi nonzero — should be rejected
        buf.extend_from_slice(b"Piano");

        let found = find_track_registry_records(&buf);

        assert!(found.is_empty());
    }

    #[test]
    fn returns_records_in_byte_offset_order() {
        let mut buf = Vec::new();
        buf.extend_from_slice(&record([0x22, 0x12], "First", &[0u8; 8], None));
        buf.extend_from_slice(&record([0x23, 0x12], "Second", &[0u8; 8], None));
        buf.extend_from_slice(&record([0x22, 0x12], "Third", &[0u8; 8], None));

        let found = find_track_registry_records(&buf);

        assert_eq!(found.len(), 3);
        assert!(found[0].offset < found[1].offset);
        assert!(found[1].offset < found[2].offset);
        assert_eq!(found[0].name, "First");
        assert_eq!(found[2].name, "Third");
    }
}
