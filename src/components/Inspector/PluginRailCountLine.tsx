import styles from "./PluginRail.module.css";

interface Props {
  readonly visible: number;
  readonly total: number;
  readonly missing: number;
  readonly categorised: number;
}

/**
 * One-line summary above the search input. Visible/total reflects
 * filter state; missing surfaces only when > 0 (calm by default).
 * The 'categorised' segment (lpx-explorer-uqg) renders only when the
 * static fine-category map doesn't cover everything — the line is
 * there to surface gaps, not to decorate the rail.
 */
export function PluginRailCountLine({
  visible,
  total,
  missing,
  categorised,
}: Props) {
  const plural = total === 1 ? "" : "s";
  const headline =
    visible !== total ? `${visible} of ${total}` : `${total} plug-in${plural}`;
  const showCategorised = total > 0 && categorised < total;
  return (
    <p className={styles.countLine}>
      {headline}
      {missing > 0 && (
        <span className={styles.countMissing}>
          {" · "}
          {missing} missing
        </span>
      )}
      {showCategorised && (
        <span className={styles.countCategorised}>
          {" · "}
          {categorised} of {total} categorised
        </span>
      )}
    </p>
  );
}
