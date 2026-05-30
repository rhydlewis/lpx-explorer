import { describe, expect, it } from "vitest";

import { makeSummary } from "../test/fixtures";
import type { AuRegistry, Alternative } from "./types";
import {
  buildProjectReadme,
  readmeInputFromProject,
  type ReadmeInput,
} from "./export-readme";

function makeInput(overrides: Partial<ReadmeInput> = {}): ReadmeInput {
  return {
    projectName: "new idea",
    logicVersion: "Logic Pro 12.2 (6644)",
    bpm: 125,
    sampleRateHz: 44100,
    frameRateIndex: 1, // 25 fps
    alternatives: ["new idea", "new idea - alt 1"],
    currentAlternative: "new idea - alt 1",
    thirdPartyPlugins: ["FabFilter Pro-Q 3", "Serum"],
    ...overrides,
  };
}

describe("buildProjectReadme", () => {
  it("puts the project name first and a stats line with BPM, sample rate, frame rate", () => {
    const text = buildProjectReadme(makeInput());
    const lines = text.split("\n");

    expect(lines[0]).toBe("new idea");
    expect(lines[1]).toMatch(/Logic Pro 12\.2 \(6644\)/);
    expect(lines[1]).toMatch(/125\.0 BPM/);
    expect(lines[1]).toMatch(/44\.1 kHz/);
    expect(lines[1]).toMatch(/25 fps/);
  });

  it("omits the Logic version cleanly when it's unknown", () => {
    const text = buildProjectReadme(makeInput({ logicVersion: null }));
    expect(text).not.toContain("Logic Pro");
    // The other header fields still render.
    expect(text).toMatch(/125\.0 BPM/);
  });

  it("omits unknown header fields cleanly (no '—', no empty stats line)", () => {
    const text = buildProjectReadme(
      makeInput({ bpm: 0, sampleRateHz: 0, frameRateIndex: 99 }),
    );
    const lines = text.split("\n");

    // Name still present; no dangling stats line full of unknowns.
    expect(lines[0]).toBe("new idea");
    expect(text).not.toContain("BPM");
    expect(text).not.toContain("kHz");
    expect(text).not.toContain("fps");
    expect(text).not.toContain("—");
  });

  it("lists every alternative under a 'Project Alternatives' section", () => {
    const text = buildProjectReadme(makeInput());

    expect(text).toContain("Project Alternatives:");
    expect(text).toContain("new idea - alt 1");
    // both variants present
    const altSection = text.split("Project Alternatives:")[1];
    expect(altSection).toContain("new idea");
    expect(altSection).toContain("new idea - alt 1");
  });

  it("names the current alternative in its own section", () => {
    const text = buildProjectReadme(makeInput());
    const lines = text.split("\n");
    const idx = lines.findIndex((l) => l.startsWith("Current Alternative:"));
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(lines.slice(idx).join("\n")).toContain("new idea - alt 1");
  });

  it("lists 3rd-party plug-ins sorted, under a '3rd-Party Plug-ins' section", () => {
    const text = buildProjectReadme(makeInput());
    const section = text.split("3rd-Party Plug-ins:")[1];
    expect(section).toBeDefined();
    // Sorted alphabetically: FabFilter before Serum.
    expect(section.indexOf("FabFilter Pro-Q 3")).toBeLessThan(
      section.indexOf("Serum"),
    );
  });

  it("shows '(none)' when there are no 3rd-party plug-ins", () => {
    const text = buildProjectReadme(makeInput({ thirdPartyPlugins: [] }));
    const section = text.split("3rd-Party Plug-ins:")[1];
    expect(section).toMatch(/\(none\)/);
  });
});

describe("readmeInputFromProject", () => {
  function alt(index: number, name: string, isActive: boolean): Alternative {
    return {
      index,
      display_name: name,
      is_active: isActive,
      window_image_path: null,
      last_saved_unix: 0,
    };
  }

  it("derives the project name, metadata, alternatives and current variant", () => {
    const input = readmeInputFromProject({
      path: "/Music/Logic/song.logicx",
      summary: makeSummary({
        metadata: { bpm: 90, sample_rate: 48000, frame_rate_index: 5 },
      }),
      alternatives: [alt(0, "mix a", false), alt(1, "mix b", true)],
      activeVariantIndex: 1,
      registry: null,
      lastSavedFrom: "Logic Pro 12.2 (6644)",
    });

    expect(input.projectName).toBe("song");
    expect(input.logicVersion).toBe("Logic Pro 12.2 (6644)");
    expect(input.bpm).toBe(90);
    expect(input.sampleRateHz).toBe(48000);
    expect(input.frameRateIndex).toBe(5);
    expect(input.alternatives).toEqual(["mix a", "mix b"]);
    expect(input.currentAlternative).toBe("mix b");
  });

  it("counts only non-Apple AUs as 3rd-party, naming them via the registry", () => {
    // Apple stock carries a parser display_name → excluded. 3rd-party
    // AUs have no display_name → named from the auval registry, or the
    // raw fingerprint when the registry doesn't know them.
    const registry: AuRegistry = {
      scanned_at_unix: 0,
      entries: [
        {
          fingerprint: "aumf/Srm1/Xfer",
          type_4cc: "aumf",
          subtype_4cc: "Srm1",
          manufacturer_4cc: "Xfer",
          name: "Serum",
        },
      ],
    };

    const input = readmeInputFromProject({
      path: "/x/song.logicx",
      summary: makeSummary({
        fingerprints: [
          // Apple stock — excluded.
          {
            type_code: "aumu",
            subtype: "Vint",
            manufacturer: "appl",
            offset: 1,
            display_name: "Vintage Electric Piano",
          },
          // 3rd-party, known to the registry → "Serum".
          { type_code: "aumf", subtype: "Srm1", manufacturer: "Xfer", offset: 2 },
          // 3rd-party, unknown to the registry → raw fingerprint.
          { type_code: "aufx", subtype: "PrQ3", manufacturer: "FabF", offset: 3 },
        ],
      }),
      alternatives: [alt(0, "song", true)],
      activeVariantIndex: 0,
      registry,
      lastSavedFrom: null,
    });

    expect(input.thirdPartyPlugins).toContain("Serum");
    expect(input.thirdPartyPlugins).toContain("aufx/PrQ3/FabF");
    expect(input.thirdPartyPlugins).not.toContain("Vintage Electric Piano");
  });
});
