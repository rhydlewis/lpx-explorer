import { describe, expect, it } from "vitest";

import { categoryOf, fineCategoryOf } from "./au-categories";

describe("categoryOf", () => {
  it("maps audio-effect types to 'effect'", () => {
    expect(categoryOf("aufx")).toBe("effect");
    expect(categoryOf("aufc")).toBe("effect"); // format converter
    expect(categoryOf("aupn")).toBe("effect"); // panner
    expect(categoryOf("augn")).toBe("effect"); // generator
    expect(categoryOf("auol")).toBe("effect"); // offline effect
  });

  it("maps the music-device type to 'instrument'", () => {
    expect(categoryOf("aumu")).toBe("instrument");
  });

  it("maps both MIDI types to 'midi'", () => {
    expect(categoryOf("aumf")).toBe("midi"); // MIDI-controlled audio
    expect(categoryOf("aumi")).toBe("midi"); // MIDI processor
  });

  it("maps unknown / non-user-facing types to 'other'", () => {
    expect(categoryOf("auou")).toBe("other"); // output unit
    expect(categoryOf("aumx")).toBe("other"); // mixer
    expect(categoryOf("xxxx")).toBe("other");
    expect(categoryOf("")).toBe("other");
  });
});

describe("fineCategoryOf", () => {
  it("returns the fine category for a known Apple stock display name", () => {
    expect(fineCategoryOf({ displayName: "Channel EQ", fingerprint: "aufx/chnl/appl" })).toBe("EQ");
    expect(fineCategoryOf({ displayName: "Compressor", fingerprint: "aufx/Comp/appl" })).toBe("Dynamics");
    expect(fineCategoryOf({ displayName: "Space Designer", fingerprint: "aufx/spcd/appl" })).toBe("Reverb");
    expect(fineCategoryOf({ displayName: "ChromaVerb", fingerprint: "aufx/chrm/appl" })).toBe("Reverb");
    expect(fineCategoryOf({ displayName: "Tape Delay", fingerprint: "aufx/tdly/appl" })).toBe("Delay");
  });

  it("falls back to 'Instrument' for instrument-type plug-ins outside the table", () => {
    expect(
      fineCategoryOf({ displayName: "Khords", fingerprint: "aumu/KRDS/LOMA" }),
    ).toBe("Instrument");
  });

  it("falls back to 'MIDI Effect' for MIDI-type plug-ins outside the table", () => {
    expect(fineCategoryOf({ fingerprint: "aumi/xxxx/yyyy" })).toBe("MIDI Effect");
    expect(fineCategoryOf({ fingerprint: "aumf/xxxx/yyyy" })).toBe("MIDI Effect");
  });

  it("returns 'Uncategorised' for unknown audio effects (the gap-finding case)", () => {
    expect(
      fineCategoryOf({ displayName: "Some 3rd-Party Plug-in", fingerprint: "aufx/xxxx/yyyy" }),
    ).toBe("Uncategorised");
  });

  it("works without a displayName — falls through to fingerprint coarse mapping", () => {
    expect(fineCategoryOf({ fingerprint: "aumu/xxxx/yyyy" })).toBe("Instrument");
    expect(fineCategoryOf({ fingerprint: "aufx/xxxx/yyyy" })).toBe("Uncategorised");
  });

  it("maps the AU* CoreAudio system effects to their right buckets", () => {
    expect(fineCategoryOf({ displayName: "AUDelay", fingerprint: "aufx/dely/appl" })).toBe("Delay");
    expect(fineCategoryOf({ displayName: "AUParametricEQ", fingerprint: "aufx/pmeq/appl" })).toBe("EQ");
    expect(
      fineCategoryOf({ displayName: "AUDynamicsProcessor", fingerprint: "aufx/dcmp/appl" }),
    ).toBe("Dynamics");
    expect(fineCategoryOf({ displayName: "AUSampler", fingerprint: "aumu/samp/appl" })).toBe("Sampler");
  });
});
