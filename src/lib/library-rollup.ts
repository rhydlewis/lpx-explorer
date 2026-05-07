import type { ProjectSummary } from "./types";

/**
 * One row in the cross-project rollup view (lpx-explorer-185).
 *
 * `projectCount` is the user-visible number — *'EZdrummer 2 — used in
 * 14 projects'*. `totalInstanceCount` is the aggregate of per-project
 * occurrences (a project that has Compressor on two tracks contributes
 * 2 instances but 1 to the project count). UI surfaces projectCount by
 * default; instanceCount is available for callers that want it.
 */
export interface RolledFingerprint {
  readonly fingerprint: string;
  readonly projectCount: number;
  readonly totalInstanceCount: number;
  readonly projectPaths: ReadonlyArray<string>;
  readonly displayName?: string;
}

interface Acc {
  paths: Set<string>;
  totalInstanceCount: number;
  displayName: string | undefined;
}

function fingerprintOf(au: { type_code: string; subtype: string; manufacturer: string }): string {
  return `${au.type_code}/${au.subtype}/${au.manufacturer}`;
}

/**
 * Aggregate a `path → ProjectSummary` map into deduped fingerprint rows
 * with cross-project counts. Pure function; testable in isolation.
 *
 * Rows are sorted by descending `projectCount` then ascending fingerprint
 * — the most-used plug-ins surface first, with stable ordering for ties.
 */
export function aggregateLibrary(
  summaries: ReadonlyMap<string, ProjectSummary>,
): ReadonlyArray<RolledFingerprint> {
  const acc = new Map<string, Acc>();

  for (const [path, summary] of summaries) {
    for (const au of summary.fingerprints) {
      const fp = fingerprintOf(au);
      const existing = acc.get(fp);
      if (existing === undefined) {
        acc.set(fp, {
          paths: new Set([path]),
          totalInstanceCount: 1,
          displayName: au.display_name,
        });
      } else {
        existing.paths.add(path);
        existing.totalInstanceCount += 1;
        if (existing.displayName === undefined && au.display_name !== undefined) {
          existing.displayName = au.display_name;
        }
      }
    }
  }

  const rows: RolledFingerprint[] = [];
  for (const [fingerprint, a] of acc) {
    rows.push({
      fingerprint,
      projectCount: a.paths.size,
      totalInstanceCount: a.totalInstanceCount,
      projectPaths: Array.from(a.paths).sort((p, q) => p.localeCompare(q)),
      displayName: a.displayName,
    });
  }

  rows.sort((x, y) => {
    if (x.projectCount !== y.projectCount) {
      return y.projectCount - x.projectCount;
    }
    return x.fingerprint.localeCompare(y.fingerprint);
  });

  return rows;
}
