import { useMemo } from "react";

import { groupFingerprints, installStatusOf, type FingerprintGroup, type InstallStatus } from "../../lib/au-utils";
import type { AuRegistry, ProjectSummary } from "../../lib/types";
import { useAuRegistryStore } from "../../store/au-registry-store";

import styles from "./Inspector.module.css";

interface Props {
  readonly summary: ProjectSummary;
}

const INSTALL_LABEL: Record<Exclude<InstallStatus, "unknown">, string> = {
  installed: "Installed",
  missing: "Missing on this Mac",
};

function loadedRegistry(status: ReturnType<typeof useAuRegistryStore.getState>["status"]): AuRegistry | null {
  return status.kind === "loaded" ? status.registry : null;
}

export function PluginList({ summary }: Props) {
  const registry = useAuRegistryStore((s) => loadedRegistry(s.status));
  const groups = useMemo(
    () => groupFingerprints(summary.fingerprints),
    [summary.fingerprints],
  );

  const totalCount = summary.fingerprints.length;

  return (
    <section aria-label="plug-ins" className={styles.section}>
      <h3 className={styles.sectionLabel}>Plug-ins</h3>
      {totalCount === 0 ? (
        <p className={styles.placeholder}>No plug-ins detected.</p>
      ) : (
        <>
          <p>
            {totalCount} plug-in{totalCount === 1 ? "" : "s"}
          </p>
          <ul className={styles.pluginList}>
            {groups.map((group) => (
              <PluginRow key={group.fingerprint} group={group} registry={registry} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

interface RowProps {
  readonly group: FingerprintGroup;
  readonly registry: AuRegistry | null;
}

function PluginRow({ group, registry }: RowProps) {
  const status = installStatusOf(group.fingerprint, registry);
  const entry = registry?.entries.find((e) => e.fingerprint === group.fingerprint);
  const displayName = entry?.name ?? group.fingerprint;
  const showFingerprintAside = entry !== undefined;

  return (
    <li className={styles.pluginRow}>
      <span className={styles.pluginName}>{displayName}</span>
      {showFingerprintAside && (
        <span className={styles.pluginFingerprint}>{group.fingerprint}</span>
      )}
      {group.count > 1 && (
        <span className={styles.countBadge}>×{group.count}</span>
      )}
      {status !== "unknown" && (
        <span data-status={status} className={styles.installBadge}>
          {INSTALL_LABEL[status]}
        </span>
      )}
    </li>
  );
}
