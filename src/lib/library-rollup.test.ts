import { describe, expect, it } from "vitest";

import { aggregateLibrary } from "./library-rollup";
import type { AURef, ProjectSummary } from "./types";
import { makeSummary } from "../test/fixtures";

function ref(
  type: string,
  subtype: string,
  manufacturer: string,
  offset = 0,
  display_name?: string,
): AURef {
  return { type_code: type, subtype, manufacturer, offset, display_name };
}

function summaryWith(fingerprints: ReadonlyArray<AURef>): ProjectSummary {
  return makeSummary({ fingerprints: [...fingerprints] });
}

describe("aggregateLibrary", () => {
  it("returns an empty array for an empty input map", () => {
    expect(aggregateLibrary(new Map())).toEqual([]);
  });

  it("rolls up one project's distinct fingerprints into one row each", () => {
    const summaries = new Map<string, ProjectSummary>([
      [
        "/a.logicx",
        summaryWith([
          ref("aufx", "Comp", "Yamh", 1),
          ref("aumu", "EZk2", "Toon", 2),
        ]),
      ],
    ]);

    const rolled = aggregateLibrary(summaries);

    expect(rolled).toHaveLength(2);
    const compRow = rolled.find((r) => r.fingerprint === "aufx/Comp/Yamh");
    expect(compRow).toBeDefined();
    expect(compRow?.projectCount).toBe(1);
    expect(compRow?.totalInstanceCount).toBe(1);
    expect(compRow?.projectPaths).toEqual(["/a.logicx"]);
  });

  it("aggregates the same fingerprint across multiple projects", () => {
    const summaries = new Map<string, ProjectSummary>([
      ["/a.logicx", summaryWith([ref("aumu", "EZk2", "Toon", 1)])],
      ["/b.logicx", summaryWith([ref("aumu", "EZk2", "Toon", 2)])],
      ["/c.logicx", summaryWith([ref("aumu", "EZk2", "Toon", 3)])],
    ]);

    const rolled = aggregateLibrary(summaries);

    expect(rolled).toHaveLength(1);
    expect(rolled[0].fingerprint).toBe("aumu/EZk2/Toon");
    expect(rolled[0].projectCount).toBe(3);
    expect(rolled[0].totalInstanceCount).toBe(3);
    expect(
      rolled[0].projectPaths.slice().sort((p, q) => p.localeCompare(q)),
    ).toEqual(["/a.logicx", "/b.logicx", "/c.logicx"]);
  });

  it("counts duplicate fingerprints within one project as instances, not extra projects", () => {
    // Project /a has the same plug-in twice (e.g. Compressor on two
    // tracks). projectCount=1; totalInstanceCount=2.
    const summaries = new Map<string, ProjectSummary>([
      [
        "/a.logicx",
        summaryWith([
          ref("aufx", "Comp", "Yamh", 1),
          ref("aufx", "Comp", "Yamh", 2),
        ]),
      ],
    ]);

    const rolled = aggregateLibrary(summaries);

    expect(rolled).toHaveLength(1);
    expect(rolled[0].projectCount).toBe(1);
    expect(rolled[0].totalInstanceCount).toBe(2);
  });

  it("preserves display_name from the first AURef that carries it", () => {
    const summaries = new Map<string, ProjectSummary>([
      [
        "/a.logicx",
        summaryWith([ref("aufx", "comp", "appl", 1, "Compressor")]),
      ],
      [
        "/b.logicx",
        // Same synthesised fingerprint but no display_name on this one
        summaryWith([ref("aufx", "comp", "appl", 2)]),
      ],
    ]);

    const rolled = aggregateLibrary(summaries);

    expect(rolled).toHaveLength(1);
    expect(rolled[0].displayName).toBe("Compressor");
  });

  it("returns rows sorted by descending projectCount then by fingerprint", () => {
    const summaries = new Map<string, ProjectSummary>([
      [
        "/a.logicx",
        summaryWith([
          ref("aufx", "Comp", "Yamh", 1), // in 2 projects
          ref("aumu", "EZk2", "Toon", 2), // in 1 project
        ]),
      ],
      ["/b.logicx", summaryWith([ref("aufx", "Comp", "Yamh", 1)])],
    ]);

    const rolled = aggregateLibrary(summaries);

    expect(rolled.map((r) => r.fingerprint)).toEqual([
      "aufx/Comp/Yamh",
      "aumu/EZk2/Toon",
    ]);
  });

  it("dedupes project paths if the same path appears twice (defensive)", () => {
    // Should never happen in practice, but be defensive — caller might
    // mistakenly pass overlapping paths.
    const summaries = new Map<string, ProjectSummary>([
      ["/a.logicx", summaryWith([ref("aumu", "EZk2", "Toon", 1)])],
    ]);

    const rolled = aggregateLibrary(summaries);

    expect(rolled[0].projectPaths).toEqual(["/a.logicx"]);
  });
});
