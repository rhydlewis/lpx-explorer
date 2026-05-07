import { describe, expect, it } from "vitest";

import type { AURef } from "../../lib/types";
import { makeSummary } from "../../test/fixtures";

import {
  applyFilters,
  buildDisplayGroups,
  fineCategoryFacets,
} from "./plugin-rail-groups";

function ref(overrides: Partial<AURef> = {}): AURef {
  return {
    type_code: "aufx",
    subtype: "xxxx",
    manufacturer: "yyyy",
    offset: 0,
    ...overrides,
  };
}

describe("plugin-rail-groups — fine categorisation (lpx-explorer-uqg)", () => {
  it("buildDisplayGroups attaches a fine category to each row", () => {
    const summary = makeSummary({
      fingerprints: [
        ref({
          type_code: "aufx",
          subtype: "Comp",
          manufacturer: "appl",
          display_name: "Compressor",
        }),
        ref({
          type_code: "aufx",
          subtype: "spcd",
          manufacturer: "appl",
          display_name: "Space Designer",
        }),
        ref({
          type_code: "aufx",
          subtype: "xxxx",
          manufacturer: "yyyy",
          display_name: "Some Unknown FX",
        }),
      ],
    });

    const groups = buildDisplayGroups(summary, null);

    const byName = new Map(groups.map((g) => [g.displayName, g.fineCategory]));
    expect(byName.get("Compressor")).toBe("Dynamics");
    expect(byName.get("Space Designer")).toBe("Reverb");
    expect(byName.get("Some Unknown FX")).toBe("Uncategorised");
  });

  it("fineCategoryFacets aggregates and sorts (descending count, Uncategorised last)", () => {
    const summary = makeSummary({
      fingerprints: [
        ref({ subtype: "Comp", manufacturer: "appl", display_name: "Compressor" }),
        ref({ subtype: "Limr", manufacturer: "appl", display_name: "Limiter" }),
        ref({ subtype: "spcd", manufacturer: "appl", display_name: "Space Designer" }),
        ref({ subtype: "xxxx", display_name: "Mystery FX" }),
      ],
    });

    const facets = fineCategoryFacets(buildDisplayGroups(summary, null));

    const ordered = facets.map((f) => f.category);
    expect(ordered[0]).toBe("Dynamics"); // count 2 — biggest first
    expect(ordered[ordered.length - 1]).toBe("Uncategorised");
    expect(facets.find((f) => f.category === "Dynamics")?.count).toBe(2);
  });

  it("applyFilters narrows to a chosen fine category", () => {
    const summary = makeSummary({
      fingerprints: [
        ref({ subtype: "Comp", manufacturer: "appl", display_name: "Compressor" }),
        ref({ subtype: "spcd", manufacturer: "appl", display_name: "Space Designer" }),
      ],
    });
    const groups = buildDisplayGroups(summary, null);

    const onlyReverb = applyFilters(groups, "", "all", "Reverb");

    expect(onlyReverb.map((g) => g.displayName)).toEqual(["Space Designer"]);
  });

  it("applyFilters with null category preserves the existing behaviour", () => {
    const summary = makeSummary({
      fingerprints: [
        ref({ subtype: "Comp", manufacturer: "appl", display_name: "Compressor" }),
        ref({ subtype: "spcd", manufacturer: "appl", display_name: "Space Designer" }),
      ],
    });
    const groups = buildDisplayGroups(summary, null);

    const all = applyFilters(groups, "", "all", null);

    expect(all.length).toBe(2);
  });
});
