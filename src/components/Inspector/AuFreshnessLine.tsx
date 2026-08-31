import { formatRelative } from "../../lib/time-utils";
import {
  useAuRegistryStore,
  type RegistryStatus,
} from "../../store/au-registry-store";

import styles from "./PluginRail.module.css";

interface Props {
  readonly status: RegistryStatus;
  readonly rescanning: boolean;
  readonly rescanError: string | null;
  readonly onRescan: () => void;
}

/**
 * Freshness footnote + manual refresh for the AU registry
 * (lpx-explorer-kw0). Two jobs, both absent before:
 *
 *  - make staleness *visible* — every "Missing on this Mac" badge in
 *    the rail is only as true as the last `auval -l`, so say when that
 *    was
 *  - give the user a way out. The registry auto-refreshes when a
 *    plug-in folder changes, but an installer that rewrites a bundle
 *    in place leaves no trace, and the user should never be stuck with
 *    a verdict they can see is wrong.
 *
 * Renders nothing unless a registry is loaded: `absent` / `scanning` /
 * `error` are already spelled out by `<CompatibilityVerdict />`, and
 * two components saying the same thing is noise.
 */
export function AuFreshnessLine({
  status,
  rescanning,
  rescanError,
  onRescan,
}: Props) {
  if (status.kind !== "loaded") {
    return null;
  }
  return (
    <p className={styles.freshnessLine}>
      <span>
        {rescanning
          ? "Rechecking your AUs…"
          : `Checked ${formatRelative(status.registry.scanned_at_unix)}`}
      </span>
      <button
        type="button"
        className={styles.freshnessButton}
        onClick={onRescan}
        disabled={rescanning}
        title="Re-read the Audio Units installed on this Mac"
      >
        Rescan
      </button>
      {rescanError !== null && (
        <span className={styles.freshnessError}>
          Couldn&apos;t recheck — {rescanError}
        </span>
      )}
    </p>
  );
}

/**
 * Store-connected wrapper. Split from the pure line the same way
 * `<CompatibilityVerdict />` splits from its body — keeps the rendering
 * rules unit-testable without a store, and keeps `<PluginRail />` to a
 * single line.
 */
export function AuFreshness() {
  const status = useAuRegistryStore((s) => s.status);
  const rescanning = useAuRegistryStore((s) => s.rescanning);
  const rescanError = useAuRegistryStore((s) => s.rescanError);
  const rescan = useAuRegistryStore((s) => s.rescan);

  return (
    <AuFreshnessLine
      status={status}
      rescanning={rescanning}
      rescanError={rescanError}
      onRescan={() => void rescan()}
    />
  );
}
