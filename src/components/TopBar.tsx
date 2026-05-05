import styles from "./TopBar.module.css";

interface Props {
  readonly projectName?: string;
}

/**
 * Tower-style minimal title bar. Shows the selected project name when one is
 * loaded; otherwise shows the app name. macOS traffic-light buttons sit on
 * top of this strip — CSS reserves space for them on the left.
 */
export function TopBar({ projectName }: Props) {
  const className = projectName === undefined
    ? `${styles.title} ${styles.appName}`
    : styles.title;
  return <h1 className={className}>{projectName ?? "LPX Explorer"}</h1>;
}
