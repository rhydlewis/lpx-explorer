//! Parse `auval -l` output.
//!
//! `auval -l` enumerates every Audio Unit installed on the system in
//! column-aligned fixed-width format:
//!
//! ```text
//! aufx Cmpr appl  -  AUDynamicsProcessor (file:/System/Library/...)
//! aumu EZk2 Toon  -  EZdrummer 2
//! ```
//!
//! Per `lpx-toolkit/CLAUDE.md` "auval quirks": the columns are at
//! fixed offsets, NOT whitespace-separated. Manufacturer 4CCs can
//! contain literal spaces (e.g. `"kHs "` for Kilohearts) so any
//! `split_whitespace` approach silently breaks fingerprint matching.
//!
//! Mirrors `lpx_inspect.parse_auval_line` (`lpx_inspect.py:789-796`).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AuvalEntry {
    /// `"{type}/{subtype}/{manufacturer}"` — same shape as
    /// [`crate::AURef::fingerprint`].
    pub fingerprint: String,
    /// AU type 4CC, e.g. `"aumu"`.
    pub type_4cc: String,
    /// Subtype 4CC. Trailing/leading spaces preserved verbatim
    /// (e.g. `"EB  "` for Soundtoys EchoBoy).
    pub subtype_4cc: String,
    /// Manufacturer 4CC. Trailing/leading spaces preserved verbatim
    /// (e.g. `"kHs "` for Kilohearts).
    pub manufacturer_4cc: String,
    /// Human-readable plug-in name. The `(file:...)` suffix `auval`
    /// emits is stripped.
    pub name: String,
}

/// Parse one line of `auval -l`. Returns `None` for header / blank /
/// malformed lines.
pub fn parse_auval_line(line: &str) -> Option<AuvalEntry> {
    let separator = line.find(" - ")?;
    let cols = &line[..separator];
    let rest = &line[separator + 3..];

    if cols.len() < 14 {
        return None;
    }

    let type_4cc = slice_4cc(cols, 0)?;
    let subtype_4cc = slice_4cc(cols, 5)?;
    let manufacturer_4cc = slice_4cc(cols, 10)?;

    let name_end = rest.find("(file:").unwrap_or(rest.len());
    let name = rest[..name_end].trim().to_owned();
    if name.is_empty() {
        return None;
    }

    Some(AuvalEntry {
        fingerprint: format!("{type_4cc}/{subtype_4cc}/{manufacturer_4cc}"),
        type_4cc,
        subtype_4cc,
        manufacturer_4cc,
        name,
    })
}

/// `&line[start..start+4]` as a String, returning None when the slice
/// would cross a non-ASCII byte (multi-byte UTF-8 in the column area
/// indicates malformed input).
fn slice_4cc(line: &str, start: usize) -> Option<String> {
    if !line.is_char_boundary(start) || !line.is_char_boundary(start + 4) {
        return None;
    }
    Some(line[start..start + 4].to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_a_canonical_line() {
        let line = "aumu EZk2 Toon  -  EZdrummer 2";

        let entry = parse_auval_line(line).expect("parsed");

        assert_eq!(entry.type_4cc, "aumu");
        assert_eq!(entry.subtype_4cc, "EZk2");
        assert_eq!(entry.manufacturer_4cc, "Toon");
        assert_eq!(entry.name, "EZdrummer 2");
        assert_eq!(entry.fingerprint, "aumu/EZk2/Toon");
    }

    #[test]
    fn preserves_trailing_space_in_subtype() {
        // 'EB  ' is the subtype slot — trailing spaces are significant
        // (lpx-toolkit/CLAUDE.md auval quirks).
        let line = "aufx EB   SToy  -  EchoBoy";

        let entry = parse_auval_line(line).expect("parsed");

        assert_eq!(entry.subtype_4cc, "EB  ");
        assert_eq!(entry.fingerprint, "aufx/EB  /SToy");
    }

    #[test]
    fn preserves_trailing_space_in_manufacturer() {
        // 'kHs ' = Kilohearts. Manufacturer 4CC has trailing space.
        let line = "aufx Phsr kHs   -  Phase Plant";

        let entry = parse_auval_line(line).expect("parsed");

        assert_eq!(entry.manufacturer_4cc, "kHs ");
        assert_eq!(entry.fingerprint, "aufx/Phsr/kHs ");
    }

    #[test]
    fn strips_the_file_path_suffix_from_the_name() {
        let line = "aufx Cmpr appl  -  AUDynamicsProcessor (file:/System/Library/Frameworks/AudioUnit.framework)";

        let entry = parse_auval_line(line).expect("parsed");

        assert_eq!(entry.name, "AUDynamicsProcessor");
    }

    #[test]
    fn handles_hyphens_inside_the_plugin_name() {
        // The first ' - ' is the column separator. Hyphens inside the
        // name don't confuse the parser because the separator is
        // matched on its leading space.
        let line = "aumu EZdr Toon  -  EZ-Drummer";

        let entry = parse_auval_line(line).expect("parsed");

        assert_eq!(entry.name, "EZ-Drummer");
    }

    #[test]
    fn rejects_lines_without_the_column_separator() {
        // auval emits header / footer lines that don't contain ' - '.
        assert!(parse_auval_line("AU Validation Tool").is_none());
        assert!(parse_auval_line("").is_none());
        assert!(parse_auval_line("CRSR: 31 dBFS, sample rate 44100").is_none());
    }

    #[test]
    fn rejects_lines_too_short_for_the_three_4ccs() {
        assert!(parse_auval_line("aumu EZk2 - foo").is_none());
    }

    #[test]
    fn rejects_lines_with_an_empty_name() {
        let line = "aumu EZk2 Toon  -  ";

        assert!(parse_auval_line(line).is_none());
    }

    #[test]
    fn fingerprint_matches_a_corresponding_au_ref_byte_for_byte() {
        // Cross-check: the fingerprint produced here must equal the one
        // produced by AURef::fingerprint() for the same 4CCs. Lookup
        // semantics depend on this exact equality.
        let entry = parse_auval_line("aumu EZk2 Toon  -  EZdrummer 2").expect("parsed");
        let au_ref = crate::AURef {
            type_code: "aumu".into(),
            subtype: "EZk2".into(),
            manufacturer: "Toon".into(),
            offset: 0,
            display_name: None,
        };

        assert_eq!(entry.fingerprint, au_ref.fingerprint());
    }
}
