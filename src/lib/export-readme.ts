/**
 * Build a plain-text README summarising a Logic project for
 * collaborators / archives (lpx-explorer-428). Pure: takes a fully
 * resolved input and returns the file contents. Gathering the input
 * from the stores lives in `readmeInputFromProject`.
 */

import { groupFingerprints } from "./au-utils";
import { projectNameOf } from "./path-utils";
import type { Alternative, AuRegistry, ProjectSummary } from "./types";

export interface ReadmeInput {
  readonly projectName: string;
  /**
   * Logic Pro version that last saved the project (lpx-explorer-2o2),
   * e.g. "Logic Pro 12.2 (6644)". null when unknown — omitted.
   */
  readonly logicVersion: string | null;
  /** Tempo in BPM. <= 0 means unknown — omitted from the header. */
  readonly bpm: number;
  /** Sample rate in Hz. <= 0 means unknown — omitted. */
  readonly sampleRateHz: number;
  /** Logic's SMPTE frame-rate table index. Unknown indices are omitted. */
  readonly frameRateIndex: number;
  /** Alternative display names, in variant order. */
  readonly alternatives: ReadonlyArray<string>;
  /** Name of the active alternative, or null if none is flagged. */
  readonly currentAlternative: string | null;
  /** Non-Apple plug-in display names. */
  readonly thirdPartyPlugins: ReadonlyArray<string>;
}

/**
 * Logic's SMPTE frame-rate table — index → label. Kept in sync with the
 * canonical copy in `ProjectInfo.tsx` (FRAME_RATE_BY_INDEX) and
 * `lpx_inspect.py:133-142`. Unknown indices yield null (field omitted).
 */
const FRAME_RATE_BY_INDEX: Record<number, string> = {
  0: "24 fps",
  1: "25 fps",
  2: "29.97 fps (drop)",
  3: "30 fps (drop)",
  4: "29.97 fps",
  5: "30 fps",
  6: "23.976 fps",
  7: "23.976 fps",
};

function frameRateLabel(idx: number): string | null {
  return FRAME_RATE_BY_INDEX[idx] ?? null;
}

function statsLine(input: ReadmeInput): string | null {
  const parts: string[] = [];
  if (input.logicVersion !== null) parts.push(input.logicVersion);
  if (input.bpm > 0) parts.push(`${input.bpm.toFixed(1)} BPM`);
  if (input.sampleRateHz > 0) {
    parts.push(`${(input.sampleRateHz / 1000).toFixed(1)} kHz`);
  }
  const fps = frameRateLabel(input.frameRateIndex);
  if (fps !== null) parts.push(fps);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function buildProjectReadme(input: ReadmeInput): string {
  const sections: string[] = [];

  // Header: name, then an optional stats line (omitted entirely if no
  // field is known, so collaborators never see a row of dashes).
  const header = [input.projectName];
  const stats = statsLine(input);
  if (stats !== null) header.push(stats);
  sections.push(header.join("\n"));

  // Project Alternatives.
  const altLines = input.alternatives.map((name) => `  - ${name}`);
  sections.push(
    ["Project Alternatives:", ...(altLines.length > 0 ? altLines : ["  (none)"])].join(
      "\n",
    ),
  );

  // Current Alternative.
  sections.push(
    `Current Alternative:\n  ${input.currentAlternative ?? "(none)"}`,
  );

  // 3rd-Party Plug-ins — sorted, deduped is the caller's job.
  const plugins = [...input.thirdPartyPlugins].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
  );
  const pluginLines =
    plugins.length > 0 ? plugins.map((name) => `  - ${name}`) : ["  (none)"];
  sections.push(["3rd-Party Plug-ins:", ...pluginLines].join("\n"));

  // Blank line between sections; trailing newline so the file ends clean.
  return sections.join("\n\n") + "\n";
}

export interface ProjectForReadme {
  readonly path: string;
  readonly summary: ProjectSummary;
  readonly alternatives: ReadonlyArray<Alternative>;
  readonly activeVariantIndex: number;
  readonly registry: AuRegistry | null;
  /** `LastSavedFrom` Logic version, or null when unknown (lpx-explorer-2o2). */
  readonly lastSavedFrom: string | null;
}

/**
 * Resolve a loaded project (+ the AU registry) into the README input.
 * 3rd-party = AUs the parser did NOT identify directly (no
 * `display_name`); their human name comes from the auval registry when
 * loaded, otherwise the raw fingerprint is the best we have.
 */
export function readmeInputFromProject(p: ProjectForReadme): ReadmeInput {
  const groups = groupFingerprints(p.summary.fingerprints);
  const thirdPartyPlugins = groups
    .filter((g) => g.display_name === undefined)
    .map(
      (g) =>
        p.registry?.entries.find((e) => e.fingerprint === g.fingerprint)?.name ??
        g.fingerprint,
    );

  const current =
    p.alternatives.find((a) => a.index === p.activeVariantIndex) ?? null;

  return {
    projectName: projectNameOf(p.path),
    logicVersion: p.lastSavedFrom,
    bpm: p.summary.metadata.bpm,
    sampleRateHz: p.summary.metadata.sample_rate,
    frameRateIndex: p.summary.metadata.frame_rate_index,
    alternatives: p.alternatives.map((a) => a.display_name),
    currentAlternative: current?.display_name ?? null,
    thirdPartyPlugins,
  };
}
