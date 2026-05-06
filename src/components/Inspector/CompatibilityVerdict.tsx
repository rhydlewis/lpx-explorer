import type { AURef } from "../../lib/types";
import { installStatusOf } from "../../lib/au-utils";
import { useAuRegistryStore, type RegistryStatus } from "../../store/au-registry-store";
import { useProjectStore } from "../../store/project-store";
import { useUIStore } from "../../store/ui-store";

import styles from "./CompatibilityVerdict.module.css";

type Verdict = "clean" | "warnings" | "will-not-open" | "unknown";

interface VerdictView {
  readonly status: Verdict;
  readonly headline: string;
  readonly summary: string | undefined;
  readonly missing: number;
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
    if (installStatusOf(fingerprint, registryStatus.registry) === "installed") {
      return false;
    }
    // Apple stock plug-ins (parser sets `display_name` for these) ship
    // with Logic and are guaranteed installed on a Mac that has Logic.
    // Known stock plug-ins now carry their real auval fingerprint and
    // match the registry above; this branch catches the residual unknown
    // ones whose synthesised fingerprint won't match.
    return ref.display_name === undefined;
  }).length;
}

function renderVerdict(
  fingerprints: ReadonlyArray<AURef>,
  registryStatus: RegistryStatus,
): VerdictView {
  if (registryStatus.kind !== "loaded") {
    return {
      status: "unknown",
      headline: "Haven't checked your AUs yet",
      summary: undefined,
      missing: 0,
    };
  }
  if (fingerprints.length === 0) {
    return {
      status: "clean",
      headline: "Opens cleanly",
      summary: "No plug-ins to check.",
      missing: 0,
    };
  }
  const missing = countMissing(fingerprints, registryStatus);
  if (missing === 0) {
    return {
      status: "clean",
      headline: "Opens cleanly",
      summary: `All ${fingerprints.length} plug-in${fingerprints.length === 1 ? "" : "s"} installed on this Mac.`,
      missing: 0,
    };
  }
  if (missing === fingerprints.length) {
    return {
      status: "will-not-open",
      headline: "Will not open",
      summary: `${missing} of ${fingerprints.length} plug-ins missing on this Mac.`,
      missing,
    };
  }
  return {
    status: "warnings",
    headline: `${missing} plug-in${missing === 1 ? "" : "s"} missing`,
    summary: `${missing} of ${fingerprints.length} plug-ins not installed on this Mac.`,
    missing,
  };
}

export function CompatibilityVerdict() {
  const projectStatus = useProjectStore((s) => s.current);
  const registryStatus = useAuRegistryStore((s) => s.status);
  const runScan = useAuRegistryStore((s) => s.runScan);
  const requestJumpToMissing = useUIStore((s) => s.requestJumpToMissing);

  const fingerprints =
    projectStatus.kind === "loaded" ? projectStatus.summary.fingerprints : [];

  const status = bandStatusOf(registryStatus, fingerprints);

  return (
    <section
      aria-label="compatibility"
      className={styles.band}
      data-status={status}
    >
      <CompatibilityBody
        fingerprints={fingerprints}
        registryStatus={registryStatus}
        onRunScan={() => void runScan()}
        onJumpToMissing={requestJumpToMissing}
      />
    </section>
  );
}

/**
 * Resolve the band's `data-status` (used by CSS for the accent stripe
 * + tint). Mirrors `renderVerdict` but folded down to the four band
 * states the stylesheet cares about.
 */
function bandStatusOf(
  registryStatus: RegistryStatus,
  fingerprints: ReadonlyArray<AURef>,
): Verdict | "scanning" | "error" {
  if (registryStatus.kind === "scanning") {
    return "scanning";
  }
  if (registryStatus.kind === "error") {
    return "error";
  }
  return renderVerdict(fingerprints, registryStatus).status;
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
        Reading your AU library… ({registryStatus.found})
      </p>
    );
  }
  if (registryStatus.kind === "error") {
    return (
      <div className={styles.row}>
        <span className={styles.headline}>AU scan failed</span>
        <span className={styles.errorMessage}>{registryStatus.message}</span>
        <button type="button" className={styles.cta} onClick={onRunScan}>
          Try again
        </button>
      </div>
    );
  }
  if (
    registryStatus.kind === "absent" ||
    registryStatus.kind === "idle" ||
    registryStatus.kind === "loading"
  ) {
    return (
      <div className={styles.row}>
        <span className={styles.headline}>Haven't checked your AUs yet</span>
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
  const hasAction = verdict.status === "warnings" || verdict.status === "will-not-open";

  return (
    <div className={styles.row}>
      <div className={styles.text}>
        <span data-status={verdict.status} className={styles.badge}>
          {verdict.headline}
        </span>
        {verdict.summary !== undefined && (
          <span className={styles.summary}>{verdict.summary}</span>
        )}
      </div>
      {hasAction && (
        <button
          type="button"
          className={styles.cta}
          onClick={onJumpToMissing}
        >
          Show what&apos;s missing
        </button>
      )}
    </div>
  );
}
