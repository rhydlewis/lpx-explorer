import type { AuFineCategory } from "../../lib/au-categories";

import type { FineCategoryFacet } from "./plugin-rail-groups";

import styles from "./PluginRail.module.css";

interface Props {
  readonly facets: ReadonlyArray<FineCategoryFacet>;
  readonly active: AuFineCategory | null;
  readonly onSelect: (category: AuFineCategory | null) => void;
}

/**
 * Adaptive facet row for the right rail (lpx-explorer-uqg). Renders
 * one chip per fine-category present in the current data set, with
 * the row count as a trailing number. Hidden when there's only one
 * category — the chip row would just show the same total as the
 * existing count line.
 */
export function PluginRailFacetRow({ facets, active, onSelect }: Props) {
  if (facets.length <= 1) return null;
  return (
    <div className={styles.chips} role="group" aria-label="filter by category">
      {facets.map((f) => (
        <button
          key={f.category}
          type="button"
          data-active={active === f.category}
          className={styles.chip}
          onClick={() => onSelect(active === f.category ? null : f.category)}
        >
          {f.category} {f.count}
        </button>
      ))}
    </div>
  );
}
