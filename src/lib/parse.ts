import { invoke } from "@tauri-apps/api/core";

import type { ProjectSummary } from "./types";

/**
 * Invoke the Rust `parse_project` Tauri command for a `.logicx` bundle
 * path and return the typed `ProjectSummary` payload.
 */
export async function parseProject(path: string): Promise<ProjectSummary> {
  return invoke<ProjectSummary>("parse_project", { path });
}

/**
 * Cheap stat of `<bundle>/Alternatives/*\/ProjectData` used as the
 * cache key by `useLibrarySummariesStore` (lpx-explorer-aay).
 * Returns `null` when the bundle has no parseable Alternatives —
 * caller treats that as 'no cache, parse fresh'.
 */
export interface ProjectDataStat {
  readonly mtime_unix: number;
  readonly size_bytes: number;
}

export async function projectDataStat(
  path: string,
): Promise<ProjectDataStat | null> {
  return invoke<ProjectDataStat | null>("project_data_stat", { path });
}
