// Shared between Rust (serde) and TypeScript. Field names mirror the
// `lpx-parser::AURef` struct. Keep in sync.

export interface AURef {
  type_code: string;
  subtype: string;
  manufacturer: string;
  offset: number;
  /**
   * User-facing plug-in name. Set when the parser recovers the full name
   * directly (e.g. Apple stock plug-ins identified via the `GAME` 4CC
   * marker). Absent for 3rd-party AUs detected via the standard 4CC
   * triple — their display name comes from the `auval -l` lookup table.
   */
  display_name?: string;
}

export interface ProjectMetadata {
  song_key: string;
  song_gender: string;
  bpm: number;
  sig_numerator: number;
  sig_denominator: number;
  track_count: number;
  sample_rate: number;
  audio_file_count: number;
  impulse_response_count: number;
  frame_rate_index: number;
}

export interface BundleStats {
  size_bytes: number;
  created_at_unix: number;
  modified_at_unix: number;
}

export type TrackKind =
  | "audio"
  | "instrument"
  | "folder"
  | "summing-stack"
  | "master"
  | "output"
  | "bus"
  | "aux"
  | "input"
  | "unknown";

export interface Track {
  name: string;
  /**
   * User-given name recovered from a region-record cluster.
   * `null` when the parser couldn't pair this track with a cluster
   * (e.g. user never renamed it). Display layer prefers this over
   * `name` when present.
   */
  user_name: string | null;
  kind: TrackKind;
  offset: number;
  is_active: boolean;
  instrument: AURef | null;
  midi_fx: AURef[];
  audio_fx: AURef[];
  sub_number: number | null;
  parent_offset: number | null;
}

/**
 * Single record from the track-registry scan — one per user-visible
 * Tracks Area entry in Logic. Distinct from `Track` (channel-strip
 * record): registry entries are what the user *sees*; channel strips
 * are the AU-bearing slots underneath.
 */
export interface TrackRegistryEntry {
  offset: number;
  name: string;
  kind: TrackKind;
  /** Per-track ID; 0 when the preceding track-link structure is absent. */
  track_id: number;
  /** Channel-strip number for audio kinds; 0 otherwise / unrecoverable. */
  strip_id: number;
}

export interface ProjectSummary {
  fingerprints: AURef[];
  metadata: ProjectMetadata;
  stats: BundleStats;
  tracks: Track[];
  tracks_registry: TrackRegistryEntry[];
}

// ─── AU registry ─────────────────────────────────────────────────────

export interface AuvalEntry {
  fingerprint: string;          // "{type}/{subtype}/{manufacturer}"
  type_4cc: string;
  subtype_4cc: string;          // trailing/leading spaces preserved verbatim
  manufacturer_4cc: string;     // trailing/leading spaces preserved verbatim
  name: string;
}

export interface AuRegistry {
  entries: AuvalEntry[];
  scanned_at_unix: number;
}

/**
 * One project alternative as listed in `<bundle>/Resources/
 * ProjectInformation.plist` — Logic stores a `VariantNames`
 * dictionary keyed by zero-padded index, with `ActiveVariant`
 * pointing at whichever was last opened. Mirrors the Rust
 * `commands::AlternativeEntry` struct (lpx-explorer-unl + ax6) —
 * which wraps `lpx_parser::Alternative` with the filesystem-derived
 * `window_image_path` (Logic writes a screenshot of the main window
 * to each alternative on save).
 */
export interface Alternative {
  readonly index: number;
  readonly display_name: string;
  readonly is_active: boolean;
  /** Path to `<bundle>/Alternatives/<NNN>/WindowImage.jpg` if Logic wrote
   *  one, else null. Pass through `convertFileSrc` before using as an
   *  `<img>` src. Read-only contract: never write to this path. */
  readonly window_image_path: string | null;
  /** Mtime of `<bundle>/Alternatives/<NNN>/ProjectData` in unix seconds.
   *  0 means unknown — render a fallback caption rather than "53 years ago". */
  readonly last_saved_unix: number;
}

// ─── Audio inventory (lpx-explorer-34y) ──────────────────────────────

/**
 * Which of Logic's three audio storage buckets a file came from.
 * Drives the smart-pick fallback chain (Bounce → AudioRegion →
 * FreezeFile) and the UI label that tells the user what they're
 * listening to. Kebab-case to match the Rust `serde(rename_all)`.
 */
export type AudioCategory = "bounce" | "audio-region" | "freeze-file";

/**
 * One audio file found inside a `.logicx` bundle. Mirrors
 * `audio_inventory::AudioFile` in Rust. `path` is an absolute
 * filesystem path — pass through `convertFileSrc` for `<audio src>`.
 */
export interface AudioFile {
  readonly path: string;
  readonly file_name: string;
  readonly category: AudioCategory;
  readonly size_bytes: number;
  readonly mtime_unix: number;
  /**
   * `true` when macOS WebKit's HTML5 `<audio>` element can play the
   * file natively. `false` for CAF, which freeze files use — UI lists
   * the file but disables the ▶ button.
   */
  readonly previewable: boolean;
}

// ─── Library / UI types ──────────────────────────────────────────────

export interface RecentEntry {
  readonly path: string;
  readonly name: string;
  readonly lastLoadedMs: number;
}

export type ScanStatus =
  | { readonly kind: "idle" }
  | { readonly kind: "scanning" }
  | { readonly kind: "done" }
  | { readonly kind: "error"; readonly message: string };

export interface FolderEntry {
  readonly path: string;
  readonly status: ScanStatus;
  readonly projects: ReadonlyArray<string>;
}
