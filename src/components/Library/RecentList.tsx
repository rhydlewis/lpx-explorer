import { useLibraryStore } from "../../store/library-store";
import { useProjectStore } from "../../store/project-store";

import { ProjectRow } from "./ProjectRow";

import styles from "./Library.module.css";

export function RecentList() {
  const recent = useLibraryStore((s) => s.recent);
  const selectedPath = useProjectStore((s) =>
    s.current.kind === "idle" ? undefined : s.current.path,
  );

  if (recent.length === 0) {
    return null;
  }

  return (
    <section className={styles.section}>
      <h3 className={styles.sectionLabel}>Recent</h3>
      <ul className={styles.list}>
        {recent.map((entry) => (
          <li key={entry.path}>
            <ProjectRow
              name={entry.name}
              path={entry.path}
              status="neutral"
              selected={entry.path === selectedPath}
              onSelect={() => {
                void useProjectStore.getState().select(entry.path);
              }}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
