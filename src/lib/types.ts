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

export interface ProjectSummary {
  fingerprints: AURef[];
  metadata: ProjectMetadata;
  stats: BundleStats;
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
