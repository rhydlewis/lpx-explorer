// Shared between Rust (serde) and TypeScript. Field names mirror the
// `lpx-parser::AURef` struct. Keep in sync.

export interface AURef {
  type_code: string;
  subtype: string;
  manufacturer: string;
  offset: number;
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

export interface ProjectSummary {
  fingerprints: AURef[];
  metadata: ProjectMetadata;
  stats: BundleStats;
  tracks: Track[];
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
