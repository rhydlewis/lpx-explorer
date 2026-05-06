import type { AURef } from "../../lib/types";
import { installStatusOf } from "../../lib/au-utils";
import { useAuRegistryStore, type RegistryStatus } from "../../store/au-registry-store";
import { useProjectStore } from "../../store/project-store";
import { useUIStore } from "../../store/ui-store";

import sectionStyles from "./Inspector.module.css";
import styles from "./CompatibilityVerdict.module.css";

type Verdict = "clean" | "warnings" | "will-not-open" | "unknown";

interface VerdictView {
  readonly status: Verdict;
  readonly headline: string;
  readonly summary: string | undefined;
}

function countMissing(
  fingerprints: ReadonlyArray<AURef>,
  registryStatus: RegistryStatus,
): number {
  if (registryStatus.kind !== "loaded") {
    return 0;
  }
  return fingerprints.filter((ref) => {
    const fingerprint = `${ref.type_code}/${ref.subtype}/${ref.manufacturer}`;
    return installStatusOf(fingerprint, registryStatus.registry) === "missing";
  }).length;
}

function renderVerdict(
  fingerprints: ReadonlyArray<AURef>,
  registryStatus: RegistryStatus,
): VerdictView {
  if (registryStatus.kind !== "loaded") {
    return { status: "unknown", headline: "AU registry not yet scanned", summary: undefined };
  }
  if (fingerprints.length === 0) {
    return {
      status: "clean",
      headline: "Opens cleanly",
      summary: "No plug-ins to check.",
    };
  }
  const missing = countMissing(fingerprints, registryStatus);
  if (missing === 0) {
    return {
      status: "clean",
      headline: "Opens cleanly",
      summary: `All ${fingerprints.length} plug-in${fingerprints.length === 1 ? "" : "s"} installed on this Mac.`,
    };
  }
  if (missing === fingerprints.length) {
    return {
      status: "will-not-open",
      headline: "Will not open",
      summary: `${missing} of ${fingerprints.length} plug-ins missing on this Mac.`,
    };
  }
  return {
    status: "warnings",
    headline: `${missing} plug-ins missing`,
    summary: `${missing} of ${fingerprints.length} plug-ins not installed on this Mac.`,
  };
}

export function CompatibilityVerdict() {
  const projectStatus = useProjectStore((s) => s.current);
  const registryStatus = useAuRegistryStore((s) => s.status);
  const runScan = useAuRegistryStore((s) => s.runScan);
  const requestJumpToMissing = useUIStore((s) => s.requestJumpToMissing);

  const fingerprints =
    projectStatus.kind === "loaded" ? projectStatus.summary.fingerprints : [];

  return (
    <section aria-label="compatibility" className={sectionStyles.section}>
      <h3 className={sectionStyles.sectionLabel}>Compatibility</h3>
      <CompatibilityBody
        fingerprints={fingerprints}
        registryStatus={registryStatus}
        onRunScan={() => void runScan()}
        onJumpToMissing={requestJumpToMissing}
      />
    </section>
  );
}

interface BodyProps {
  readonly fingerprints: ReadonlyArray<AURef>;
  readonly registryStatus: RegistryStatus;
  readonly onRunScan: () => void;
  readonly onJumpToMissing: () => void;
}

function CompatibilityBody({
  fingerprints,
  registryStatus,
  onRunScan,
  onJumpToMissing,
}: BodyProps) {
  if (registryStatus.kind === "scanning") {
    return (
      <p className={styles.scanning}>
        Scanning installed AUs… ({registryStatus.found})
      </p>
    );
  }
  if (registryStatus.kind === "error") {
    return (
      <div className={styles.row}>
        <span data-status="unknown" className={styles.pill}>
          AU scan failed
        </span>
        <span className={styles.errorMessage}>{registryStatus.message}</span>
        <button type="button" className={styles.cta} onClick={onRunScan}>
          Try again
        </button>
      </div>
    );
  }
  if (registryStatus.kind === "absent" || registryStatus.kind === "idle" || registryStatus.kind === "loading") {
    return (
      <div className={styles.row}>
        <span data-status="unknown" className={styles.pill}>
          AU registry not yet scanned
        </span>
        {registryStatus.kind === "absent" && (
          <button type="button" className={styles.cta} onClick={onRunScan}>
            Run AU scan
          </button>
        )}
      </div>
    );
  }

  // registryStatus.kind === 'loaded'
  const verdict = renderVerdict(fingerprints, registryStatus);
  const isClickable =
    verdict.status === "warnings" || verdict.status === "will-not-open";
  return (
    <>
      {isClickable ? (
        <button
          type="button"
          data-status={verdict.status}
          className={`${styles.pill} ${styles.pillButton}`}
          onClick={onJumpToMissing}
          title="Jump to first missing plug-in"
        >
          {verdict.headline}
        </button>
      ) : (
        <span data-status={verdict.status} className={styles.pill}>
          {verdict.headline}
        </span>
      )}
      {verdict.summary !== undefined && (
        <p className={styles.summary}>{verdict.summary}</p>
      )}
    </>
  );
}
