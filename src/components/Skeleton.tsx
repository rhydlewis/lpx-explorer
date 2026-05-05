import type { CSSProperties } from "react";

import styles from "./Skeleton.module.css";

interface Props {
  /** CSS width — number is treated as px, string passed through. */
  readonly width?: number | string;
  /** CSS height — number is treated as px, string passed through. */
  readonly height?: number | string;
  /** Optional inline-style overrides (e.g. margin between rows). */
  readonly style?: CSSProperties;
}

/**
 * Block-shaped pulsing placeholder. Matches the final row geometry of
 * the content it stands in for. `prefers-reduced-motion` disables the
 * shimmer.
 */
export function Skeleton({ width, height = 14, style }: Props) {
  const merged: CSSProperties = {
    width: typeof width === "number" ? `${width}px` : width ?? "100%",
    height: typeof height === "number" ? `${height}px` : height,
    ...style,
  };
  return (
    <span aria-hidden="true" className={styles.skeleton} style={merged} />
  );
}
