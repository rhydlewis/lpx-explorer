import { categoryOfFingerprint } from "../../lib/au-categories";
import {
  groupFingerprints,
  installStatusOf,
  type FingerprintGroup,
  type InstallStatus,
} from "../../lib/au-utils";
import type { RolledFingerprint } from "../../lib/library-rollup";
import type { AuRegistry, ProjectSummary } from "../../lib/types";
import type { PluginRailCategory, PluginRailChip } from "../../store/ui-store";

export interface DisplayGroup {
  readonly group: FingerprintGroup;
  readonly status: InstallStatus;
  readonly displayName: string;
  readonly hasRegistryEntry: boolean;
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
      };
    }
    const entry = registry?.entries.find(
      (e) => e.fingerprint === group.fingerprint,
    );
    return {
      group,
      status: installStatusOf(group.fingerprint, registry),
      displayName: entry?.name ?? group.fingerprint,
      hasRegistryEntry: entry !== undefined,
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
        rolled: row,
      };
    }
    const entry = registry?.entries.find(
      (e) => e.fingerprint === row.fingerprint,
    );
    return {
      group,
      status: installStatusOf(row.fingerprint, registry),
      displayName: entry?.name ?? row.fingerprint,
      hasRegistryEntry: entry !== undefined,
      rolled: row,
    };
  });
}

export function applyFilters(
  all: ReadonlyArray<DisplayGroup>,
  query: string,
  chip: PluginRailChip,
  category: PluginRailCategory = "all",
): ReadonlyArray<DisplayGroup> {
  const needle = query.trim().toLowerCase();
  return all.filter((g) => {
    if (chip === "installed" && g.status !== "installed") return false;
    if (chip === "missing" && g.status !== "missing") return false;
    if (chip === "duplicated" && g.group.count < 2) return false;
    if (
      category !== "all" &&
      categoryOfFingerprint(g.group.fingerprint) !== category
    ) {
      return false;
    }
    if (needle === "") return true;
    return (
      g.displayName.toLowerCase().includes(needle) ||
      g.group.fingerprint.toLowerCase().includes(needle)
    );
  });
}
