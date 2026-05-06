//! Apple-stock-plug-in scanner.
//!
//! Apple's stock plug-ins (Logic-bundled instruments and effects like
//! Compressor, Limiter, ChromaVerb, Bass Amp, Alchemy) are not stored
//! as standard 4CC `(manufacturer, type, subtype)` triples in
//! `ProjectData`. They live inside plug-in-slot records anchored on the
//! `GAME` 4CC marker.
//!
//! Record layout (offsets relative to the `G` of `GAME`):
//!
//! ```text
//!   -16    -14   -12                    0     +4
//!    | flags | 02 | 12-byte ASCII name | GAME | ...
//!                  (null-padded)
//! ```
//!
//! - The byte at offset `-13` (the second flag byte) is consistently
//!   `0x02`. The byte at `-14` distinguishes plug-in kind: `0x02` for
//!   effect inserts, `0x00` for instrument slots.
//! - The 12-byte name field is the user-facing plug-in name as Logic
//!   shows it (e.g. `"Bass Amp"`, `"ChromaVerb"`, `"Alchemy"`).
//! - The full name lives in this field even when shorter than 12 bytes;
//!   the trailing space is null-padded.
//!
//! Empirically derived against `~/Music/Logic/ new idea.logicx` on
//! 2026-05-06 (lpx-explorer-0wo). Verified: 7 stock plug-in slots
//! recovered (Alchemy + 6 audio FX). Zero false positives across all
//! 35 `GAME` byte sequences in that file once the `0x02` discriminator
//! and printable-ASCII guard are applied.
//!
//! `find_apple_stock_aus` synthesises a plausible `(type, subtype,
//! manufacturer)` triple — the actual 4CC fingerprint isn't recoverable
//! from this format. Callers that need the real fingerprint should use
//! the `display_name` field plus an `auval -l` lookup at the application
//! layer.
//!
//! Bytes-only contract: the parser crate cannot open files.

use crate::AURef;

const NAME_FIELD_LEN: usize = 12;
const MARKER: &[u8; 4] = b"GAME";
const SECOND_FLAG_BYTE: u8 = 0x02;
const FX_FIRST_FLAG: u8 = 0x02;
const INSTRUMENT_FIRST_FLAG: u8 = 0x00;
const APPLE_MANUFACTURER: &str = "appl";

/// Static lookup mapping the recovered 12-byte display name to the real
/// `(type, subtype)` `auval -l` fingerprint pair. Manufacturer is always
/// `"appl"` for Logic Pro stock plug-ins, so it isn't repeated here.
///
/// The GAME-marker storage shape doesn't carry the AU 4CC fingerprint —
/// only the user-facing name. This table converts the name back into the
/// fingerprint Logic registers with the AU host so it cross-references
/// against `auval -l` output (and so two scanners detecting the same
/// plug-in via different storage shapes agree on identity).
///
/// Entries are added only when verified against `auval -l` from a
/// stock-Logic install — guessing a subtype risks false positives in
/// CompatibilityVerdict's "missing" count. Names absent from this table
/// fall through to [`synth_subtype`] and remain covered by the
/// `display_name`-based "always installed" shortcut in CompatibilityVerdict.
///
/// Verified entries:
/// - `Compressor → aufx/Comp/appl` (cross-checked against
///   `lpx-toolkit/tests/test_diagnostics.py`).
///
/// Unverified names recovered from the repro project but absent here:
/// `Bass Amp`, `Limiter`, `Phat FX`, `Graph EQ`, `ChromaGlow`, `Alchemy`.
/// Filed as a follow-up issue.
const STOCK_FINGERPRINTS: &[(&str, &str, &str)] =
    &[("Compressor", "aufx", "Comp")];

/// Look up the `(type, subtype)` for a known Apple stock plug-in display
/// name. Case-sensitive — `auval -l` is too.
fn lookup_stock_fingerprint(display_name: &str) -> Option<(&'static str, &'static str)> {
    STOCK_FINGERPRINTS
        .iter()
        .find(|(name, _, _)| *name == display_name)
        .map(|(_, type_code, subtype)| (*type_code, *subtype))
}

/// Scan `raw` for Apple stock plug-in slot records and return one
/// [`AURef`] per match. Every match has `display_name = Some(<name>)`.
pub fn find_apple_stock_aus(raw: &[u8]) -> Vec<AURef> {
    let mut out: Vec<AURef> = Vec::new();
    if raw.len() < NAME_FIELD_LEN + MARKER.len() + 2 {
        return out;
    }
    let mut i = NAME_FIELD_LEN + 2; // earliest position GAME could sit
    while i + MARKER.len() <= raw.len() {
        if &raw[i..i + MARKER.len()] != MARKER {
            i += 1;
            continue;
        }
        let name_start = i - NAME_FIELD_LEN;
        let flag1 = raw[name_start - 2];
        let flag2 = raw[name_start - 1];
        if flag2 != SECOND_FLAG_BYTE {
            i += 1;
            continue;
        }
        let kind_type = match flag1 {
            FX_FIRST_FLAG => "aufx",
            INSTRUMENT_FIRST_FLAG => "aumu",
            _ => {
                i += 1;
                continue;
            }
        };
        let name_bytes = &raw[name_start..i];
        let name_end = name_bytes
            .iter()
            .position(|&b| b == 0)
            .unwrap_or(NAME_FIELD_LEN);
        if name_end == 0 {
            i += 1;
            continue;
        }
        if !name_bytes[..name_end]
            .iter()
            .all(|&b| (0x20..=0x7e).contains(&b))
        {
            i += 1;
            continue;
        }
        // Trailing bytes after the name (within the 12-byte field) must
        // all be NUL — guards against false positives where `GAME` happens
        // to follow ASCII garbage.
        if name_bytes[name_end..].iter().any(|&b| b != 0) {
            i += 1;
            continue;
        }
        let display_name = std::str::from_utf8(&name_bytes[..name_end])
            .expect("printable ASCII")
            .to_owned();
        let (type_code, subtype) = match lookup_stock_fingerprint(&display_name) {
            Some((t, s)) => (t.to_owned(), s.to_owned()),
            None => (kind_type.into(), synth_subtype(&display_name)),
        };
        out.push(AURef {
            type_code,
            subtype,
            manufacturer: APPLE_MANUFACTURER.into(),
            offset: name_start,
            display_name: Some(display_name),
        });
        // Advance past the marker so a single record isn't matched twice.
        i += MARKER.len();
    }
    out
}

/// Synthesise a deterministic 4-character lowercase subtype from a
/// display name. The real subtype isn't recoverable from this storage
/// format, but the fingerprint convention requires four characters.
/// Pads short names with `'x'` and strips non-alphanumeric characters.
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

#[cfg(test)]
mod tests {
    use super::*;

    /// Build a GAME-pattern record:
    ///   [pad][flag1][flag2=0x02][12-byte name field, null-padded][GAME][trailer]
    fn record(flag1: u8, name: &str, trailer: &[u8]) -> Vec<u8> {
        assert!(name.len() <= NAME_FIELD_LEN);
        let mut buf = Vec::new();
        buf.extend_from_slice(&[0u8; 8]); // leading pad — index room for flags
        buf.push(flag1);
        buf.push(SECOND_FLAG_BYTE);
        buf.extend_from_slice(name.as_bytes());
        // null-pad the name field to NAME_FIELD_LEN bytes
        for _ in name.len()..NAME_FIELD_LEN {
            buf.push(0x00);
        }
        buf.extend_from_slice(MARKER);
        buf.extend_from_slice(trailer);
        buf
    }

    #[test]
    fn finds_an_audio_fx_slot() {
        // Real-world example: Logic stock Compressor sits under flag1=0x02.
        let bytes = record(FX_FIRST_FLAG, "Compressor", &[0u8; 8]);

        let found = find_apple_stock_aus(&bytes);

        assert_eq!(found.len(), 1);
        assert_eq!(found[0].type_code, "aufx");
        assert_eq!(found[0].manufacturer, "appl");
        assert_eq!(found[0].display_name.as_deref(), Some("Compressor"));
    }

    #[test]
    fn finds_an_instrument_slot() {
        // Alchemy sits under flag1=0x00 (instrument variant).
        let bytes = record(INSTRUMENT_FIRST_FLAG, "Alchemy", &[0u8; 8]);

        let found = find_apple_stock_aus(&bytes);

        assert_eq!(found.len(), 1);
        assert_eq!(found[0].type_code, "aumu");
        assert_eq!(found[0].display_name.as_deref(), Some("Alchemy"));
    }

    #[test]
    fn rejects_unrecognised_first_flag() {
        // First flag byte that isn't 0x02 or 0x00 — likely binary noise
        // that happens to contain `GAME`.
        let bytes = record(0xff, "Compressor", &[0u8; 8]);

        let found = find_apple_stock_aus(&bytes);

        assert!(found.is_empty(), "expected no records, got {:?}", found);
    }

    #[test]
    fn rejects_non_zero_padding_after_name() {
        // Manually build: flag1=0x02 flag2=0x02 then "Hi" + 0xff repeats
        // (instead of nulls) + GAME. The 0xff bytes corrupt the name field.
        let mut buf = vec![0u8; 8];
        buf.push(FX_FIRST_FLAG);
        buf.push(SECOND_FLAG_BYTE);
        buf.extend_from_slice(b"Hi");
        for _ in 2..NAME_FIELD_LEN {
            buf.push(0xff);
        }
        buf.extend_from_slice(MARKER);

        let found = find_apple_stock_aus(&buf);

        assert!(found.is_empty());
    }

    #[test]
    fn rejects_wrong_second_flag_byte() {
        let mut buf = vec![0u8; 8];
        buf.push(FX_FIRST_FLAG);
        buf.push(0x05); // not 0x02
        buf.extend_from_slice(b"Compressor\0\0");
        buf.extend_from_slice(MARKER);

        let found = find_apple_stock_aus(&buf);

        assert!(found.is_empty());
    }

    #[test]
    fn rejects_empty_name_field() {
        let bytes = record(FX_FIRST_FLAG, "", &[0u8; 8]);

        let found = find_apple_stock_aus(&bytes);

        assert!(found.is_empty());
    }

    #[test]
    fn skips_garbage_game_bytes_in_a_realistic_blob() {
        // Two real records flanked by binary noise containing the literal
        // `GAME` bytes that aren't preceded by a valid flag-byte pair.
        let mut buf = Vec::new();
        // Garbage GAME — flag bytes are 0xff/0xff, will be rejected.
        buf.extend_from_slice(&[0xff; 14]);
        buf.extend_from_slice(MARKER);
        // Real audio-FX record:
        buf.extend_from_slice(&record(FX_FIRST_FLAG, "Limiter", &[0u8; 4]));
        // More garbage:
        buf.extend_from_slice(&[0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07,
                                0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d]);
        buf.extend_from_slice(MARKER);
        // Real instrument record:
        buf.extend_from_slice(&record(INSTRUMENT_FIRST_FLAG, "Alchemy", &[0u8; 4]));

        let found = find_apple_stock_aus(&buf);

        let names: Vec<_> = found.iter().filter_map(|a| a.display_name.clone()).collect();
        assert_eq!(names, vec!["Limiter".to_owned(), "Alchemy".to_owned()]);
    }

    #[test]
    fn synth_subtype_is_deterministic_and_4_chars() {
        assert_eq!(synth_subtype("Compressor"), "comp");
        assert_eq!(synth_subtype("Bass Amp"), "bass");
        assert_eq!(synth_subtype("Graph EQ"), "grap");
        assert_eq!(synth_subtype("Hi"), "hixx");
        assert_eq!(synth_subtype(""), "xxxx");
    }

    #[test]
    fn known_display_name_yields_real_auval_fingerprint() {
        // Logic Pro registers its bundled Compressor as `aufx/Comp/appl`
        // — the real fingerprint emitted by `auval -l`. Before the static
        // lookup table the parser synthesised `aufx/comp/appl` (lowercase
        // 'c'), which never matched the registry.
        let bytes = record(FX_FIRST_FLAG, "Compressor", &[0u8; 8]);

        let found = find_apple_stock_aus(&bytes);

        assert_eq!(found.len(), 1);
        assert_eq!(
            found[0].fingerprint(),
            "aufx/Comp/appl",
            "Compressor must round-trip to the auval-published fingerprint",
        );
        assert_eq!(found[0].display_name.as_deref(), Some("Compressor"));
    }

    #[test]
    fn unknown_display_name_falls_back_to_synthesised_fingerprint() {
        // Names we haven't yet mapped (no entry in STOCK_FINGERPRINTS)
        // keep the synthesised triple so they still surface in the UI
        // — CompatibilityVerdict treats display_name-bearing AURefs as
        // always installed, which masks the synthesised-fingerprint gap
        // until we extend the table.
        let bytes = record(FX_FIRST_FLAG, "MysteryAU", &[0u8; 8]);

        let found = find_apple_stock_aus(&bytes);

        assert_eq!(found.len(), 1);
        assert_eq!(found[0].fingerprint(), "aufx/myst/appl");
        assert_eq!(found[0].display_name.as_deref(), Some("MysteryAU"));
    }

    #[test]
    fn instrument_lookup_uses_table_type_not_flag_byte() {
        // The 12-byte name field comes before the GAME marker; the type
        // (instrument vs effect) is in the flag byte. The static lookup
        // takes precedence — if the table maps "Compressor" → aufx, even
        // a (corrupt) instrument-flagged record produces aufx output.
        // Guards against the regression where a bit-flipped flag byte
        // would silently misfile a known plug-in.
        let bytes = record(INSTRUMENT_FIRST_FLAG, "Compressor", &[0u8; 8]);

        let found = find_apple_stock_aus(&bytes);

        assert_eq!(found.len(), 1);
        assert_eq!(found[0].type_code, "aufx");
        assert_eq!(found[0].subtype, "Comp");
    }

    #[test]
    fn lookup_stock_fingerprint_is_case_sensitive() {
        // Display names recovered from the GAME field preserve Logic's
        // exact capitalisation. The lookup must not accidentally lowercase
        // — `auval -l` is case-sensitive too.
        assert_eq!(
            lookup_stock_fingerprint("Compressor"),
            Some(("aufx", "Comp")),
        );
        assert_eq!(lookup_stock_fingerprint("compressor"), None);
        assert_eq!(lookup_stock_fingerprint("COMPRESSOR"), None);
    }

    #[test]
    fn returned_offset_points_at_name_field_start() {
        // The byte-offset heuristic in assign_aus uses this offset to
        // join AURefs to channel-strip records. It must point at the
        // start of the plug-in slot record, not at the `GAME` marker.
        let bytes = record(FX_FIRST_FLAG, "Compressor", &[0u8; 8]);

        let found = find_apple_stock_aus(&bytes);

        // Record starts at offset 10: 8-byte pad + 2 flag bytes.
        assert_eq!(found[0].offset, 10);
    }
}
