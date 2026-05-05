import styles from "./StatusDot.module.css";

export type StatusKind = "clean" | "warn" | "fail" | "neutral";

interface Props {
  readonly status: StatusKind;
}

/**
 * 12px coloured dot used in the rail (per project) and inside the
 * compatibility verdict pill. Decorative — accessible status text is the
 * pill's job, not the dot's.
 */
export function StatusDot({ status }: Props) {
  return <span aria-hidden="true" data-status={status} className={styles.dot} />;
}
