import { invoke } from "@tauri-apps/api/core";

import type { Alternative, AudioFile, ProjectSummary } from "./types";

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

/**
 * Does `<bundle>/Resources/ProjectInformation.plist` exist
 * (lpx-explorer-dfg)? Logic writes this manifest on save; the frontend
 * shows a non-blocking warning banner when it's absent. Pure read.
 */
export async function projectInformationPresent(path: string): Promise<boolean> {
  return invoke<boolean>("project_information_present", { path });
}

/**
 * Enumerate every recognised audio file inside a `.logicx` bundle
 * (lpx-explorer-34y). Walks `Bounces/`, `Audio Files/`, `Freeze
 * Files/` at the bundle root and mirrored under each
 * `Alternatives/<NNN>/`. Returns a flat list — alternatives are not
 * surfaced as separate buckets in v1.
 */
export async function listAudioFiles(path: string): Promise<AudioFile[]> {
  return invoke<AudioFile[]>("list_audio_files", { path });
}

// ─── Smart-pick helper ───────────────────────────────────────────────

/**
 * Mirror of `audio_inventory::pick_hero` for the frontend.
 * Bounce (most recent) → AudioRegion (largest) → FreezeFile (most
 * recent). Only `previewable` files are eligible — CAF gets listed
 * but never selected as hero. Returns `null` when nothing previewable
 * exists.
 *
 * Kept in TS rather than as a Tauri command so the inventory call
 * stays a pure read; UI logic that wants to filter / re-rank locally
 * (sort by mtime, hide a category) doesn't need a round-trip.
 */
export function pickHeroAudio(files: ReadonlyArray<AudioFile>): AudioFile | null {
  const mostRecent = (category: AudioFile["category"]): AudioFile | null => {
    let best: AudioFile | null = null;
    for (const f of files) {
      if (f.category !== category || !f.previewable) continue;
      if (best === null || f.mtime_unix > best.mtime_unix) best = f;
    }
    return best;
  };
  const largest = (category: AudioFile["category"]): AudioFile | null => {
    let best: AudioFile | null = null;
    for (const f of files) {
      if (f.category !== category || !f.previewable) continue;
      if (best === null || f.size_bytes > best.size_bytes) best = f;
    }
    return best;
  };
  return mostRecent("bounce") ?? largest("audio-region") ?? mostRecent("freeze-file");
}
