import { describe, expect, it } from "vitest";

import type { AURef, AuRegistry } from "./types";

import { groupFingerprints, installStatusOf } from "./au-utils";

const registryWith = (...fps: string[]): AuRegistry => ({
  entries: fps.map((fingerprint) => ({
    fingerprint,
    type_4cc: fingerprint.split("/")[0] ?? "",
    subtype_4cc: fingerprint.split("/")[1] ?? "",
    manufacturer_4cc: fingerprint.split("/")[2] ?? "",
    name: fingerprint,
  })),
  scanned_at_unix: 0,
});

const ref = (fingerprint: string, offset: number): AURef => {
  const [type_code = "", subtype = "", manufacturer = ""] = fingerprint.split("/");
  return { type_code, subtype, manufacturer, offset };
};

describe("installStatusOf", () => {
  it("returns 'unknown' when registry is null", () => {
    expect(installStatusOf("aumu/EZk2/Toon", null)).toBe("unknown");
  });

  it("returns 'installed' when the fingerprint is in the registry", () => {
    const registry = registryWith("aumu/EZk2/Toon");

    expect(installStatusOf("aumu/EZk2/Toon", registry)).toBe("installed");
  });

  it("returns 'missing' when the registry exists but the fingerprint is absent", () => {
    const registry = registryWith("aumu/Other/Mfgr");

    expect(installStatusOf("aumu/EZk2/Toon", registry)).toBe("missing");
  });

  it("matches case-sensitively (4CCs are case-significant in Logic)", () => {
    const registry = registryWith("aumu/EZk2/Toon");

    expect(installStatusOf("aumu/ezk2/Toon", registry)).toBe("missing");
  });

  it("preserves trailing-space 4CCs (e.g. 'kHs ' for Kilohearts)", () => {
    const registry = registryWith("aufx/Phsr/kHs ");

    expect(installStatusOf("aufx/Phsr/kHs ", registry)).toBe("installed");
    expect(installStatusOf("aufx/Phsr/kHs", registry)).toBe("missing");
  });
});

describe("groupFingerprints", () => {
  it("returns an empty array for empty input", () => {
    expect(groupFingerprints([])).toEqual([]);
  });

  it("collapses identical fingerprints into a single group with count = N", () => {
    const groups = groupFingerprints([
      ref("aumf/FXR /SToy", 100),
      ref("aumf/FXR /SToy", 200),
      ref("aumf/FXR /SToy", 300),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toEqual({
      fingerprint: "aumf/FXR /SToy",
      count: 3,
      first_offset: 100,
    });
  });

  it("preserves first-seen order across distinct fingerprints", () => {
    const groups = groupFingerprints([
      ref("aumu/EZk2/Toon", 10),
      ref("aufx/Comp/Yamh", 20),
      ref("aumu/EZk2/Toon", 30),
      ref("aufx/Verb/Mfgr", 40),
    ]);

    expect(groups.map((g) => g.fingerprint)).toEqual([
      "aumu/EZk2/Toon",
      "aufx/Comp/Yamh",
      "aufx/Verb/Mfgr",
    ]);
    expect(groups[0]?.count).toBe(2);
    expect(groups[0]?.first_offset).toBe(10);
  });
});
