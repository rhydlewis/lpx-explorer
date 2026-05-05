import { StatusDot, type StatusKind } from "../StatusDot";

import styles from "./ProjectRow.module.css";

interface Props {
  readonly name: string;
  readonly path: string;
  readonly status: StatusKind;
  readonly selected?: boolean;
  readonly onSelect: () => void;
}

export function ProjectRow({ name, path, status, selected, onSelect }: Props) {
  return (
    <button
      type="button"
      className={styles.row}
      data-rail-row="true"
      aria-current={selected ? "true" : undefined}
      title={path}
      onClick={onSelect}
    >
      <StatusDot status={status} />
      <span className={styles.text}>
        <span className={styles.name}>{name}</span>
        <span className={styles.path}>{path}</span>
      </span>
    </button>
  );
}
