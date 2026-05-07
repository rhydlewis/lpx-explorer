import { describe, expect, it } from "vitest";

import { categoryOf } from "./au-categories";

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
