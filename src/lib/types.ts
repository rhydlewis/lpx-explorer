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
