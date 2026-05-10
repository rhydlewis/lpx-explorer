//! One-shot diagnostic: parse a `.logicx` ProjectData file and dump
//! tracks + registry. Useful for triaging projects where the
//! inspector shows wrong / missing names.
//!
//! Usage:  cargo run -p lpx-parser --example inspect -- <path>

use std::env;
use std::fs;

fn main() {
    let path = env::args().nth(1).expect("usage: inspect <ProjectData path>");
    let bytes = fs::read(&path).expect("read");
    println!("== {path} ({} bytes) ==", bytes.len());

    let aurefs = lpx_parser::find_aus(&bytes);
    let mut tracks = lpx_parser::find_tracks(&bytes);
    let registry = lpx_parser::find_track_registry_records(&bytes);
    let regions = lpx_parser::find_region_records(&bytes);
    let clusters = lpx_parser::cluster_regions(&regions);
    lpx_parser::assign_aus(&mut tracks, &aurefs);
    lpx_parser::assign_user_names(&mut tracks, &clusters);
    lpx_parser::assign_registry_names(&mut tracks, &registry);

    println!(
        "\n== Tracks ({} total) ==",
        tracks.len()
    );
    let mut by_kind: std::collections::BTreeMap<String, usize> =
        std::collections::BTreeMap::new();
    for t in &tracks {
        if !t.is_active {
            continue;
        }
        *by_kind
            .entry(format!("{:?}", t.kind))
            .or_insert(0) += 1;
    }
    println!("  active by kind: {:?}", by_kind);

    println!("\n  user-visible (audio + instrument + folder + summing-stack):");
    for (i, t) in tracks.iter().enumerate() {
        if !t.is_active {
            continue;
        }
        let visible = matches!(
            format!("{:?}", t.kind).as_str(),
            "Audio" | "Instrument" | "Folder" | "SummingStack",
        );
        if !visible {
            continue;
        }
        println!(
            "    [{i}] {:<20} kind={:?} parent={:?} user_name={:?}",
            t.name, t.kind, t.parent_offset, t.user_name,
        );
    }

    println!(
        "\n== Registry entries ({} total) ==",
        registry.len()
    );
    for r in &registry {
        println!(
            "  kind={:<13?} strip_id={:<3} track_id={:<5} name={:?}",
            r.kind, r.strip_id, r.track_id, r.name,
        );
    }

    println!("\n== Region clusters ({}) ==", clusters.len());
    for c in clusters.iter().take(20) {
        println!(
            "  first_offset=0x{:x} base={:?} count={}",
            c.first_offset, c.base_name, c.count,
        );
    }

    // Scan for the EXACT registry-record structure but ignoring the
    // 2-byte signature whitelist. Dumps every signature seen with the
    // name — used to find the unknown signatures audio tracks use in
    // projects whose Tracks Area entries are invisible to the parser.
    const PREAMBLE_LEN: usize = 16;
    const NAME_MAX: usize = 200;
    println!("\n== Structural scan (ALL signatures, including unknown) ==");
    let mut sig_counts: std::collections::BTreeMap<[u8; 2], usize> =
        std::collections::BTreeMap::new();
    let mut i = 0usize;
    while i + PREAMBLE_LEN <= bytes.len() {
        // Same structural shape as find_track_registry_records, but no
        // signature filter.
        if bytes[i] | bytes[i + 1] | bytes[i + 2] | bytes[i + 3] != 0 {
            i += 1;
            continue;
        }
        let sig = [bytes[i + 4], bytes[i + 5]];
        if bytes[i + 6] | bytes[i + 7] | bytes[i + 8] | bytes[i + 9] != 0 {
            i += 1;
            continue;
        }
        if bytes[i + 12] | bytes[i + 13] != 0 {
            i += 1;
            continue;
        }
        let length = bytes[i + 14] as usize;
        if bytes[i + 15] != 0 || length == 0 || length > NAME_MAX {
            i += 1;
            continue;
        }
        let name_off = i + PREAMBLE_LEN;
        if name_off + length > bytes.len() {
            i += 1;
            continue;
        }
        let name_bytes = &bytes[name_off..name_off + length];
        if !name_bytes.iter().all(|&b| (0x20..0x7f).contains(&b)) {
            i += 1;
            continue;
        }
        let Ok(name) = std::str::from_utf8(name_bytes) else {
            i += 1;
            continue;
        };
        // Skip obvious noise.
        let noise = matches!(
            name,
            "@ (=Context Name)" | "(Folder)" | "Not Assigned"
              | "Transform Parameter Set" | "Unused" | "Click" | "MIDI Click"
              | "Master" | "Stereo Out" | "Preview" | "VCA 1",
        );
        if noise {
            i = name_off + length;
            continue;
        }
        *sig_counts.entry(sig).or_insert(0) += 1;
        let known = matches!(
            sig,
            [0x22, 0x12] | [0xa8, 0x11] | [0xda, 0x11] | [0xe7, 0x10]
            | [0x23, 0x12] | [0xdc, 0x11] | [0xdf, 0x11]
            | [0x74, 0x10] | [0xcb, 0x10] | [0xe3, 0x11]
            | [0xe4, 0x10] | [0xeb, 0x11] | [0xe7, 0x11],
        );
        let known_str = if known { "✓" } else { "?" };
        println!(
            "  off=0x{:06x} sig=0x{:02x}{:02x} {} name={name:?}",
            i, sig[0], sig[1], known_str,
        );
        i = name_off + length;
    }

    println!("\n== Signature frequency ==");
    for (sig, count) in &sig_counts {
        let known = matches!(
            *sig,
            [0x22, 0x12] | [0xa8, 0x11] | [0xda, 0x11] | [0xe7, 0x10]
            | [0x23, 0x12] | [0xdc, 0x11] | [0xdf, 0x11]
            | [0x74, 0x10] | [0xcb, 0x10] | [0xe3, 0x11]
            | [0xe4, 0x10] | [0xeb, 0x11] | [0xe7, 0x11],
        );
        println!(
            "  sig=0x{:02x}{:02x} count={count:<4} known={}",
            sig[0], sig[1], if known { "yes" } else { "NO" },
        );
    }
}
