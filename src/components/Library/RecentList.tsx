import { openProject } from "../../lib/open-project";
import { useLibraryStore } from "../../store/library-store";
import { useProjectStore } from "../../store/project-store";

import { ProjectRow } from "./ProjectRow";

import styles from "./Library.module.css";

export function RecentList() {
  const recent = useLibraryStore((s) => s.recent);
  const query = useLibraryStore((s) => s.query);
  const selectedPath = useProjectStore((s) =>
    s.current.kind === "idle" ? undefined : s.current.path,
  );

  const visible = filterByQuery(recent, query);

  if (visible.length === 0) {
    return null;
  }

  return (
    <section className={styles.section}>
      <h3 className={styles.sectionLabel}>Recent</h3>
      <ul className={styles.list}>
        {visible.map((entry) => (
          <li key={entry.path}>
            <ProjectRow
              name={entry.name}
              path={entry.path}
              status="neutral"
              selected={entry.path === selectedPath}
              onSelect={() => {
                void openProject(entry.path);
              }}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function filterByQuery<T extends { name: string }>(
  entries: ReadonlyArray<T>,
  query: string,
): ReadonlyArray<T> {
  if (query.trim() === "") {
    return entries;
  }
  const needle = query.toLowerCase();
  return entries.filter((e) => e.name.toLowerCase().includes(needle));
}
