import { invoke } from "@tauri-apps/api/core";

import type { Alternative, ProjectSummary } from "./types";

/**
 * Invoke the Rust `parse_project` Tauri command for a `.logicx` bundle
 * path and return the typed `ProjectSummary` payload.
 */
export async function parseProject(path: string): Promise<ProjectSummary> {
  return invoke<ProjectSummary>("parse_project", { path });
}

/**
 * List the alternatives inside a `.logicx` bundle (lpx-explorer-unl).
 * Reads `<bundle>/Resources/ProjectInformation.plist` and returns one
 * entry per variant. Single-variant projects without a manifest fall
 * back to a synthetic `[{ index: 0, display_name: <bundle name>,
 * is_active: true }]`. Empty array when the bundle is unparseable.
 */
export async function listAlternatives(path: string): Promise<Alternative[]> {
  return invoke<Alternative[]>("list_alternatives", { path });
}

/**
 * Parse a specific alternative inside a `.logicx` bundle
 * (lpx-explorer-unl). Same pipeline as parseProject but reads
 * `Alternatives/{index:03}/`. The frontend uses this once it knows
 * which variant to load (default: the `is_active` entry from
 * listAlternatives).
 */
export async function parseAlternative(
  path: string,
  variantIndex: number,
): Promise<ProjectSummary> {
  return invoke<ProjectSummary>("parse_alternative", {
    path,
    variantIndex,
  });
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
