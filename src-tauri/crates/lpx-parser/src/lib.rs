//! Read-only parser for Logic Pro `.logicx` `ProjectData` binaries.
//!
//! Walking-skeleton scope: locate Audio Unit (AU) component descriptors
//! inside the binary blob. The format is undocumented; offsets here
//! mirror the empirically-derived Python implementation at
//! `lpx-toolkit/lpx_inspect.py:706-728`.

use serde::Serialize;

/// Reference to an Audio Unit component descriptor as stored in
/// `ProjectData`. The three 4CCs are returned in the human-readable
/// order Logic / `auval` displays them — i.e. with the little-endian
/// reversal already undone.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct AURef {
    /// AU type code, e.g. `"aumu"` (instrument), `"aufx"` (audio fx),
    /// `"aumf"` (MIDI fx).
    pub type_code: String,
    /// AU subtype 4CC, e.g. `"EZk2"`.
    pub subtype: String,
    /// Manufacturer 4CC, e.g. `"Toon"`.
    pub manufacturer: String,
    /// Byte offset of the type-code 4CC in the input.
    pub offset: usize,
}

impl AURef {
    /// `"{type}/{subtype}/{manufacturer}"` — the lookup key shared with
    /// `auval -l` output. Trailing/leading spaces are preserved verbatim.
    pub fn fingerprint(&self) -> String {
        format!("{}/{}/{}", self.type_code, self.subtype, self.manufacturer)
    }
}

/// AU type 4CCs as they appear *in the file* — i.e. little-endian, so
/// the human-readable names (`"aumu"`, `"aufx"`, `"aumf"`) are reversed.
const AU_TYPE_TAGS_LE: [&[u8; 4]; 3] = [
    b"umua", // aumu — instrument
    b"xfua", // aufx — audio effect
    b"fmua", // aumf — MIDI effect
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
/// Each descriptor is three contiguous 4-byte codes laid out as
/// `manufacturer | type | subtype`, all little-endian. The type field
/// is the anchor: we look for `umua` / `xfua` / `fmua` and read 4 bytes
/// either side to recover manufacturer + subtype.
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

            found.push(AURef {
                type_code: reverse_4cc(type_le),
                subtype: reverse_4cc(sub_le),
                manufacturer: reverse_4cc(mfr_le),
                offset: off,
            });
        }
    }
    found
}

fn find_subslice(haystack: &[u8], needle: &[u8; 4]) -> Option<usize> {
    haystack.windows(4).position(|w| w == needle)
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
}
