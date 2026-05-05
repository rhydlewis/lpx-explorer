// Shared between Rust (serde) and TypeScript. Field names mirror the
// `lpx-parser::AURef` struct. Keep in sync.

export interface AURef {
  type_code: string;
  subtype: string;
  manufacturer: string;
  offset: number;
}

export interface ProjectSummary {
  fingerprints: AURef[];
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
