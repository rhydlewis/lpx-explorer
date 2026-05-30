import styles from "./MissingManifestBanner.module.css";

interface Props {
  /** True when the bundle has no Resources/ProjectInformation.plist. */
  readonly missing: boolean;
}

/**
 * Non-blocking warning shown at the top of the project view when the
 * bundle is missing `Resources/ProjectInformation.plist`
 * (lpx-explorer-dfg). The project still opens via the synthetic
 * single-variant fallback — this just tells the user the manifest is
 * gone, naming the file so they know exactly what's wrong. `role=status`
 * (polite) keeps it informational rather than interrupting.
 */
export function MissingManifestBanner({ missing }: Props) {
  if (!missing) {
    return null;
  }
  return (
    <div role="status" className={styles.banner}>
      <span className={styles.icon} aria-hidden="true">
        ⚠
      </span>
      <p className={styles.text}>
        This bundle is missing{" "}
        <code className={styles.file}>Resources/ProjectInformation.plist</code>.
        Logic Pro may not be able to open the project.
      </p>
    </div>
  );
}
