import { invoke } from "@tauri-apps/api/core";

import type { ProjectSummary } from "./types";

/**
 * Invoke the Rust `parse_project` Tauri command for a `.logicx` bundle
 * path and return the typed `ProjectSummary` payload.
 */
export async function parseProject(path: string): Promise<ProjectSummary> {
  return invoke<ProjectSummary>("parse_project", { path });
}
