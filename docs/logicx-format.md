# Logic Pro `.logicx` bundle — format reference

> Reverse-engineered notes for engineers writing their own parser.
> British English. Audience: competent systems engineer.

## How this was derived

Everything below is **empirically reverse-engineered** against real Logic Pro
projects. The `.logicx` format is undocumented; nothing here came from Apple.
Two sources back this document up:

1. **`lpx-explorer`'s Rust parser** under
   `src-tauri/crates/lpx-parser/src/` (the codebase this document lives in).
   File:line citations below refer to paths inside that crate unless stated.
2. **`lpx-toolkit`'s Python implementation** (`lpx_inspect.py`) — the
   original source of truth from which the Rust port was derived. Its
   `CLAUDE.md` carries the per-finding history. When the two diverge, the
   Rust source is authoritative for offsets/signatures the Rust port has
   actually exercised; the Python `CLAUDE.md` retains older notes (some
   of which are flagged as superseded).

Every claim either cites code or a fixture. Anything that could not be
verified is in §4 *Known unknowns*.

---

## 1. Overview

A `.logicx` "file" is a **macOS bundle** — a directory the Finder treats as
a single document. Logic Pro stores everything for one project there:
the binary scene description (`ProjectData`), per-alternative metadata
plists, optional Media subfolder, undo state, and a JPEG screenshot of the
last-saved window.

The interesting bytes live in two places:

* `<bundle>/Alternatives/<NNN>/ProjectData` — **undocumented binary
  blob**. Multi-MB. Contains AU plug-in descriptors, channel-strip records,
  region records, the track registry, NSKeyedArchive Cocoa blobs, and a
  lot of binary noise. The parser scans this file in linear time using
  byte-anchor heuristics; it never seeks based on a header table because
  no such table has been identified.
* `<bundle>/Alternatives/<NNN>/MetaData.plist` and
  `<bundle>/Resources/ProjectInformation.plist` — **standard Apple
  property lists** (binary or XML — `plist::from_bytes` handles both).
  These give project-level metadata and the variants/alternatives manifest.

There is **no central index** inside `ProjectData`. Track lists, FX chains
and plug-in identity are all reconstructed from independently-anchored
records discovered by scanning the entire blob. Spurious matches inside
NSKeyedArchive blobs and binary noise are filtered by structural guards
(printable-ASCII checks, length caps, neighbouring-byte invariants).

Hard rules the parser must observe:

* **Read-only.** Opening a `.logicx` for write risks unrecoverable user
  data loss. The contract is gated by an integration test
  (`tests/readonly_invariant.rs`) and by the bytes-only API (parser
  functions take `&[u8]`, never paths).
* **Linear scan.** No assumed file structure beyond per-record anchors.

---

## 2. Bundle structure

Verified against representative `.logicx` bundles produced by Logic Pro 11:

```
<name>.logicx/
├── Alternatives/
│   ├── 000/                          ← variant 0 (default)
│   │   ├── ProjectData                  binary scene file (PARSED — §3.1)
│   │   ├── MetaData.plist               project metadata plist (PARSED — §3.2)
│   │   ├── DisplayState.plist           UI state (NOT parsed)
│   │   ├── DisplayStateArchive          binary UI state (NOT parsed)
│   │   ├── WindowImage.jpg              last-window screenshot (NOT parsed)
│   │   ├── Undo Data.nosync             undo history (NOT parsed; iCloud opt-out by suffix)
│   │   └── Project File Backups/        prior-save copies (NOT parsed)
│   └── 001/, 002/, …                 ← additional alternatives (same shape)
├── Resources/
│   └── ProjectInformation.plist      alternatives manifest (PARSED — §3.3)
└── Media/
    └── Audio Files/                  WAV/AIFF user audio (NOT parsed)
```

* Alternative directories are **zero-padded three-digit indices**
  (`000`, `001`, …). The Tauri command at
  `../../src-tauri/src/commands.rs:298-300` constructs paths via
  `format!("{variant_index:03}")`.
* A bundle with no `ProjectInformation.plist` is treated as
  single-variant (synthetic `Alternative { 0, <bundle name>, true }`) —
  see `../../src-tauri/src/commands.rs:222-232`.
* Bundle filesystem stats (size, ctime, mtime) are recursive sums and
  must be computed at the directory level — macOS does not maintain
  these for packages. See `../../src-tauri/src/bundle.rs:26-45`.

---

## 3. File-by-file reference

### 3.1 `ProjectData` (binary)

The scene description. Everything in this file is reverse-engineered.
Five distinct record types are recovered, each by an independent scan.

#### 3.1.1 AU component descriptors — three-4CC triple

Anchor: the AU **type** 4CC, stored little-endian, scanned for as one
of `umua`, `xfua`, `fmua`, `imua` (reversed `aumu`, `aufx`, `aumf`,
`aumi`). Defined at `src/lib.rs:70-75`.

Layout (offsets relative to the type-code anchor `T`):

```
  T-4 ─┬─────┐  T ─┬─────┐  T+4 ─┬─────┐
       │ MFR │     │ TYP │      │ SUB │
       └─────┘     └─────┘      └─────┘
       4 bytes     4 bytes      4 bytes
       LE 4CC      LE 4CC       LE 4CC
```

* All three 4CCs **must be printable ASCII (0x20–0x7e)** or the candidate
  is discarded — guards against the AU-type bytes appearing by chance in
  binary noise (`src/lib.rs:147-149`).
* The three codes are reversed before display so they match `auval -l`
  output (`src/lib.rs:77-82`).
* Fingerprint format: `"{type}/{subtype}/{manufacturer}"`. Trailing/leading
  spaces in any 4CC are **significant** — Kilohearts manufacturer is `"kHs "`,
  Soundtoys EchoBoy subtype is `"EB  "`. See
  `src/auval.rs:33-37`.

Type semantics (`src/lib.rs:70-75`, `src/tracks.rs:273-281`):

| 4CC (display) | Stored as | Meaning |
|---|---|---|
| `aumu` | `umua` | Instrument (`kAudioUnitType_MusicDevice`) |
| `aufx` | `xfua` | Audio effect |
| `aumf` | `fmua` | MIDI effect (`kAudioUnitType_MusicEffect`) |
| `aumi` | `imua` | MIDI processor (`kAudioUnitType_MIDIProcessor`) |

`aumf` and `aumi` both render as MIDI FX in Logic's UI; the parser's
`assign_aus` lumps them into `midi_fx` (`src/tracks.rs:279`).

#### 3.1.2 Apple stock plug-in slots — `GAME` anchor

Apple-bundled plug-ins (Compressor, Limiter, ChromaVerb, Alchemy, etc.)
are **not** stored as 4CC triples. They live in slot records anchored on
the literal ASCII `GAME` 4CC marker. Defined in `src/apple_stock.rs`.

Layout (offsets relative to the `G` of `GAME`):

```
  -14   -13    -12         …            0    +4
   │     │     ╔══════════════════════╗  │     │
   │     │     ║  12-byte ASCII name  ║  │     │
   │     │     ║  null-padded         ║  │     │
   │ flag1 │ flag2 ╚══════════════════════╝  GAME ╔═══╗
   └──┬──┘ └──┬──┘                              ║...║
      │       │                                 ╚═══╝
      │       └──── flag2: 0x02 (FX/instrument) or 0x01 (Klopfgeist).
      │             Other values reject the candidate.
      │             (src/apple_stock.rs:49-50, 106)
      │
      └──── flag1: 0x02 = FX insert (→ aufx)
                   0x00 = instrument slot (→ aumu)
                   anything else: reject (src/apple_stock.rs:110-117)
```

* The 12-byte name field is **NUL-padded**; non-NUL trailing bytes reject
  the candidate (`src/apple_stock.rs:137-140`).
* The 4CC fingerprint `(type, subtype, manufacturer)` is **not recoverable**
  from this storage shape. The parser:
  * Looks up the recovered display name in a static table
    (`STOCK_FINGERPRINTS` at `src/apple_stock.rs:78-79`) — currently only
    `Compressor → aufx/Comp/appl` is verified.
  * Falls back to a synthesised triple: `(<flag1-derived type>,
    synth_subtype(name), "appl")` where `synth_subtype` lowercases and
    strips non-alphanumerics, padding to 4 chars (`src/apple_stock.rs:165-175`).
  * Fills `AURef::display_name` with the recovered name unconditionally
    (`src/apple_stock.rs:148-154`).
* Verified empirically against a representative project: 7 stock slots
  recovered, zero false positives across all 35 `GAME` byte sequences in
  that file once the flag-byte and printable-name guards are applied
  (`src/apple_stock.rs:25-29`).

Klopfgeist (Logic's metronome) uses `flag2 = 0x01` — distinct from the
regular FX `0x02` (`src/apple_stock.rs:46-48`).

#### 3.1.3 Apple Drummer / Bass Player — JSON state

A third storage shape for Logic's Drummer and Bass Player plug-ins.
Identity is encoded in **embedded JSON state strings** keyed by region
UUIDs:

```json
"selectedCharacterIdentifier":"Electric Bass - Pop Songwriter",
"selectedPersistentCharacterTypeIdentifier":"Type_ElectricBassV2"
```

Anchor: the literal byte sequence
`"selectedPersistentCharacterTypeIdentifier":"` (`src/apple_drummer.rs:35`).
Value is read until the next `"` within 96 bytes
(`MAX_TYPE_VALUE_LEN`, `src/apple_drummer.rs:37, 56-66`); the value
must start with `Type_`.

A single Drummer slot emits **many** snapshots (per-region, per-character
experiment, per-save). Naïve counting overcounts. The parser clusters
hits by byte-offset proximity:

* **`CLUSTER_THRESHOLD = 32 768` bytes** (`src/apple_drummer.rs:43`).
  Two hits more than 32 KB apart begin a new cluster.
* The **latest** `Type_X` in a cluster is used as the active character
  (`src/apple_drummer.rs:84-91`).
* Cluster offset reported is the **first** hit's offset, so
  `assign_aus`' nearest-preceding-track join attaches the AU to the right
  channel strip (`src/apple_drummer.rs:80-82`).

Known character → display-name mapping
(`src/apple_drummer.rs:110-116`):

| Type identifier | Display name |
|---|---|
| `Type_AcousticDrummerV2` | `Drummer` |
| `Type_ElectricBassV2` | `Bass Player` |
| anything else | `Type_` prefix stripped, identifier kept verbatim |

The synthesised `(type, subtype, manufacturer)` triple is
`("aumu", synth_subtype(display_name), "appl")` —
`src/apple_drummer.rs:96-105`.

#### 3.1.4 Channel-strip / track records

Anchor: a 16-byte **name field** that opens with `0x20` (a literal space
that is part of the format), preceded by a NUL byte. The name field is
followed by an 8-byte descriptor.

Defined in `src/tracks.rs:353-415`. Layout:

```
  N-1   N ───────── name field (16 bytes) ──────── N+16 ── descriptor (8 bytes) ──
   │    │                                              │
  0x00  0x20 ascii-name … NUL-padded to 16 bytes      [head][b1][b2][b3][b4][b5..7]
                                                       └───── 4-byte type code ────┘
```

* Index `N` must satisfy `raw[N-1] == 0x00` and `raw[N] == 0x20`
  (`src/tracks.rs:360-367`). The leading-NUL guard avoids matching mid-record.
* The ASCII name is `[0x21..=0x7e]` then `[0x20..=0x7e]{0,14}`, terminated
  by NUL or end-of-field. Bytes after the name **must all be NUL**
  (`src/tracks.rs:322-351`). Whitespace-only names are skipped.
* `descriptor[3] & 0xC0 == 0xC0` is mandatory — guards against random `0x20`
  bytes (`src/tracks.rs:382-385`).

Descriptor → track kind (`src/tracks.rs:287-311`):

| `head` (descriptor[0]) | Other bytes | Kind |
|---|---|---|
| `0x89` | — | Master |
| `0x49` | — | Output |
| `0xE9` | — | Bus |
| `0xAB` | `b1 == 0xF5` | Aux |
| `0xAB` | otherwise | Audio |
| `0x29` | `b2 == 0xF3` or `b2 == 0xF7` | Instrument |
| `0x29` | otherwise | Input |
| any other | — | Unknown |

Active flag (`src/tracks.rs:315-317`):

```
is_active  =  (descriptor[2] & 0x04) != 0
            ∨  descriptor[4] != 0
```

Two independent signals — bit `0x04` of byte 2 means a plug-in is loaded;
non-zero byte 4 means the strip has sends/routing/etc. customisation.

Byte 4's exact semantics are **not catalogued**; only "non-zero" is read.
Bytes 5–7 are not read at all — see §4.

#### 3.1.5 Region records — `0x61 0xff` anchor

User-given track names (e.g. `Acoustic GTR`) live in **audio region records**
in the binary section, not in the channel-strip records. Defined at
`src/regions.rs:40-76`.

Anchor: `0x61 0xff` followed by **24 NUL bytes** (`src/regions.rs:19-22`),
then a length-prefixed ASCII name:

```
   ┌──────┬──────┬───────────────────────────┬──────┬──────────────┐
   │ 0x61 │ 0xff │ 24 × 0x00                 │ LEN  │ name (LEN)   │
   └──────┴──────┴───────────────────────────┴──────┴──────────────┘
                                                u16 LE   ascii
```

* `LEN` must be in `1..=200` — the cap rejects 16-bit garbage
  (`src/regions.rs:16, 50-52`; `REGION_NAME_MAX_LEN`).
* Name bytes must all be `[0x20..0x7f)` printable ASCII
  (`src/regions.rs:60-62`).
* The 4 bytes preceding the marker are an opaque "id" field — read by the
  Python implementation as part of the region header but **ignored by the
  Rust scanner** (the test fixture at `src/regions.rs:342-352` plants
  arbitrary printable bytes there).

Regions are then **clustered** by `cluster_regions` (`src/regions.rs:314-336`):
take/comp/numeric suffixes (`: Take 14`, `: Comp A.1`, `_001`, `#06`,
trailing `.N`) are stripped iteratively (`src/regions.rs:81-90`); a run of
consecutive records sharing one base name is one user-perceived track.
Bare comp tags (`Comp A`) and recording filenames
(`<project>_<digits>[ #N]`) don't open clusters — they would otherwise
fragment a single track's run (`src/regions.rs:189-200, 252-307`).

User-rename precedence is enforced at the cluster level: clusters whose
base name matches Logic's auto-generated channel-strip pattern
(`Audio N`, `Inst N`, `Bus N`, `Aux N`, `Input N`, `Output N` /
`Output N-N`, or bare `Master`) are skipped so that an explicit user
rename later in the file wins
(`src/regions.rs:208-250`; skip call in `assign_user_names` at
`src/tracks.rs:71-73`).

#### 3.1.6 Track-registry records

The track registry sits in the binary section of `ProjectData`, **distinct
from the channel-strip records of §3.1.4**. It carries one entry per
user-visible track in the Tracks Area — including header summing-stacks
and folder containers (whose channel-strip children are returned by
`find_tracks` but who do not themselves appear there). Defined at
`src/tracks_registry.rs:105-218`.

Layout:

```
   ┌──────────────┬─────┬──────────────┬─────────┬──────────┬───────────┬────────────┐
   │ 4 × 0x00     │ SIG │ header (4)   │ CTRL×2  │ 2 × 0x00 │ LEN_LO/HI │ name (LEN) │
   └──────────────┴─────┴──────────────┴─────────┴──────────┴───────────┴────────────┘
        i+0..3    i+4..5    i+6..9      i+10..11  i+12..13    i+14..15      i+16..
                              │                                  │
                              │                                  ├─ LEN_LO at i+14 (1..=200)
                              │                                  └─ LEN_HI at i+15 (must be 0x00)
                              │
                              └─ Three accepted patterns (see below)
```

* `SIG` is a 2-byte signature looked up in the whitelist
  (`src/tracks_registry.rs:33-66`). Different track kinds use different
  signatures:

| Signature | Kind | Notes |
|---|---|---|
| `22 12` | Instrument | MIDI / software-instrument tracks (most common) |
| `a8 11` | Instrument | single-instrument variant |
| `da 11` | Instrument | Apple stock-instrument variant |
| `e7 10` | Instrument | sampler / Alchemy variant |
| `03 10` | Instrument | stand-alone-instrument variant; uses `ff ff 00 00` header (see §3.1.6 *Accepted header patterns*) |
| `4d 10` | Instrument | Bass-style variant; uses `XX 00 00 00` header with byte 6 = `0x6c` |
| `5f 11` | Instrument | Drums-style variant; uses `XX 00 00 00` header with byte 6 = `0x68` |
| `23 12` | Audio | audio tracks (most common) |
| `dc 11` | Audio | audio tracks (variant) |
| `df 11` | Audio | audio tracks (variant) |
| `47 11` | Audio | audio tracks (variant) |
| `c7 10` | Audio | audio tracks (variant) |
| `4c 10` | Audio | audio tracks (variant) |
| `9a 11` | Audio | audio tracks (variant) — also collides with arrangement-marker / song-title records, see *Audio strip-id* below |
| `7a 11` | Audio | audio tracks (variant) |
| `74 10` | Folder | sub-folder variant |
| `cb 10` | Folder | sub-folder variant |
| `e3 11` | Folder | sub-folder variant |
| `e4 10` | Folder | sub-folder variant |
| `eb 11` | Folder | sub-folder variant |
| `e7 11` | Folder | sub-folder variant |
| `0d 10` | Folder | sub-folder variant (Backline) |
| `8d 11` | Folder | sub-folder variant (Keys & Synths) |

The eight folder signatures were observed across different folder records;
**what the signature variation actually encodes is unknown** (see §4.2).
Earlier notes in `lpx-toolkit/CLAUDE.md` annotate each signature with a
category guess (percussion / dialogue / keys / etc.), but those categories
were inferred from the user-given folder names in the projects where each
signature first appeared and are not Logic Pro defaults. The signature
may correspond to folder colour, icon, creation order, child-track kind,
or something else — none of these has been verified.

Note the **close collision** between `e7 10` (Instrument) and `e7 11`
(Folder) — only the high byte distinguishes them
(`src/tracks_registry.rs:37, 63`).

##### Accepted header patterns (bytes `i+6..9`)

The 4 bytes at `i+6..9` admit **three distinct patterns**
(`src/tracks_registry.rs:127-143`). The signature whitelist above is the
safety filter for the permissive patterns — unrecognised signatures still
drop.

| Pattern | Used by | Meaning |
|---|---|---|
| `00 00 00 00` | most signatures | Standard track-registry record |
| `ff ff 00 00` | `03 10` | Stand-alone-instrument variant (Piano in `for-my-lover.logicx`) |
| `XX 00 00 00` | `4d 10`, `5f 11` | Byte 6 carries a category flag; bytes 7-9 must be zero. Observed: `0x6c` (Bass), `0x68` (Drums) |

Bytes 7-9 must always be zero — only byte 6 is permissive in pattern 3.

* `LEN_LO` is the name length in `1..=200`; `LEN_HI` must be `0x00`
  (`src/tracks_registry.rs:21, 149-153`). Names are printable ASCII.
* `CTRL×2` (the 2 control bytes at `i+10..11`) are **skipped over,
  never read**; the parser only checks that the 2 bytes following
  (`i+12..13`) are zero. The lpx-toolkit `CLAUDE.md` notes the
  control bytes encode "a track index/ID-like value, not visibility"
  — see §4.
* A whitelist of system-internal placeholder names is filtered
  (`src/tracks_registry.rs:74-86`). `"Untitled"` is **deliberately not**
  in the noise list — it is a real user-facing name in Logic's UI and
  the count must match channel-strip records for ordinal pairing
  (`src/tracks_registry.rs:68-73`, test at lines 483-497).

##### Summing-stack discriminator

A folder-signature record is upgraded to `SummingStack` when its trailer
matches `XX 01 00 NN 00 01` (`src/tracks_registry.rs:228-237`):

```
  trailer:   XX  01  00  NN  00  01   …
             └─ varies, ≈ 0x54 + sub_number
                         └─ Sub number (at trailer[3])
```

Some records emit a trailing NUL after the name, so the pattern is
accepted at offset 0 *or* offset 1. Aux Stacks and folder children carry
`XX 00 00 ff 00 01` — second byte `0x00`, not `0x01` — and stay as
`Folder` (test at `src/tracks_registry.rs:529-539`).

##### Audio strip-id

For audio-kind records the **channel-strip number** is decoded from the
trailer as the first non-zero `u16` LE (`src/tracks_registry.rs:245-259`):

```
  post_name:  ┌───┬───┬───┐
              │ b0│ b1│ b2│ …
              └───┴───┴───┘
              try u16(b0,b1); if 0 try u16(b1,b2)  — alignment is
              even-name-length vs odd-name-length, records are 2-byte
              aligned.
              Result must be in (0, 512) or strip_id stays 0.
```

The 512-cap rejects bogus IDs from records that share the audio shape
but encode something else (e.g. arrangement-marker / song-title records
under signature `9a 11`, whose trailers can decode to strip IDs in the
hundreds — see `src/tracks_registry.rs:26-32`). The same project-aware
filter runs at name-pairing time:
`pair_audio_by_strip_id` drops any registry entry whose `strip_id`
exceeds the project's max audio strip number
(`src/tracks.rs:173-218`).

##### Per-track ID

A 64-byte "track-link" structure precedes each registry record. Bytes
2–3 hold a `u16 LE` per-track ID. The Rust port reads this at
**offset −62** from the record start (`src/tracks_registry.rs:185-189`):

```rust
let track_id: u16 = if i >= 62 {
    u16::from_le_bytes([raw[i - 62], raw[i - 61]])
} else {
    0
};
```

The preamble is 64 bytes long: the `u16 LE` track-id at structure
offset +2 lands at file offset −64+2 = −62. (The `TrackRegistryEntry`
doc-comment at `src/tracks_registry.rs:93-95` still calls this a
"32-byte" structure — that's stale wording; the arithmetic is only
consistent with 64 bytes. Flagged in §4.)

##### Per-track focus byte

Byte 0 of the 64-byte preamble (file offset `−64` from the record) is a
focus flag — `0x01` for the Logic-selected track, `0x00` for all
others. **This field is documented in lpx-toolkit's `CLAUDE.md` (line 40)
but is not read by the Rust parser.** See §4.

#### 3.1.7 NSKeyedArchive `bplist00` blobs

`ProjectData` is **interspersed** with serialised Cocoa objects beginning
`bplist00`. They contain Smart Controls layouts, plug-in parameter
mappings, channel UUIDs (`_WsChannelUUID`), automation curve points
(`MAGraphPoint`).

* The parser **does not decode** these blobs. It treats them as binary
  noise and relies on its anchor-and-validate scans not matching inside
  them.
* They contain no user-facing track names and no AU descriptors —
  verified empirically by inspecting the decoded archive contents. The
  `WsPluginIdentity` class inside refers to Smart Controls UI elements
  (Smart Knob, Smart Button), not audio plug-in identity.

(Source: lpx-toolkit `CLAUDE.md` lines 19, 34. No code in this repo
touches these blobs.)

---

### 3.2 `Alternatives/<NNN>/MetaData.plist`

Standard Apple plist (XML or binary — both are decoded by `plist::from_bytes`).
Parser at `src/metadata.rs:41-60`.

Recognised keys:

| Key | Type | Default | Notes |
|---|---|---|---|
| `SongKey` | string | `"?"` | e.g. `"C"`, `"F#"` |
| `SongGenderKey` | string | `"?"` | e.g. `"Major"` |
| `BeatsPerMinute` | real (or int) | `0.0` | int form is coerced to f64 (`src/metadata.rs:66-69`) |
| `SongSignatureNumerator` | uint | `4` | |
| `SongSignatureDenominator` | uint | `4` | |
| `NumberOfTracks` | uint | `0` | |
| `SampleRate` | uint | `0` | Hz |
| `AudioFiles` | array | `[]` | parser only counts the array length |
| `ImpulsResponsesFiles` | array | `[]` | misspelled in the file format |
| `FrameRateIndex` | uint | `0` | enum index — semantics not catalogued in this repo |

Defaults match the Python `parse_project` so that missing keys are
non-fatal (`src/metadata.rs:35-40`).

Notably `AudioFiles` is **counted, not validated** — entries may be
absent on disk; the parser does not check (`src/metadata.rs:79-84` and
test at line 154-166).

`MetaData.plist` does **not** contain plug-in or per-track information.

---

### 3.3 `Resources/ProjectInformation.plist`

Standard Apple plist. Parser at `src/alternatives.rs:53-90`.

Recognised keys:

| Key | Type | Default | Notes |
|---|---|---|---|
| `ActiveVariant` | int | `0` | absent on single-variant projects |
| `VariantNames` | dict | — | keys are zero-padded numeric strings (`"0"`, `"1"`, …); values are display names |
| `VariantNamesV2` | dict | — | newer Logic versions; values may contain `{PROJECT_NAME}` placeholder |

Resolution:

* `VariantNamesV2` wins when present and non-empty
  (`src/alternatives.rs:75-79`).
* `{PROJECT_NAME}` is substituted with the bundle's basename
  minus `.logicx` (`src/alternatives.rs:42, 92-104`;
  `../../src-tauri/src/commands.rs:189-195`).
* Numeric keys are sorted numerically, not lexically — binary-plist dicts
  don't preserve order (`src/alternatives.rs:80, 219-237`).
* The variant whose index equals `ActiveVariant` gets `is_active = true`
  (`src/alternatives.rs:86-87`).

Verified against representative single-variant and multi-variant
projects (`src/alternatives.rs:5-15`).

---

### 3.4 Other bundle files (NOT parsed)

These exist on disk but the parser ignores them. Cited because a future
parser may want them:

* `Alternatives/<NNN>/DisplayState.plist` — Logic UI state. Mentioned as
  out-of-scope in lpx-toolkit `CLAUDE.md` line 20.
* `Alternatives/<NNN>/DisplayStateArchive` — binary UI state archive.
  No notes anywhere in this repo.
* `Alternatives/<NNN>/WindowImage.jpg` — last-saved window screenshot.
* `Alternatives/<NNN>/Undo Data.nosync` — undo history. The
  `.nosync` suffix is iCloud's opt-out marker.
* `Alternatives/<NNN>/Project File Backups/` — prior-save copies of
  `ProjectData`.
* `Media/Audio Files/` — user-supplied WAV/AIFF source media.

---

### 3.5 The `auval -l` lookup table

Not a `.logicx` file but adjacent to the format: every recovered
3rd-party AU descriptor is identified by 4CC fingerprint, and the
human-readable plug-in name lives in the system's AU registry, exposed by
`/usr/bin/auval -l`. Parser at `src/auval.rs:40-66`.

Output is **column-aligned, fixed-offset** — *not* whitespace-separated.
Splitting on whitespace eats significant trailing spaces inside
manufacturer or subtype 4CCs and silently breaks fingerprint matching:

```
aufx Cmpr appl  -  AUDynamicsProcessor (file:/System/Library/...)
0    5    10   ↑
                column separator " - "
```

* Type at `[0..4]`, subtype at `[5..9]`, manufacturer at `[10..14]`
  (`src/auval.rs:49-51`).
* Trailing/leading spaces in any 4CC are preserved verbatim
  (tests at `src/auval.rs:96-116`).
* Column separator is the literal `" - "` (space-hyphen-space) —
  hyphens inside plug-in names are not confused with it (test at
  `src/auval.rs:128-137`).
* Trailing `(file:...)` suffix is stripped from the name
  (`src/auval.rs:53-55`).

Apple-stock plug-ins recovered via the §3.1.2 GAME-anchor strategy carry
`AURef::display_name = Some(...)` and bypass this lookup at the
application layer.

---

## 4. Known unknowns

Each item is grounded in code with a `file:line` citation. **Category
(C)**:

* **(c)** — explicitly flagged as unknown in the code or docs.
* **(d)** — discovered or surfaced during this re-examination of the
  parser; not previously called out.

### 4.1 `ProjectData` — track records (channel-strip)

* **(c) Descriptor bytes 5–7 are unread.** The 8-byte descriptor is
  inspected only at indices 0–4. Bytes 5–7 may carry routing /
  visibility / colour information; nobody has investigated. Cite
  `src/tracks.rs:287-317`.
* **(c) Descriptor[4] activity signal — value semantics unknown.**
  Treated as a boolean ("non-zero ⇒ active"). The lpx-toolkit comment at
  `lpx_inspect.py:90-94` says it flips on for "sends, routing, etc.
  customisation" but does not enumerate. Cite
  `src/tracks.rs:315-317`.
* **(d) `0x29` head byte: `b2 ∈ {0xF3, 0xF7}` ⇒ Instrument, else Input.**
  Both values are accepted with no documentation of what differentiates
  them. Cite `src/tracks.rs:302-308`.
* **(c) Hidden-track flag location is unknown.** lpx-toolkit's
  `CLAUDE.md:141-143` is explicit: "The hidden flag is somewhere else …
  Open until ground-truth-driven analysis identifies the right field."
  Not read by either parser.
* **(c) UI track-row order is unidentified.** lpx-toolkit's
  `CLAUDE.md:42-92` documents an extensive failed investigation
  (`0x04 0x02 0x07 0x01` blocks turned out to be screensets;
  `0x19` records are a free-list, not ordering). The parser ships
  cluster-based `track_id` ordering as the working approximation.

### 4.2 `ProjectData` — track-registry records

* **(d) `bytes 6..9` header semantics are partially understood.** Three
  patterns are accepted (§3.1.6 *Accepted header patterns*):
  `00 00 00 00`, `ff ff 00 00`, and `XX 00 00 00` where byte 6 is a
  category flag observed as `0x6c` (Bass) or `0x68` (Drums) under
  signatures `4d 10` and `5f 11` respectively. **What byte 6 actually
  encodes is not catalogued** — only those two values have been
  observed; the parser currently admits any non-zero byte 6 as long as
  bytes 7-9 are zero. Cite `src/tracks_registry.rs:127-143`.
* **(c) Control bytes at `i+10..11` are opaque — and never read.**
  The parser steps over them entirely; it only validates that the
  following 2 bytes at `i+12..13` are zero. lpx-toolkit's `CLAUDE.md:141`
  notes the control bytes encode "a track index/ID-like value, not
  visibility". Cite `src/tracks_registry.rs:144-148`.
* **(c) Per-track focus byte (preamble[0]) is not extracted.** Documented
  in lpx-toolkit `CLAUDE.md:40` as the Logic-selected-track flag, but
  the Rust parser only reads bytes 2–3 of the preamble. Cite
  `src/tracks_registry.rs:185-189` (offset −62 is read; offset −64
  is not).
* **(d) Preamble length: source doc-comment says "32-byte" but code
  reads at −62.** Doc-comment at `src/tracks_registry.rs:93-95` calls
  the structure "32-byte"; lpx-toolkit `CLAUDE.md:38` calls it
  "64-byte". The arithmetic (`−62` for `track_id` at structure-offset 2)
  is consistent only with the 64-byte version. The 32-byte phrasing
  in the Rust source is **doc drift**.
* **(c) `strip_id` decoding heuristic.** The "first non-zero u16 LE
  in `(0, 512)`" rule (`src/tracks_registry.rs:245-259`) is empirical:
  the 512 cap is a magic constant chosen because Logic projects do not
  exceed ~256 audio strips in practice, but the precise upper bound is
  not derivable from the format. Records under signature `9a 11`
  whose trailers decode to strip IDs in the hundreds (arrangement
  markers / song-title records that share the same outer shape) are
  rejected only because the pairing layer applies a project-max-strips
  secondary filter — the registry-record decoder itself would happily
  emit them. Cite `src/tracks.rs:173-218`.
* **(d) Trailer `XX` byte in summing-stack discriminator is read but
  not used.** The "≈ `0x54 + sub_number`" mapping (lpx-toolkit
  `CLAUDE.md:137`) is documented but not parsed; only the
  positional NUL-pattern `_1_0_NN_0_1` is checked. Sub number `NN` at
  trailer[3] is also read but not surfaced. Cite
  `src/tracks_registry.rs:228-237`.
* **(d) Folder-signature semantics are unidentified.** Eight
  signatures all map to `Folder` (§3.1.6 table). What the signature
  variation encodes is unknown. The category guesses in
  `lpx-toolkit/CLAUDE.md:122-129` (percussion, dialogue, keys, …) are
  not Logic-defined categories — they are inferences drawn from the
  user-given folder names in the projects where each signature was
  first observed, and may have nothing to do with the signature's
  actual meaning. Plausible candidates not yet ruled in or out:
  folder colour, folder icon, child-track kind, creation order, or
  Folder Stack vs Aux Stack vs Track Stack distinction. lpx-toolkit
  `CLAUDE.md:139` flags the broader Folder/Aux Stack/Track Stack
  question as a follow-up. Cite `src/tracks_registry.rs:58-65`.
* **(c) Bus signatures are deliberately not in the whitelist.**
  `24 12`, `30 11`, `38 11`, `f5 11` "share the outer structure but
  are filtered out — buses live on the channel-strip side".
  lpx-toolkit `CLAUDE.md:131`. Not currently treated as a missing
  feature, but a parser that wants buses-by-name would need them.

### 4.3 `ProjectData` — region records

* **(c) Region → strip mapping inside `gRuA` is unsolved.** lpx-toolkit's
  `CLAUDE.md:94-105` documents an exhaustive failed investigation:
  region offsets vs OCuA byte ranges (zero overlap), `gRuA+50`,
  the 4 bytes preceding `0x61 0xff`, etc. Strip number lives in the
  registry record (§3.1.6), not the region record. The fallback is
  ordinal/strip-id pairing in `assign_user_names` /
  `assign_registry_names`.
* **(d) The 4 bytes immediately preceding the `0x61 0xff` marker are
  not read.** They look like an opaque "id" field. The Rust scanner
  starts its window at the marker and never inspects them — see the
  test fixture which plants `b"ID01"` arbitrarily
  (`src/regions.rs:342-352`). lpx-toolkit's investigation found these
  vary per region within the same track, so they are *not* a track key,
  but no other purpose has been pinned down.
* **(d) `REGION_NAME_MAX_LEN = 200`** is an empirical cap to filter
  16-bit garbage; the real Logic limit on region-name length is not
  documented (`src/regions.rs:16, 50-52`).

### 4.4 `ProjectData` — AU descriptors

* **(d) Display-name extraction is not ported.** Python's `find_aus`
  recovers a `display_name` field by scanning ASCII back from the
  type-code anchor (see `lpx_inspect.py:721`). The Rust port
  intentionally does not — `AURef::display_name` is `None` for
  3rd-party AUs found via the 4CC-triple strategy and the application
  layer relies on `auval -l` lookup. Cite `src/lib.rs:48-57, 124-130`.
  Whether this is "format unknown" or "feature deferred" depends on
  perspective, but the byte-layout of the display-name field
  (~11 chars, terminator) is documented only in lpx-toolkit's
  `CLAUDE.md:18` and *not in the Rust source*.
* **(c) Apple stock plug-in 4CC fingerprint is not recoverable.**
  The `STOCK_FINGERPRINTS` table at `src/apple_stock.rs:78-79` has
  exactly **one** verified entry (`Compressor → aufx/Comp/appl`).
  Other stock-plug-in display names recovered in practice
  (`Bass Amp`, `Limiter`, `Phat FX`, `Graph EQ`, `ChromaGlow`,
  `Alchemy`, etc.) are flagged at `src/apple_stock.rs:75-77` as
  "unverified" — the synthesised subtype is a placeholder and will
  not match an `auval -l` registry entry without the real 4CC.
* **(c) Apple Drummer cluster threshold is heuristic.** 32 KB is
  documented as "generous enough to merge per-region snapshots and
  historical state but tight enough to separate genuinely distinct
  Drummer instances on different tracks" — empirically tuned against
  one project. Cite `src/apple_drummer.rs:38-43`.
* **(d) `MAX_TYPE_VALUE_LEN = 96`** in the Drummer scanner is a soft
  upper bound on the expected JSON value length without an in-source
  rationale. Cite `src/apple_drummer.rs:37`.
* **(c) Known-character map for Drummer / Bass Player has 2 entries.**
  Any other `Type_*` identifier falls back to the stripped suffix and
  surfaces as the verbatim identifier. Cite
  `src/apple_drummer.rs:110-116`.
* **(d) Apple-stock `flag1` accepts only `0x00` and `0x02`.** Any
  other value is rejected as noise. Whether other flag values exist
  in newer Logic versions is not investigated. Cite
  `src/apple_stock.rs:104-117`.
* **(d) Apple-stock `flag2 = 0x01` is hard-coded for Klopfgeist.**
  The branch is described as "different slot kind — it's the system
  metronome, not a regular instrument", but the structural difference
  is not catalogued. Cite `src/apple_stock.rs:46-50, 106`.

### 4.5 `ProjectData` — large-scale structure

* **(c) NSKeyedArchive `bplist00` blobs are completely opaque to the
  parser.** Their byte ranges within `ProjectData` are not even
  detected, just relied upon to not match the structural anchors. See
  `src/lib.rs` (no `bplist00` reference anywhere) and lpx-toolkit
  `CLAUDE.md:19`.
* **(c) The `OCuA` channel-strip record format is mentioned in
  lpx-toolkit's `CLAUDE.md:32, 98` but is not parsed by the Rust
  port.** It is not a known unknown of *the format* — Python parses
  it — but it is a known unknown of *this codebase*. The lpx-toolkit
  `find_active_strips` / OCuA handling has not been ported.
* **(c) The `karT` 4CC is documented as "score-editor 'track'
  (notation metadata) not the channel strip"** in lpx-toolkit
  `CLAUDE.md:101`. Not parsed.
* **(c) Track-header records (`\x70\x03\x01\x00` signature)** are
  parsed by Python's `find_track_header_records` but **not ported to
  Rust**. lpx-toolkit `CLAUDE.md:113`. Discrepancy: `src/lib.rs:12-19`
  declares no `tracks_header` module.

### 4.6 `MetaData.plist` and `ProjectInformation.plist`

* **(d) `FrameRateIndex` integer enum is not decoded.** The parser
  surfaces the raw index; the mapping (e.g. 1 ⇒ 24fps?) is not
  catalogued anywhere in this repo. Cite
  `src/metadata.rs:25, 58`.
* **(d) `AudioFiles` and `ImpulsResponsesFiles` arrays are counted
  but not introspected.** Their entry shape (paths? bookmarks?
  per-file metadata?) is opaque to the parser. Cite
  `src/metadata.rs:79-84`.
* **(d) `DisplayState.plist` and `DisplayStateArchive` are not
  parsed.** lpx-toolkit `CLAUDE.md:20` lumps these in with
  `MetaData.plist` as "standard Apple plists" but no schema is
  documented and no code reads them.

### 4.7 Discrepancies between code and supporting docs

* **(d) Rust source-code comment vs lpx-toolkit `CLAUDE.md` —
  registry preamble length** (32-byte vs 64-byte). See §4.2 above.
* **(d) BRIEF.md scope vs implemented scope.** `BRIEF.md:139-151`
  declares the walking-skeleton AU scan covers only `aumu`/`aufx`/`aumf`;
  the implementation has expanded to include `aumi` (MIDI processor)
  *and* the GAME-anchor stock-plug-in scan *and* the JSON-anchor
  Drummer/Bass Player scan. Documentation drift, not parser bug. See
  `src/lib.rs:70-75, 133-134`.

---

## 5. Open questions / next steps

Listed roughly in order of impact-to-difficulty for someone writing a
clean-room parser.

1. **Reverse-engineer the hidden-track flag.** Currently every track
   the user has hidden in Logic still appears in the parser output.
   §4.1; lpx-toolkit `CLAUDE.md:141-143`. Not on the registry-record
   control bytes; not on the track-link preamble. Plausible candidates
   not yet investigated: a separate plist key in `DisplayState.plist`,
   a bit inside the channel-strip descriptor's untouched bytes 5–7
   (§4.1).
2. **Verify the AU 4CC fingerprint for the 6 known Apple stock
   plug-ins.** Recover real `(type, subtype)` pairs for `Bass Amp`,
   `Limiter`, `Phat FX`, `Graph EQ`, `ChromaGlow`, `Alchemy` by
   cross-referencing each project's `find_apple_stock_aus` output
   with `auval -l` rows whose name matches. Add to
   `STOCK_FINGERPRINTS` (`src/apple_stock.rs:78-79`). Without this,
   stock plug-ins survive only because the application layer's
   "always installed" shortcut treats `display_name`-bearing AURefs as
   compatible.
3. **Catalogue the folder-kind subtypes.** Six signatures collapse to
   `Folder` (§3.1.6). Mapping each to a meaningful kind (Aux Stack,
   Folder Stack, colour group) would let the UI render the Tracks
   Area hierarchy faithfully. Diff a 1-folder vs 2-folder project to
   isolate which fields encode the kind, and which encode the parent
   pointer (currently `Track::parent_offset` is always `None` —
   `src/tracks.rs:46`).
4. **Decode the descriptor bytes 5–7 of channel-strip records.**
   Likely candidates given the read bits' semantics (kind, active):
   stereo/mono mode, freeze status, send count, monitor enable,
   colour. §4.1.
5. **Identify what byte 6 of the registry header encodes** under the
   `XX 00 00 00` variant (signatures `4d 10` / `5f 11`). Only two values
   are observed — `0x6c` (Bass) and `0x68` (Drums) — but the parser
   admits any non-zero byte. Likely a category / kind discriminator,
   but unverified. §4.2; `src/tracks_registry.rs:127-143`.
6. **Decode the 4 bytes preceding the `0x61 0xff` region marker.**
   They vary per region within a track, so they're either a region
   ID or a pointer. If a region ID, they likely cross-reference into
   the (still-unsolved) region→strip mapping. §4.3.
7. **Map `FrameRateIndex` enum values.** Trivial work for someone
   with multiple Logic projects at different frame rates. §4.6.
8. **Port (or replace) Python's track-header records and OCuA
   channel-strip decoding.** Both are unimplemented in Rust. §4.5.
   Either commits to maintaining feature parity with lpx-toolkit or
   admits the divergence and documents the gap.
9. **Investigate `DisplayState.plist`.** Likely contains the hidden-
   track flag (1) and the track-row order (§4.1). §4.6.
10. **Reconcile the 32/64-byte preamble doc drift** in the
    `TrackRegistryEntry.track_id` doc-comment at
    `src/tracks_registry.rs:93-95`. §4.7. Trivial, but corrosive to
    trust if left.
