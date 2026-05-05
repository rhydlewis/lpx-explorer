import type { ReactNode } from "react";

import styles from "./ErrorCard.module.css";

interface Props {
  /** Human-friendly headline, e.g. "Couldn't open project". */
  readonly headline: string;
  /** Optional one-line subhead — typically the path / target that failed. */
  readonly subhead?: ReactNode;
  /** Technical detail that drops into a collapsible <details> block. */
  readonly detail?: string;
  /** Retry handler. When `undefined`, the button is omitted. */
  readonly onRetry?: () => void;
  /** Override the retry button label (default "Try again"). */
  readonly retryLabel?: string;
}

/**
 * Reusable error card. Used by `<ProjectInspector>` on parse failure and
 * by `<FolderNode>` on scan failure. The container's `role="alert"`
 * announces the headline to screen readers; the technical detail sits
 * in a collapsible `<details>` so it doesn't dominate the layout but
 * stays available for the user's bug report.
 */
export function ErrorCard({
  headline,
  subhead,
  detail,
  onRetry,
  retryLabel = "Try again",
}: Props) {
  return (
    <div role="alert" className={styles.card}>
      <p className={styles.headline}>{headline}</p>
      {subhead !== undefined && <p className={styles.subhead}>{subhead}</p>}
      {detail !== undefined && (
        <details className={styles.details}>
          <summary>Technical details</summary>
          <pre>{detail}</pre>
        </details>
      )}
      {onRetry !== undefined && (
        <button type="button" className={styles.retry} onClick={onRetry}>
          {retryLabel}
        </button>
      )}
    </div>
  );
}
