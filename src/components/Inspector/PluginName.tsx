import styles from "./PluginRail.module.css";

interface Props {
  readonly displayName: string;
  readonly expanded: boolean;
  readonly onToggle: () => void;
}

/**
 * Plug-in name cell for the rail (lpx-explorer-9ll). The rail is narrow
 * and names run long — "Universal Audio (UADx): UADx Century Tube
 * Channel Strip" — so the name is clipped to one line by default and
 * unclamps to wrap in full when activated. Two names sharing a prefix
 * are otherwise indistinguishable.
 *
 * A real `<button>` rather than a hover-only tooltip so the full name is
 * reachable by keyboard; `title` gives pointer users the cheap path
 * without expanding. Clicks are stopped from bubbling because library
 * rows put this inside a row with its own click behaviour.
 *
 * Controlled rather than self-contained: the row uses the same expanded
 * flag to reveal the copy/search actions, so one click both reveals the
 * full name and offers to copy it.
 */
export function PluginName({ displayName, expanded, onToggle }: Props) {
  return (
    <button
      type="button"
      className={styles.name}
      data-expanded={expanded}
      aria-expanded={expanded}
      title={displayName}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      {displayName}
    </button>
  );
}
