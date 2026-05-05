import type { AURef, ProjectSummary } from "../../lib/types";

import styles from "./Inspector.module.css";

interface Props {
  readonly summary: ProjectSummary;
}

function fingerprintOf(au: AURef): string {
  return `${au.type_code}/${au.subtype}/${au.manufacturer}`;
}

export function PluginList({ summary }: Props) {
  const { fingerprints } = summary;
  const count = fingerprints.length;
  return (
    <section aria-label="plug-ins" className={styles.section}>
      <h3 className={styles.sectionLabel}>Plug-ins</h3>
      {count === 0 ? (
        <p className={styles.placeholder}>No plug-ins detected.</p>
      ) : (
        <>
          <p>
            {count} plug-in{count === 1 ? "" : "s"}
          </p>
          <ul>
            {fingerprints.map((au) => (
              <li key={`${au.offset}:${fingerprintOf(au)}`}>
                {fingerprintOf(au)}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
