//! Read-only parser for Logic Pro `.logicx` `ProjectData` binaries.
//!
//! Scope:
//!   * `find_aus(&[u8])` — Audio Unit descriptors in `ProjectData`.
//!   * `parse_metadata_plist(&[u8])` — project metadata from `MetaData.plist`.
//!
//! The format is undocumented; offsets here mirror the empirically-derived
//! Python implementation at `lpx-toolkit/lpx_inspect.py`.

#![forbid(unsafe_code)]

mod alternatives;
mod apple_drummer;
mod apple_stock;
mod auval;
mod metadata;
mod regions;
mod tracks;
mod tracks_registry;

pub use alternatives::{parse_alternatives_manifest, Alternative, AlternativesError};
pub use auval::{parse_auval_line, AuvalEntry};
pub use metadata::{parse_metadata_plist, MetadataError, ProjectMetadata};
pub use regions::{
    cluster_regions, find_region_records, is_auto_track_name, RegionCluster, RegionRecord,
};
pub use tracks::{
    assign_aus, assign_registry_names, assign_user_names, find_tracks,
    synthesize_folder_tracks, Track, TrackKind,
};
pub use tracks_registry::{find_track_registry_records, TrackRegistryEntry};

use serde::Serialize;

/// Reference to an Audio Unit component descriptor as stored in
/// `ProjectData`. The three 4CCs are returned in the human-readable
/// order Logic / `auval` displays them — i.e. with the little-endian
/// reversal already undone.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct AURef {
    /// AU type code, e.g. `"aumu"` (instrument), `"aufx"` (audio fx),
    /// `"aumf"` (MIDI fx), `"aumi"` (MIDI processor).
    pub type_code: String,
    /// AU subtype 4CC, e.g. `"EZk2"`.
    pub subtype: String,
    /// Manufacturer 4CC, e.g. `"Toon"`.
    pub manufacturer: String,
    /// Byte offset of the type-code 4CC in the input.
    pub offset: usize,
    /// User-facing plug-in name, set when the parser can recover the
    /// full name directly (e.g. Apple stock plug-ins identified via the
    /// `GAME` 4CC marker in [`apple_stock`]). `None` for 3rd-party AUs
    /// detected via the standard 4CC triple — their display name comes
    /// from the `auval -l` lookup table at the application layer.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
}

impl AURef {
    /// `"{type}/{subtype}/{manufacturer}"` — the lookup key shared with
    /// `auval -l` output. Trailing/leading spaces are preserved verbatim.
    pub fn fingerprint(&self) -> String {
        format!("{}/{}/{}", self.type_code, self.subtype, self.manufacturer)
    }
}

/// AU type 4CCs as they appear *in the file* — i.e. little-endian, so
/// the human-readable names (`"aumu"`, `"aufx"`, `"aumf"`, `"aumi"`)
/// are reversed.
const AU_TYPE_TAGS_LE: [&[u8; 4]; 4] = [
    b"umua", // aumu — instrument
    b"xfua", // aufx — audio effect
    b"fmua", // aumf — MIDI effect (kAudioUnitType_MusicEffect)
    b"imua", // aumi — MIDI processor (kAudioUnitType_MIDIProcessor)
];

/// Reverse a 4-byte little-endian 4CC into its human-readable form.
fn reverse_4cc(bytes: [u8; 4]) -> String {
    let mut out = bytes;
    out.reverse();
    String::from_utf8_lossy(&out).into_owned()
}

/// Scan `raw` for Audio Unit component descriptors and return one
/// [`AURef`] per match.
///
/// Three storage shapes are recognised:
/// 1. **Standard 4CC triple** — three contiguous 4-byte codes laid out
///    as `manufacturer | type | subtype`, all little-endian. The type
///    field is the anchor: we scan for `umua` / `xfua` / `fmua` /
///    `imua` and read 4 bytes either side. Used by 3rd-party AUs.
/// 2. **Apple stock plug-in slots** (see [`apple_stock`]) — anchored
///    on the `GAME` 4CC marker. Returned `AURef`s carry a synthesised
///    `(type, subtype, manufacturer)` triple plus the real
///    user-facing name in `display_name`.
/// 3. **Apple Drummer / Bass Player** (see [`apple_drummer`]) —
///    identified by embedded JSON state with the
///    `"selectedPersistentCharacterTypeIdentifier":"Type_..."` key.
///    Per-region snapshots are clustered into one AURef per plug-in
///    instance.
pub fn find_aus(raw: &[u8]) -> Vec<AURef> {
    let mut found = Vec::new();
    for tag in AU_TYPE_TAGS_LE {
        let mut search_from = 0usize;
        while let Some(rel) = find_subslice(&raw[search_from..], tag) {
            let off = search_from + rel;
            search_from = off + 1;

            if off < 4 || off + 8 > raw.len() {
                continue;
            }

            let mfr_le: [u8; 4] = raw[off - 4..off].try_into().expect("4 bytes");
            let type_le: [u8; 4] = raw[off..off + 4].try_into().expect("4 bytes");
            let sub_le: [u8; 4] = raw[off + 4..off + 8].try_into().expect("4 bytes");

            if !is_printable_4cc(&mfr_le)
                || !is_printable_4cc(&type_le)
                || !is_printable_4cc(&sub_le)
            {
                continue;
            }

            found.push(AURef {
                type_code: reverse_4cc(type_le),
                subtype: reverse_4cc(sub_le),
                manufacturer: reverse_4cc(mfr_le),
                offset: off,
                display_name: None,
            });
        }
    }
    found.extend(apple_stock::find_apple_stock_aus(raw));
    found.extend(apple_drummer::find_apple_drummer_aus(raw));
    found.sort_by_key(|a| a.offset);
    found
}

fn find_subslice(haystack: &[u8], needle: &[u8; 4]) -> Option<usize> {
    haystack.windows(4).position(|w| w == needle)
}

/// `ProjectData` retains binary noise that occasionally contains the AU
/// type tags by chance. Real descriptors are flanked by printable-ASCII
/// 4CCs (manufacturer + subtype), so any candidate whose neighbouring
/// bytes contain a non-printable byte is discarded.
fn is_printable_4cc(bytes: &[u8; 4]) -> bool {
    bytes.iter().all(|&b| (0x20..=0x7e).contains(&b))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Hand-built fixture: a single AU descriptor laid out the way Logic
    /// stores them in `ProjectData`. Three contiguous 4CCs in
    /// little-endian order — manufacturer + type + subtype — preceded
    /// by name padding so the type-code anchor is not at offset 0.
    ///
    /// Bytes:
    ///   [0..8)   8-byte name padding (printable ASCII).
    ///   [8..12)  manufacturer 4CC, little-endian. `"Toon"` reversed = `nooT`.
    ///   [12..16) type 4CC, little-endian.        `"aumu"` reversed = `umua`.
    ///   [16..20) subtype 4CC, little-endian.     `"EZk2"` reversed = `2kZE`.
    fn single_descriptor_fixture() -> Vec<u8> {
        let mut bytes = Vec::new();
        bytes.extend_from_slice(b"PADDING_"); // 8-byte name region
        bytes.extend_from_slice(b"nooT");     // manufacturer LE
        bytes.extend_from_slice(b"umua");     // type LE  -> "aumu"
        bytes.extend_from_slice(b"2kZE");     // subtype LE -> "EZk2"
        bytes
    }

    #[test]
    fn finds_single_instrument_descriptor() {
        let bytes = single_descriptor_fixture();

        let found = find_aus(&bytes);

        assert_eq!(found.len(), 1, "expected one AURef, got {:?}", found);
        let au = &found[0];
        assert_eq!(au.type_code, "aumu");
        assert_eq!(au.subtype, "EZk2");
        assert_eq!(au.manufacturer, "Toon");
        assert_eq!(au.offset, 12, "type-code anchor sits at byte 12");
        assert_eq!(au.fingerprint(), "aumu/EZk2/Toon");
    }

    /// `ProjectData`-shaped fixture: real bundles are ~MB of binary noise
    /// with AU descriptors interleaved. The noisy regions occasionally
    /// contain spurious `umua` / `xfua` / `fmua` byte sequences whose
    /// surrounding bytes aren't valid 4CCs — these must be filtered out
    /// (mirrors the printable-ASCII guard in lpx_inspect.py:717-718).
    ///
    /// Layout:
    ///   [0..16)   binary noise containing a planted `umua` at offset 4
    ///             whose neighbouring bytes are non-printable (NUL / 0xFF).
    ///   [16..36)  one real AU descriptor (`aufx` / `Comp` / `Yamh`).
    ///   [36..56)  more binary noise containing a planted `xfua` whose
    ///             neighbouring bytes include a 0x00 byte.
    fn project_data_shaped_fixture() -> Vec<u8> {
        let mut bytes = Vec::new();

        // [0..4)  4 bytes of non-printable noise — would be a "manufacturer"
        //          for the planted false-positive `umua` if the filter were
        //          missing.
        bytes.extend_from_slice(&[0x00, 0xFF, 0x01, 0x7F]);
        // [4..8)  planted false-positive type tag.
        bytes.extend_from_slice(b"umua");
        // [8..12) 4 bytes of non-printable "subtype" noise.
        bytes.extend_from_slice(&[0xFE, 0x00, 0x10, 0x7F]);
        // [12..16) 4 bytes padding before the real descriptor.
        bytes.extend_from_slice(b"PAD_");

        // Real descriptor at offset 20:
        //   [16..20) name region
        //   [20..24) manufacturer LE 'hmaY' -> 'Yamh'
        //   [24..28) type LE 'xfua'         -> 'aufx'
        //   [28..32) subtype LE 'pmoC'      -> 'Comp'
        bytes.extend_from_slice(b"NAME"); // name region
        bytes.extend_from_slice(b"hmaY");
        bytes.extend_from_slice(b"xfua");
        bytes.extend_from_slice(b"pmoC");

        // Trailing noise containing a planted false-positive `xfua` with
        // non-printable surrounding bytes.
        bytes.extend_from_slice(&[0x00, 0x01, 0x02, 0x03]);
        bytes.extend_from_slice(b"xfua");
        bytes.extend_from_slice(&[0xFF, 0xFE, 0xFD, 0xFC]);
        bytes.extend_from_slice(&[0xAA, 0xBB, 0xCC, 0xDD]);

        bytes
    }

    #[test]
    fn finds_aumi_midi_processor_descriptor() {
        // Real-world example: Plugin Boutique's Scaler 2 in
        // `~/Music/Logic/ new idea.logicx` is stored as type `aumi`
        // (kAudioUnitType_MIDIProcessor — distinct from `aumf`
        // kAudioUnitType_MusicEffect). Before this fix the scanner
        // ignored the `imua` byte sequence entirely.
        let mut bytes = Vec::new();
        bytes.extend_from_slice(b"PADDING_"); // 8-byte name region
        bytes.extend_from_slice(b"eMai");     // manufacturer LE -> "iaMe"
        bytes.extend_from_slice(b"imua");     // type LE -> "aumi"
        bytes.extend_from_slice(b"cl2S");     // subtype LE -> "S2lc"

        let found = find_aus(&bytes);

        assert_eq!(found.len(), 1);
        assert_eq!(found[0].type_code, "aumi");
        assert_eq!(found[0].subtype, "S2lc");
        assert_eq!(found[0].manufacturer, "iaMe");
    }

    #[test]
    fn rejects_descriptors_with_non_printable_4ccs() {
        let bytes = project_data_shaped_fixture();

        let found = find_aus(&bytes);

        assert_eq!(
            found.len(),
            1,
            "expected exactly one AURef (the real descriptor); got {:?}",
            found
        );
        assert_eq!(found[0].fingerprint(), "aufx/Comp/Yamh");
        assert_eq!(found[0].offset, 24);
    }
}
