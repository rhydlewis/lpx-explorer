import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";

import { useAuRegistryStore } from "../store/au-registry-store";
import { useProjectStore } from "../store/project-store";

import { buildProjectReadme, readmeInputFromProject } from "./export-readme";

export type ReadmeExportResult =
  | { kind: "no-project" }
  | { kind: "cancelled" }
  | { kind: "written"; path: string }
  | { kind: "error"; message: string };

/**
 * Export the collaborator/archive README (lpx-explorer-428): gather the
 * open project + AU registry, build the plain-text summary, prompt for a
 * destination via the native save dialog, and write it through the
 * read-only-safe `export_readme` command. No-ops when no project is
 * open. Returns a result the caller can surface as a hint/toast.
 */
export async function runReadmeExport(): Promise<ReadmeExportResult> {
  const project = useProjectStore.getState().current;
  if (project.kind !== "loaded") {
    return { kind: "no-project" };
  }

  const registryStatus = useAuRegistryStore.getState().status;
  const registry =
    registryStatus.kind === "loaded" ? registryStatus.registry : null;

  const input = readmeInputFromProject({
    path: project.path,
    summary: project.summary,
    alternatives: project.alternatives,
    activeVariantIndex: project.activeVariantIndex,
    registry,
  });
  const contents = buildProjectReadme(input);

  const target = await save({
    title: "Export project README",
    defaultPath: `${input.projectName} README.txt`,
    filters: [{ name: "Text file", extensions: ["txt"] }],
  });
  if (typeof target !== "string") {
    return { kind: "cancelled" };
  }

  try {
    await invoke("export_readme", { path: target, contents });
    return { kind: "written", path: target };
  } catch (e) {
    return { kind: "error", message: typeof e === "string" ? e : String(e) };
  }
}
