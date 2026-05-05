//! `MetaData.plist` field extraction.
//!
//! Logic Pro stores project-level metadata in a standard Apple plist file
//! at `<bundle>/Alternatives/<n>/MetaData.plist`. This module ports the
//! field-level extraction from `lpx-toolkit/lpx_inspect.py:1280-1296`.
//!
//! Bytes-only contract: callers read the plist file and pass `&[u8]` so
//! the parser crate cannot mutate the source.

use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ProjectMetadata {
    /// Key signature (e.g. "C", "F#"). Defaults to "?" when absent.
    pub song_key: String,
    /// "Major" / "Minor". Defaults to "?" when absent.
    pub song_gender: String,
    pub bpm: f64,
    pub sig_numerator: u32,
    pub sig_denominator: u32,
    pub track_count: u32,
    pub sample_rate: u32,
    pub audio_file_count: u32,
    pub impulse_response_count: u32,
    pub frame_rate_index: u32,
}

#[derive(Debug, thiserror::Error, Serialize)]
#[serde(tag = "kind", content = "message")]
pub enum MetadataError {
    #[error("invalid plist: {0}")]
    Invalid(String),
}

/// Parse a `MetaData.plist` payload (XML or binary) into a [`ProjectMetadata`].
///
/// Missing keys use the same defaults as the Python implementation
/// (`lpx_inspect.parse_project`): key/gender = `"?"`, integer fields = 0,
/// signature = 4/4. Non-fatal: a plist with unexpected types for known keys
/// silently falls back to defaults rather than erroring.
pub fn parse_metadata_plist(bytes: &[u8]) -> Result<ProjectMetadata, MetadataError> {
    let value: plist::Value = plist::from_bytes(bytes)
        .map_err(|e| MetadataError::Invalid(e.to_string()))?;
    let dict = value
        .as_dictionary()
        .ok_or_else(|| MetadataError::Invalid("plist root is not a dictionary".into()))?;

    Ok(ProjectMetadata {
        song_key: string_at(dict, "SongKey").unwrap_or_else(|| "?".into()),
        song_gender: string_at(dict, "SongGenderKey").unwrap_or_else(|| "?".into()),
        bpm: real_at(dict, "BeatsPerMinute").unwrap_or(0.0),
        sig_numerator: u32_at(dict, "SongSignatureNumerator").unwrap_or(4),
        sig_denominator: u32_at(dict, "SongSignatureDenominator").unwrap_or(4),
        track_count: u32_at(dict, "NumberOfTracks").unwrap_or(0),
        sample_rate: u32_at(dict, "SampleRate").unwrap_or(0),
        audio_file_count: array_len_at(dict, "AudioFiles"),
        impulse_response_count: array_len_at(dict, "ImpulsResponsesFiles"),
        frame_rate_index: u32_at(dict, "FrameRateIndex").unwrap_or(0),
    })
}

fn string_at(dict: &plist::Dictionary, key: &str) -> Option<String> {
    dict.get(key)?.as_string().map(str::to_owned)
}

fn real_at(dict: &plist::Dictionary, key: &str) -> Option<f64> {
    let value = dict.get(key)?;
    value.as_real().or_else(|| value.as_signed_integer().map(|n| n as f64))
}

fn u32_at(dict: &plist::Dictionary, key: &str) -> Option<u32> {
    let n = dict.get(key)?.as_signed_integer()?;
    if n < 0 {
        return None;
    }
    u32::try_from(n).ok()
}

fn array_len_at(dict: &plist::Dictionary, key: &str) -> u32 {
    dict.get(key)
        .and_then(plist::Value::as_array)
        .map(|a| a.len() as u32)
        .unwrap_or(0)
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
    fn extracts_all_documented_fields() {
        let bytes = xml_plist(
            "<key>SongKey</key><string>C</string>\
             <key>SongGenderKey</key><string>major</string>\
             <key>BeatsPerMinute</key><real>120.0</real>\
             <key>SongSignatureNumerator</key><integer>4</integer>\
             <key>SongSignatureDenominator</key><integer>4</integer>\
             <key>NumberOfTracks</key><integer>3</integer>\
             <key>SampleRate</key><integer>44100</integer>\
             <key>AudioFiles</key><array><string>a.wav</string></array>\
             <key>ImpulsResponsesFiles</key><array></array>\
             <key>FrameRateIndex</key><integer>1</integer>",
        );

        let m = parse_metadata_plist(&bytes).expect("ok");

        assert_eq!(m.song_key, "C");
        assert_eq!(m.song_gender, "major");
        assert!((m.bpm - 120.0).abs() < f64::EPSILON);
        assert_eq!(m.sig_numerator, 4);
        assert_eq!(m.sig_denominator, 4);
        assert_eq!(m.track_count, 3);
        assert_eq!(m.sample_rate, 44100);
        assert_eq!(m.audio_file_count, 1);
        assert_eq!(m.impulse_response_count, 0);
        assert_eq!(m.frame_rate_index, 1);
    }

    #[test]
    fn missing_keys_use_pythonish_defaults() {
        let bytes = xml_plist("");

        let m = parse_metadata_plist(&bytes).expect("ok");

        assert_eq!(m.song_key, "?");
        assert_eq!(m.song_gender, "?");
        assert_eq!(m.bpm, 0.0);
        assert_eq!(m.sig_numerator, 4);
        assert_eq!(m.sig_denominator, 4);
        assert_eq!(m.track_count, 0);
        assert_eq!(m.sample_rate, 0);
        assert_eq!(m.audio_file_count, 0);
        assert_eq!(m.impulse_response_count, 0);
        assert_eq!(m.frame_rate_index, 0);
    }

    #[test]
    fn returns_invalid_for_garbage_input() {
        let result = parse_metadata_plist(b"not a plist");

        assert!(matches!(result, Err(MetadataError::Invalid(_))));
    }

    #[test]
    fn audio_files_count_reflects_array_length_only() {
        // The Python tool only counts the array length; doesn't validate
        // that the entries are reachable on disk. Mirror that semantic.
        let bytes = xml_plist(
            "<key>AudioFiles</key>\
             <array><string>a.wav</string><string>b.wav</string><string>c.wav</string></array>",
        );

        let m = parse_metadata_plist(&bytes).expect("ok");

        assert_eq!(m.audio_file_count, 3);
    }
}
