import type { ReactNode } from "react";

import styles from "./AppShell.module.css";

interface Props {
  readonly topBar?: ReactNode;
  readonly rail?: ReactNode;
  readonly main?: ReactNode;
}

/**
 * Top-level layout grid: topbar across the top, rail on the left, main on the
 * right. Rail collapses out when omitted (e.g. first-launch empty state).
 *
 * Aria-labels use Logic Pro terminology — the rail is the "library".
 */
export function AppShell({ topBar, rail, main }: Props) {
  const hasRail = rail !== undefined;
  const className = hasRail ? styles.shell : `${styles.shell} ${styles.noRail}`;
  return (
    <div className={className}>
      {topBar !== undefined && <div className={styles.topbar}>{topBar}</div>}
      {hasRail && (
        <aside aria-label="library" className={styles.rail}>
          {rail}
        </aside>
      )}
      <main className={styles.main}>{main}</main>
    </div>
  );
}
