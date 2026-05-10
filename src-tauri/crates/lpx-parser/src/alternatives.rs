//! `ProjectInformation.plist` parsing — the alternatives manifest.
//!
//! Logic Pro stores per-bundle alternative info in a standard Apple plist
//! at `<bundle>/Resources/ProjectInformation.plist`. Findings from the
//! 2026-05-07 alternatives spike (`lpx-explorer-rob`):
//!
//!   * `VariantNames`   — `Dict<String, String>` keyed by zero-padded
//!                        index ("0", "1", …). Newer Logic versions also
//!                        emit `VariantNamesV2` with a `{PROJECT_NAME}`
//!                        placeholder substituted at display time.
//!   * `ActiveVariant`  — integer index of the variant Logic last opened.
//!                        Absent on single-variant projects (default 0).
//!   * Single-variant projects emit `VariantNames = { "0": "<name>" }`
//!                        and lack `ActiveVariant`.
//!
//! Bytes-only contract — caller reads the plist file and passes `&[u8]`,
//! so this crate cannot touch the filesystem.

use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Alternative {
    /// 0-based index. Maps to the `Alternatives/{index:03}/` subdirectory.
    pub index: u32,
    /// Display name resolved from `VariantNamesV2` (with `{PROJECT_NAME}`
    /// substituted) or `VariantNames`. Empty string falls back to the
    /// bundle name on the caller side.
    pub display_name: String,
    /// True for the variant whose index matches `ActiveVariant`. Exactly
    /// one entry has `is_active = true` per bundle (the default 0 case
    /// flags index 0).
    pub is_active: bool,
}

#[derive(Debug, thiserror::Error, Serialize)]
#[serde(tag = "kind", content = "message")]
pub enum AlternativesError {
    #[error("invalid plist: {0}")]
    Invalid(String),
}

const PROJECT_NAME_PLACEHOLDER: &str = "{PROJECT_NAME}";

/// Parse a `ProjectInformation.plist` payload into a list of alternatives.
///
/// `bundle_name` is substituted into `{PROJECT_NAME}` placeholders in
/// `VariantNamesV2`. Pass the bundle's basename without the `.logicx`
/// suffix (e.g. `"new idea"` for `new idea.logicx`).
///
/// When the plist exists but has no `VariantNames` keys, returns an empty
/// vec; the caller decides whether to fall back to a default single-variant
/// representation (typically `[Alternative { 0, bundle_name, true }]`).
pub fn parse_alternatives_manifest(
    bytes: &[u8],
    bundle_name: &str,
) -> Result<Vec<Alternative>, AlternativesError> {
    let value: plist::Value = plist::from_bytes(bytes)
        .map_err(|e| AlternativesError::Invalid(e.to_string()))?;
    let dict = value
        .as_dictionary()
        .ok_or_else(|| AlternativesError::Invalid("plist root is not a dictionary".into()))?;

    let active_variant = dict
        .get("ActiveVariant")
        .and_then(plist::Value::as_signed_integer)
        .filter(|n| *n >= 0)
        .and_then(|n| u32::try_from(n).ok())
        .unwrap_or(0);

    // Prefer V2 (newer Logic versions, with `{PROJECT_NAME}` placeholder)
    // and fall back to the V1 dict when V2 is absent or has no entries.
    let names_v2 = dict.get("VariantNamesV2").and_then(plist::Value::as_dictionary);
    let names_v1 = dict.get("VariantNames").and_then(plist::Value::as_dictionary);

    let mut indexed: Vec<(u32, String)> = match (names_v2, names_v1) {
        (Some(v2), _) if !v2.is_empty() => collect_named(v2, bundle_name),
        (_, Some(v1)) => collect_named(v1, bundle_name),
        _ => Vec::new(),
    };
    indexed.sort_by_key(|(i, _)| *i);

    Ok(indexed
        .into_iter()
        .map(|(index, display_name)| Alternative {
            index,
            display_name,
            is_active: index == active_variant,
        })
        .collect())
}

fn collect_named(
    dict: &plist::Dictionary,
    bundle_name: &str,
) -> Vec<(u32, String)> {
    dict.iter()
        .filter_map(|(key, value)| {
            let index = key.parse::<u32>().ok()?;
            let raw = value.as_string()?;
            let resolved = raw.replace(PROJECT_NAME_PLACEHOLDER, bundle_name);
            Some((index, resolved))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

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
    fn parses_two_variant_project_with_active_set() {
        // Mirror of ~/Music/Logic/new idea.logicx/Resources/ProjectInformation.plist
        // captured during the spike. ActiveVariant=1 means index 1 is active.
        let bytes = xml_plist(
            r#"<key>ActiveVariant</key><integer>1</integer>
               <key>VariantNames</key><dict>
                 <key>0</key><string>new idea</string>
                 <key>1</key><string>new idea - alt 1</string>
               </dict>
               <key>VariantNamesV2</key><dict>
                 <key>0</key><string>{PROJECT_NAME}</string>
                 <key>1</key><string>{PROJECT_NAME} - alt 1</string>
               </dict>"#,
        );

        let alts = parse_alternatives_manifest(&bytes, "new idea").expect("ok");

        assert_eq!(alts.len(), 2);
        assert_eq!(alts[0], Alternative {
            index: 0,
            display_name: "new idea".into(),
            is_active: false,
        });
        assert_eq!(alts[1], Alternative {
            index: 1,
            display_name: "new idea - alt 1".into(),
            is_active: true,
        });
    }

    #[test]
    fn defaults_active_variant_to_zero_when_missing() {
        // Single-variant projects in the wild don't emit ActiveVariant.
        let bytes = xml_plist(
            r#"<key>VariantNames</key><dict>
                 <key>0</key><string>captain</string>
               </dict>
               <key>VariantNamesV2</key><dict>
                 <key>0</key><string>{PROJECT_NAME}</string>
               </dict>"#,
        );

        let alts = parse_alternatives_manifest(&bytes, "captain").expect("ok");

        assert_eq!(alts.len(), 1);
        assert!(alts[0].is_active);
    }

    #[test]
    fn substitutes_project_name_placeholder_in_v2() {
        let bytes = xml_plist(
            r#"<key>VariantNamesV2</key><dict>
                 <key>0</key><string>{PROJECT_NAME} live</string>
               </dict>"#,
        );

        let alts = parse_alternatives_manifest(&bytes, "Drum Loops").expect("ok");

        assert_eq!(alts[0].display_name, "Drum Loops live");
    }

    #[test]
    fn falls_back_to_v1_when_v2_is_absent() {
        let bytes = xml_plist(
            r#"<key>VariantNames</key><dict>
                 <key>0</key><string>old project</string>
               </dict>"#,
        );

        let alts = parse_alternatives_manifest(&bytes, "old project").expect("ok");

        assert_eq!(alts[0].display_name, "old project");
    }

    #[test]
    fn falls_back_to_v1_when_v2_is_empty() {
        let bytes = xml_plist(
            r#"<key>VariantNames</key><dict>
                 <key>0</key><string>real name</string>
               </dict>
               <key>VariantNamesV2</key><dict></dict>"#,
        );

        let alts = parse_alternatives_manifest(&bytes, "anything").expect("ok");

        assert_eq!(alts[0].display_name, "real name");
    }

    #[test]
    fn returns_empty_when_no_variant_keys_present() {
        let bytes = xml_plist(r#"<key>BundleVersion</key><integer>2</integer>"#);

        let alts = parse_alternatives_manifest(&bytes, "x").expect("ok");

        assert!(alts.is_empty());
    }

    #[test]
    fn sorts_by_numeric_index_not_string_order() {
        // Plist dicts don't guarantee ordering; explicit sort handles
        // out-of-order keys (which can happen with binary plists).
        let bytes = xml_plist(
            r#"<key>VariantNames</key><dict>
                 <key>2</key><string>third</string>
                 <key>0</key><string>first</string>
                 <key>1</key><string>second</string>
               </dict>"#,
        );

        let alts = parse_alternatives_manifest(&bytes, "x").expect("ok");

        assert_eq!(
            alts.iter().map(|a| &a.display_name[..]).collect::<Vec<_>>(),
            vec!["first", "second", "third"],
        );
        assert_eq!(alts.iter().map(|a| a.index).collect::<Vec<_>>(), vec![0, 1, 2]);
    }

    #[test]
    fn skips_keys_that_are_not_numeric_indices() {
        let bytes = xml_plist(
            r#"<key>VariantNames</key><dict>
                 <key>0</key><string>kept</string>
                 <key>foo</key><string>dropped</string>
               </dict>"#,
        );

        let alts = parse_alternatives_manifest(&bytes, "x").expect("ok");

        assert_eq!(alts.len(), 1);
        assert_eq!(alts[0].display_name, "kept");
    }

    #[test]
    fn rejects_non_dictionary_root() {
        let bytes = b"<?xml version=\"1.0\"?>\n\
                      <plist version=\"1.0\"><array/></plist>".to_vec();

        let err = parse_alternatives_manifest(&bytes, "x").unwrap_err();
        assert!(matches!(err, AlternativesError::Invalid(_)));
    }
}
