import styles from "./ProjectHeader.module.css";

interface Props {
  readonly path: string;
}

function projectNameOf(path: string): string {
  const trimmed = path.endsWith("/") ? path.slice(0, -1) : path;
  const segments = trimmed.split("/").filter(Boolean);
  const last = segments[segments.length - 1] ?? trimmed;
  return last.replace(/\.logicx$/i, "");
}

function trimmedPath(path: string): string {
  return path.endsWith("/") ? path.slice(0, -1) : path;
}

export function ProjectHeader({ path }: Props) {
  return (
    <section aria-label="project" className={styles.header}>
      <h2 className={styles.name} title={trimmedPath(path)}>
        {projectNameOf(path)}
      </h2>
      <p className={styles.path} title={trimmedPath(path)}>
        {trimmedPath(path)}
      </p>
    </section>
  );
}
