import { fineCategoryOf, type AuFineCategory } from "../../lib/au-categories";
import {
  groupFingerprints,
  installStatusOf,
  type FingerprintGroup,
  type InstallStatus,
} from "../../lib/au-utils";
import type { RolledFingerprint } from "../../lib/library-rollup";
import type { AuRegistry, ProjectSummary } from "../../lib/types";
import type { PluginRailChip } from "../../store/ui-store";

export interface DisplayGroup {
  readonly group: FingerprintGroup;
  readonly status: InstallStatus;
  readonly displayName: string;
  readonly hasRegistryEntry: boolean;
  /**
   * Fine-grained Logic-Pro-style category (lpx-explorer-uqg). Resolved
   * from displayName via the static FINE_CATEGORIES_BY_NAME table; falls
   * back to coarse category for instrument/midi rows. 'Uncategorised'
   * for unknown effects — surfaced in the count line so the user can
   * see how complete the static map is.
   */
  readonly fineCategory: AuFineCategory;
  /**
   * Set when the row was produced by the library-scope rollup. UI uses
   * this to switch to the cross-project row layout (project disclosure,
   * 'Used in N projects' badge).
   */
  readonly rolled?: RolledFingerprint;
}

export function buildDisplayGroups(
  summary: ProjectSummary,
  registry: AuRegistry | null,
): ReadonlyArray<DisplayGroup> {
  const groups = groupFingerprints(summary.fingerprints);
  return groups.map((group) => {
    if (group.display_name !== undefined) {
      return {
        group,
        status: "installed" as InstallStatus,
        displayName: group.display_name,
        hasRegistryEntry: false,
        fineCategory: fineCategoryOf({
          displayName: group.display_name,
          fingerprint: group.fingerprint,
        }),
      };
    }
    const entry = registry?.entries.find(
      (e) => e.fingerprint === group.fingerprint,
    );
    const displayName = entry?.name ?? group.fingerprint;
    return {
      group,
      status: installStatusOf(group.fingerprint, registry),
      displayName,
      hasRegistryEntry: entry !== undefined,
      fineCategory: fineCategoryOf({
        displayName: entry !== undefined ? displayName : undefined,
        fingerprint: group.fingerprint,
      }),
    };
  });
}

export function buildLibraryGroups(
  rolled: ReadonlyArray<RolledFingerprint>,
  registry: AuRegistry | null,
): ReadonlyArray<DisplayGroup> {
  return rolled.map((row) => {
    const group: FingerprintGroup = {
      fingerprint: row.fingerprint,
      count: row.projectCount,
      first_offset: 0,
      display_name: row.displayName,
    };
    if (row.displayName !== undefined) {
      return {
        group,
        status: "installed" as InstallStatus,
        displayName: row.displayName,
        hasRegistryEntry: false,
        fineCategory: fineCategoryOf({
          displayName: row.displayName,
          fingerprint: row.fingerprint,
        }),
        rolled: row,
      };
    }
    const entry = registry?.entries.find(
      (e) => e.fingerprint === row.fingerprint,
    );
    const displayName = entry?.name ?? row.fingerprint;
    return {
      group,
      status: installStatusOf(row.fingerprint, registry),
      displayName,
      hasRegistryEntry: entry !== undefined,
      fineCategory: fineCategoryOf({
        displayName: entry !== undefined ? displayName : undefined,
        fingerprint: row.fingerprint,
      }),
      rolled: row,
    };
  });
}

export function applyFilters(
  all: ReadonlyArray<DisplayGroup>,
  query: string,
  chip: PluginRailChip,
  fineCategory: AuFineCategory | null = null,
): ReadonlyArray<DisplayGroup> {
  const needle = query.trim().toLowerCase();
  return all.filter((g) => {
    if (chip === "installed" && g.status !== "installed") return false;
    if (chip === "missing" && g.status !== "missing") return false;
    if (chip === "duplicated" && g.group.count < 2) return false;
    if (fineCategory !== null && g.fineCategory !== fineCategory) return false;
    if (needle === "") return true;
    return (
      g.displayName.toLowerCase().includes(needle) ||
      g.group.fingerprint.toLowerCase().includes(needle)
    );
  });
}

/**
 * Aggregate fine-category counts across the current plug-in set.
 * Categories with zero rows are omitted; the rail facet row only
 * renders chips for categories present in the data. Sort: descending
 * by count, ties alphabetical, 'Uncategorised' always last.
 */
export interface FineCategoryFacet {
  readonly category: AuFineCategory;
  readonly count: number;
}

export function fineCategoryFacets(
  groups: ReadonlyArray<DisplayGroup>,
): ReadonlyArray<FineCategoryFacet> {
  const counts = new Map<AuFineCategory, number>();
  for (const g of groups) {
    counts.set(g.fineCategory, (counts.get(g.fineCategory) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => {
      if (a.category === "Uncategorised") return 1;
      if (b.category === "Uncategorised") return -1;
      if (a.count !== b.count) return b.count - a.count;
      return a.category.localeCompare(b.category);
    });
}

/**
 * Library-scope sort: descending by `projectCount` (most-used plug-ins
 * first — that's the JTBD answer for 'what do I depend on most'),
 * tie-break ascending by displayName for stable ordering across
 * re-renders. Project-scope rows come from `groupFingerprints` which
 * already keeps insertion order; we don't sort them.
 */
export function sortLibraryGroups(
  groups: ReadonlyArray<DisplayGroup>,
): ReadonlyArray<DisplayGroup> {
  return [...groups].sort((a, b) => {
    if (a.group.count !== b.group.count) {
      return b.group.count - a.group.count;
    }
    return a.displayName.localeCompare(b.displayName);
  });
}
