import type { ReactNode } from "react";

import styles from "./AppShell.module.css";

interface Props {
  readonly topBar?: ReactNode;
  /** Left rail — Logic library / recents / folders. */
  readonly rail?: ReactNode;
  /**
   * Right rail — per-project plug-in panel. Optional so the empty state
   * (no project loaded) can render without it. Aria-labelled "plug-ins"
   * to match the existing Inspector terminology.
   */
  readonly rightRail?: ReactNode;
  readonly main?: ReactNode;
}

/**
 * Top-level layout grid: topbar across the top, optional rails flanking
 * the main pane. Aria-labels use Logic Pro terminology — left rail is the
 * "library", right rail is "plug-ins".
 */
export function AppShell({ topBar, rail, main, rightRail }: Props) {
  const hasRail = rail !== undefined;
  const hasRightRail = rightRail !== undefined;
  const classes = [styles.shell];
  if (!hasRail) classes.push(styles.noRail);
  if (hasRightRail) classes.push(styles.withRightRail);
  return (
    <div className={classes.join(" ")}>
      {topBar !== undefined && <div className={styles.topbar}>{topBar}</div>}
      {hasRail && (
        <aside aria-label="library" className={styles.rail}>
          {rail}
        </aside>
      )}
      <main className={styles.main}>{main}</main>
      {hasRightRail && (
        <aside aria-label="plug-ins" className={styles.rightRail}>
          {rightRail}
        </aside>
      )}
    </div>
  );
}
