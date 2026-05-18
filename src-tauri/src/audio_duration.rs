//! Header-only duration parsing for WAV and AIFF (lpx-explorer-co5).
//!
//! Reads the format chunks at the start of the file — never decodes a
//! single sample. Cheap enough to run synchronously while walking the
//! inventory (one stat + ~80-byte read per file). Returns `None` for
//! anything we don't recognise, including the formats split to the
//! follow-up bead (lpx-explorer-ab4 — M4A/AAC needs an MP4 atom
//! parser) and CAF (already non-previewable).
//!
//! Read-only contract: opens the file for reading, never writes.

use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

/// Best-effort duration in seconds. Returns `None` for unsupported
/// formats, malformed headers, or any IO error — callers render
/// "unknown" rather than treating absence as zero.
pub fn read_duration(path: &Path) -> Option<f64> {
    let mut file = File::open(path).ok()?;
    let mut header = [0u8; 12];
    file.read_exact(&mut header).ok()?;
    match (&header[0..4], &header[8..12]) {
        (b"RIFF", b"WAVE") => parse_wav_duration(&mut file),
        (b"FORM", b"AIFF") | (b"FORM", b"AIFC") => parse_aiff_duration(&mut file),
        _ => None,
    }
}

#[derive(Debug)]
struct WavFmt {
    sample_rate: u32,
    num_channels: u16,
    bits_per_sample: u16,
}

/// WAV: walk RIFF chunks past the 12-byte header looking for `fmt ` +
/// `data`. Both must be present and `bits_per_sample` must be non-zero
/// for the byte-rate divisor to make sense.
///
/// Spec ref: <http://soundfile.sapp.org/doc/WaveFormat/>.
fn parse_wav_duration(file: &mut File) -> Option<f64> {
    let mut fmt: Option<WavFmt> = None;
    let mut data_bytes: Option<u32> = None;

    // Chunk count cap — pathological files with millions of empty
    // chunks would spin here otherwise. Real WAVs have a handful.
    for _ in 0..32 {
        let mut chunk_header = [0u8; 8];
        if file.read_exact(&mut chunk_header).is_err() {
            break;
        }
        let id = &chunk_header[0..4];
        let size = u32::from_le_bytes([
            chunk_header[4],
            chunk_header[5],
            chunk_header[6],
            chunk_header[7],
        ]);

        if id == b"fmt " {
            if size < 16 {
                return None;
            }
            let mut buf = vec![0u8; size as usize];
            file.read_exact(&mut buf).ok()?;
            fmt = Some(WavFmt {
                num_channels: u16::from_le_bytes([buf[2], buf[3]]),
                sample_rate: u32::from_le_bytes([buf[4], buf[5], buf[6], buf[7]]),
                bits_per_sample: u16::from_le_bytes([buf[14], buf[15]]),
            });
        } else if id == b"data" {
            data_bytes = Some(size);
            break;
        } else {
            // Unknown chunk — skip its payload (padded to even).
            let padded = if size % 2 == 1 { size as i64 + 1 } else { size as i64 };
            file.seek(SeekFrom::Current(padded)).ok()?;
        }
    }

    let fmt = fmt?;
    let bytes = data_bytes?;
    if fmt.bits_per_sample == 0 || fmt.num_channels == 0 || fmt.sample_rate == 0 {
        return None;
    }
    let bytes_per_sec = fmt.sample_rate as f64
        * fmt.num_channels as f64
        * (fmt.bits_per_sample as f64 / 8.0);
    if bytes_per_sec == 0.0 {
        return None;
    }
    Some(bytes as f64 / bytes_per_sec)
}

/// AIFF: walk big-endian chunks for `COMM`. Sample rate is encoded as
/// an IEEE-754 80-bit extended float — we convert to f64 with no loss
/// for the integer rates Logic uses (44100, 48000, 88200, 96000, …).
///
/// Spec ref: AIFF-1.3 (1989), Apple Tech Note 1056.
fn parse_aiff_duration(file: &mut File) -> Option<f64> {
    for _ in 0..32 {
        let mut chunk_header = [0u8; 8];
        if file.read_exact(&mut chunk_header).is_err() {
            return None;
        }
        let id = &chunk_header[0..4];
        let size = u32::from_be_bytes([
            chunk_header[4],
            chunk_header[5],
            chunk_header[6],
            chunk_header[7],
        ]);

        if id == b"COMM" {
            if size < 18 {
                return None;
            }
            let mut buf = vec![0u8; size as usize];
            file.read_exact(&mut buf).ok()?;
            let num_sample_frames =
                u32::from_be_bytes([buf[2], buf[3], buf[4], buf[5]]);
            let sample_rate = parse_ieee_80_be(&buf[8..18])?;
            if sample_rate <= 0.0 {
                return None;
            }
            return Some(num_sample_frames as f64 / sample_rate);
        }

        let padded = if size % 2 == 1 { size as i64 + 1 } else { size as i64 };
        file.seek(SeekFrom::Current(padded)).ok()?;
    }
    None
}

/// Decode 10 big-endian bytes of IEEE-754 80-bit extended into f64.
/// Logic only emits positive integer-valued sample rates, so the slow
/// paths (denormals, infinities, NaN) collapse to None — we'd treat
/// them as "unknown" duration anyway.
fn parse_ieee_80_be(bytes: &[u8]) -> Option<f64> {
    if bytes.len() < 10 {
        return None;
    }
    let sign_and_exp = u16::from_be_bytes([bytes[0], bytes[1]]);
    let mantissa = u64::from_be_bytes([
        bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7], bytes[8], bytes[9],
    ]);
    let sign = if sign_and_exp & 0x8000 != 0 { -1.0 } else { 1.0 };
    let exponent = (sign_and_exp & 0x7FFF) as i32 - 16383;

    if mantissa == 0 && exponent == -16383 {
        return Some(0.0);
    }
    // exp2 of a negative exponent below f64's range underflows to 0.0
    // — fine for our purposes, but skip the obviously-broken cases.
    if !(-1000..=1000).contains(&exponent) {
        return None;
    }
    let value = sign * (mantissa as f64) * 2f64.powi(exponent - 63);
    if !value.is_finite() {
        return None;
    }
    Some(value)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    /// Build a minimal 16-bit PCM mono WAV with `frames` samples at
    /// `sample_rate` Hz. Body is zero-filled silence — duration depends
    /// only on header values + data chunk size.
    fn make_wav(frames: u32, sample_rate: u32) -> Vec<u8> {
        let num_channels: u16 = 1;
        let bits_per_sample: u16 = 16;
        let byte_rate =
            sample_rate * num_channels as u32 * (bits_per_sample / 8) as u32;
        let block_align = num_channels * (bits_per_sample / 8);
        let data_size = frames * block_align as u32;

        let mut bytes = Vec::new();
        bytes.extend_from_slice(b"RIFF");
        bytes.extend_from_slice(&(36 + data_size).to_le_bytes());
        bytes.extend_from_slice(b"WAVE");
        bytes.extend_from_slice(b"fmt ");
        bytes.extend_from_slice(&16u32.to_le_bytes());
        bytes.extend_from_slice(&1u16.to_le_bytes()); // PCM
        bytes.extend_from_slice(&num_channels.to_le_bytes());
        bytes.extend_from_slice(&sample_rate.to_le_bytes());
        bytes.extend_from_slice(&byte_rate.to_le_bytes());
        bytes.extend_from_slice(&block_align.to_le_bytes());
        bytes.extend_from_slice(&bits_per_sample.to_le_bytes());
        bytes.extend_from_slice(b"data");
        bytes.extend_from_slice(&data_size.to_le_bytes());
        bytes.resize(bytes.len() + data_size as usize, 0);
        bytes
    }

    /// IEEE-754 80-bit BE encoding of 44100.0 Hz. Mantissa puts the
    /// explicit leading bit at bit 63, exponent biased by 16383.
    /// 44100 = 1.0101_1000_1000_1000... × 2^15  → mantissa
    /// 0xAC44_0000_0000_0000, exponent 16383+15 = 0x400E.
    const IEEE_80_44100: [u8; 10] =
        [0x40, 0x0E, 0xAC, 0x44, 0, 0, 0, 0, 0, 0];

    /// Build a minimal AIFF with N frames at 44100Hz, 16-bit mono.
    /// Contains the COMM chunk + a SSND chunk so the file parses
    /// against general AIFF readers if we ever want to round-trip it.
    fn make_aiff(frames: u32) -> Vec<u8> {
        let mut bytes = Vec::new();
        bytes.extend_from_slice(b"FORM");
        bytes.extend_from_slice(&0u32.to_be_bytes()); // size — irrelevant for our parser
        bytes.extend_from_slice(b"AIFF");

        bytes.extend_from_slice(b"COMM");
        bytes.extend_from_slice(&18u32.to_be_bytes());
        bytes.extend_from_slice(&1u16.to_be_bytes()); // numChannels
        bytes.extend_from_slice(&frames.to_be_bytes()); // numSampleFrames
        bytes.extend_from_slice(&16u16.to_be_bytes()); // sampleSize
        bytes.extend_from_slice(&IEEE_80_44100); // sampleRate
        bytes
    }

    fn write_temp(payload: &[u8]) -> NamedTempFile {
        let mut tmp = NamedTempFile::new().unwrap();
        tmp.write_all(payload).unwrap();
        tmp.flush().unwrap();
        tmp
    }

    #[test]
    fn returns_none_for_files_smaller_than_the_12_byte_header() {
        // Defensive: a 4-byte file would read_exact-fail. Confirms we
        // gracefully no-op rather than panic on malformed inputs.
        let tmp = write_temp(b"RIFF");
        assert!(read_duration(tmp.path()).is_none());
    }

    #[test]
    fn returns_none_for_unknown_riff_form_types() {
        // Some Logic projects contain ADPCM / Sony Wave64 / etc — none
        // of which match our RIFF/WAVE | FORM/AIFF gates. Don't guess.
        let mut bytes = Vec::new();
        bytes.extend_from_slice(b"RIFF");
        bytes.extend_from_slice(&0u32.to_le_bytes());
        bytes.extend_from_slice(b"WV64");
        let tmp = write_temp(&bytes);
        assert!(read_duration(tmp.path()).is_none());
    }

    #[test]
    fn wav_one_second_at_44100hz_mono_16bit_returns_1_0_seconds() {
        // 1.0 s exactly: 44100 frames at 44100Hz. Exercises the
        // round-trip from byte-count → bytes-per-second → seconds.
        let bytes = make_wav(44100, 44100);
        let tmp = write_temp(&bytes);

        let duration = read_duration(tmp.path()).expect("WAV parse");

        assert!(
            (duration - 1.0).abs() < 1e-6,
            "expected ~1.0s, got {duration}"
        );
    }

    #[test]
    fn wav_with_unknown_chunk_before_fmt_skips_past_and_finds_format() {
        // BWF (Broadcast Wave Format) files often have a bext chunk
        // before fmt. Some Logic exports are BWF. The chunk-walk must
        // skip past unknown chunks instead of giving up.
        let mut bytes = Vec::new();
        bytes.extend_from_slice(b"RIFF");
        bytes.extend_from_slice(&0u32.to_le_bytes());
        bytes.extend_from_slice(b"WAVE");
        // bext-shaped chunk: 10 bytes of payload + even-padded.
        bytes.extend_from_slice(b"bext");
        bytes.extend_from_slice(&10u32.to_le_bytes());
        bytes.extend_from_slice(b"0123456789");
        // Real WAV body for 0.5s mono 44100/16bit.
        let mut tail = make_wav(22050, 44100);
        // make_wav builds its own RIFF/WAVE header — strip those 12
        // bytes so we splice only the fmt + data chunks in.
        tail.drain(0..12);
        bytes.extend_from_slice(&tail);
        let tmp = write_temp(&bytes);

        let duration = read_duration(tmp.path()).expect("WAV parse");
        assert!(
            (duration - 0.5).abs() < 1e-6,
            "expected ~0.5s, got {duration}"
        );
    }

    #[test]
    fn aiff_with_44100_frames_at_44100hz_returns_1_0_seconds() {
        // AIFF byte order is BE; sample rate is an 80-bit IEEE float.
        // Both encodings exercised by a single 1-second fixture.
        let bytes = make_aiff(44100);
        let tmp = write_temp(&bytes);

        let duration = read_duration(tmp.path()).expect("AIFF parse");

        assert!(
            (duration - 1.0).abs() < 1e-6,
            "expected ~1.0s, got {duration}"
        );
    }

    #[test]
    fn aiff_with_zero_sample_rate_returns_none() {
        // Pathological: COMM with a zero sample rate would divide by
        // zero. Mirror the WAV guard and return None.
        let mut bytes = Vec::new();
        bytes.extend_from_slice(b"FORM");
        bytes.extend_from_slice(&0u32.to_be_bytes());
        bytes.extend_from_slice(b"AIFF");
        bytes.extend_from_slice(b"COMM");
        bytes.extend_from_slice(&18u32.to_be_bytes());
        bytes.extend_from_slice(&1u16.to_be_bytes());
        bytes.extend_from_slice(&44100u32.to_be_bytes());
        bytes.extend_from_slice(&16u16.to_be_bytes());
        bytes.extend_from_slice(&[0u8; 10]); // zero IEEE 80-bit
        let tmp = write_temp(&bytes);

        assert!(read_duration(tmp.path()).is_none());
    }

    #[test]
    fn returns_none_for_caf_and_other_unsupported_extensions() {
        // Sanity: a file with neither a RIFF/WAVE nor a FORM/AIFF
        // signature is None. CAF freeze files would land here, as
        // would MP3/M4A/AAC — those are deliberately not handled in
        // this bead's scope (see lpx-explorer-ab4).
        let tmp = write_temp(b"caff\x00\x01\x00\x00\x00\x00\x00\x00rest");
        assert!(read_duration(tmp.path()).is_none());
    }
}
