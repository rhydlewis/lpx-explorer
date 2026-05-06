import { useEffect, useMemo, useRef } from "react";

import {
  groupFingerprints,
  installStatusOf,
  type FingerprintGroup,
  type InstallStatus,
} from "../../lib/au-utils";
import type { AuRegistry, ProjectSummary } from "../../lib/types";
import { useAuRegistryStore } from "../../store/au-registry-store";
import {
  useUIStore,
  type PluginRailChip,
} from "../../store/ui-store";

import sectionStyles from "./Inspector.module.css";
import styles from "./PluginRail.module.css";

interface Props {
  readonly summary: ProjectSummary;
}

const INSTALL_LABEL: Record<Exclude<InstallStatus, "unknown">, string> = {
  installed: "Installed",
  missing: "Missing on this Mac",
};

const CHIPS: ReadonlyArray<{ id: PluginRailChip; label: string }> = [
  { id: "all", label: "All" },
  { id: "installed", label: "Installed" },
  { id: "missing", label: "Missing" },
  { id: "duplicated", label: "Duplicated" },
];

interface DisplayGroup {
  readonly group: FingerprintGroup;
  readonly status: InstallStatus;
  readonly displayName: string;
  readonly hasRegistryEntry: boolean;
}

function loadedRegistry(
  status: ReturnType<typeof useAuRegistryStore.getState>["status"],
): AuRegistry | null {
  return status.kind === "loaded" ? status.registry : null;
}

function buildDisplayGroups(
  summary: ProjectSummary,
  registry: AuRegistry | null,
): ReadonlyArray<DisplayGroup> {
  const groups = groupFingerprints(summary.fingerprints);
  return groups.map((group) => {
    // Apple stock plug-ins arrive with a real display_name and a
    // synthesised fingerprint that won't match auval. Treat them as
    // installed-by-default (they ship with Logic) and render the human
    // name without the synthesised fingerprint sub-line.
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

function applyFilters(
  all: ReadonlyArray<DisplayGroup>,
  query: string,
  chip: PluginRailChip,
): ReadonlyArray<DisplayGroup> {
  const needle = query.trim().toLowerCase();
  return all.filter((g) => {
    if (chip === "installed" && g.status !== "installed") return false;
    if (chip === "missing" && g.status !== "missing") return false;
    if (chip === "duplicated" && g.group.count < 2) return false;
    if (needle === "") return true;
    return (
      g.displayName.toLowerCase().includes(needle) ||
      g.group.fingerprint.toLowerCase().includes(needle)
    );
  });
}

/**
 * Right-rail plug-in panel — surfaces the project's deduped plug-ins
 * permanently alongside the Inspector's main column. Distinct from the
 * old in-column `<PluginList>` (now removed): always visible, has its
 * own search + chip filters, and is the focus target for the
 * Compatibility pill's jump-to-missing affordance.
 */
export function PluginRail({ summary }: Props) {
  const registry = useAuRegistryStore((s) => loadedRegistry(s.status));
  const filter = useUIStore((s) => s.pluginRailFilter);
  const setFilter = useUIStore((s) => s.setPluginRailFilter);
  const chip = useUIStore((s) => s.pluginRailChip);
  const setChip = useUIStore((s) => s.setPluginRailChip);
  const jumpNonce = useUIStore((s) => s.pluginRailJumpToMissingNonce);

  const all = useMemo(
    () => buildDisplayGroups(summary, registry),
    [summary, registry],
  );
  const visible = useMemo(
    () => applyFilters(all, filter, chip),
    [all, filter, chip],
  );

  const listRef = useRef<HTMLUListElement | null>(null);

  // Compatibility pill jump: when the nonce bumps, find the first row
  // with data-status='missing', scroll it into view, and toggle a
  // transient highlight class. The CSS animation runs once and ends —
  // no JS timer to clean up. Skip the initial mount (nonce 0) so the
  // rail doesn't auto-scroll on every project load.
  useEffect(() => {
    if (jumpNonce === 0) return;
    const list = listRef.current;
    if (list === null) return;
    const target = list.querySelector<HTMLElement>(
      'li[data-status="missing"]',
    );
    if (target === null) return;
    target.scrollIntoView({ behavior: "smooth", block: "nearest" });
    target.setAttribute("data-highlight", "true");
    // The CSS animation is 2s; clear the attribute slightly later so a
    // second jump can re-trigger it (CSS animations don't restart on
    // attribute set unless removed first).
    const t = window.setTimeout(() => {
      target.removeAttribute("data-highlight");
    }, 2200);
    return () => window.clearTimeout(t);
  }, [jumpNonce]);

  return (
    <section aria-label="plug-ins" className={styles.section}>
      <div className={styles.header}>
        <h3 className={sectionStyles.sectionLabel}>Plug-ins</h3>
        <span className={styles.count}>
          {visible.length === all.length
            ? `${all.length}`
            : `${visible.length} / ${all.length}`}
        </span>
      </div>
      <input
        type="search"
        role="searchbox"
        aria-label="Search plug-ins"
        placeholder="Search plug-ins…"
        value={filter}
        className={styles.search}
        onChange={(e) => setFilter(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setFilter("");
        }}
      />
      <div className={styles.chips} role="group" aria-label="filter plug-ins">
        {CHIPS.map((c) => (
          <button
            key={c.id}
            type="button"
            data-active={chip === c.id}
            className={styles.chip}
            onClick={() => setChip(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>
      <PluginRailBody all={all} visible={visible} listRef={listRef} />
    </section>
  );
}

interface BodyProps {
  readonly all: ReadonlyArray<DisplayGroup>;
  readonly visible: ReadonlyArray<DisplayGroup>;
  readonly listRef: React.RefObject<HTMLUListElement | null>;
}

function PluginRailBody({ all, visible, listRef }: BodyProps) {
  if (all.length === 0) {
    return <p className={sectionStyles.placeholder}>No plug-ins detected.</p>;
  }
  if (visible.length === 0) {
    return <p className={sectionStyles.placeholder}>No matches.</p>;
  }
  return (
    <ul ref={listRef} className={styles.list}>
      {visible.map((g) => (
        <PluginRow key={g.group.fingerprint} group={g} />
      ))}
    </ul>
  );
}

interface RowProps {
  readonly group: DisplayGroup;
}

function PluginRow({ group }: RowProps) {
  const { displayName, hasRegistryEntry, status } = group;
  return (
    <li
      className={styles.row}
      data-fingerprint={group.group.fingerprint}
      data-status={status}
    >
      <span className={styles.name}>{displayName}</span>
      {hasRegistryEntry && (
        <span className={styles.fingerprint}>{group.group.fingerprint}</span>
      )}
      {group.group.count > 1 && (
        <span className={styles.countBadge}>×{group.group.count}</span>
      )}
      {status !== "unknown" && (
        <span data-status={status} className={styles.installBadge}>
          {INSTALL_LABEL[status]}
        </span>
      )}
    </li>
  );
}
