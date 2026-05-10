import type { Alternative, ProjectSummary } from "../lib/types";

/**
 * Synthesise a merged ProjectSummary whose `fingerprints` is the
 * union across all variants (lpx-explorer-bpp). The library rollup
 * (aggregateLibrary) only reads fingerprints, so other fields safely
 * take variant 0's values.
 */
export function mergeAcrossVariants(
  variants: ReadonlyArray<ProjectSummary>,
): ProjectSummary {
  const base = variants[0];
  if (variants.length === 1) return base;
  const fingerprints = variants.flatMap((v) => v.fingerprints);
  return { ...base, fingerprints };
}

export interface AlternativeLite {
  readonly index: number;
  readonly is_active: boolean;
  readonly display_name: string;
}

/**
 * Strict subset of the data needed to fold variants into a merged
 * summary — keeps the store's signature narrow.
 */
export type AlternativeForMerge = Pick<
  Alternative,
  "index" | "is_active" | "display_name"
>;
