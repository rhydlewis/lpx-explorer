import { describe, expect, it } from "vitest";

import type { AURef, AuvalEntry, Track } from "./types";

import { displayNameOf } from "./track-display";

function track(overrides: Partial<Track> = {}): Track {
  return {
    name: "Inst 1",
    user_name: null,
    kind: "instrument",
    offset: 0,
    is_active: true,
    instrument: null,
    midi_fx: [],
    audio_fx: [],
    sub_number: null,
    parent_offset: null,
    ...overrides,
  };
}

const inst = (fp: string): AURef => {
  const [type_code = "", subtype = "", manufacturer = ""] = fp.split("/");
  return { type_code, subtype, manufacturer, offset: 100 };
};

const registry = (
  ...entries: Array<{ fingerprint: string; name: string }>
): ReadonlyMap<string, AuvalEntry> => {
  const map = new Map<string, AuvalEntry>();
  for (const e of entries) {
    const [type_4cc = "", subtype_4cc = "", manufacturer_4cc = ""] =
      e.fingerprint.split("/");
    map.set(e.fingerprint, {
      fingerprint: e.fingerprint,
      type_4cc,
      subtype_4cc,
      manufacturer_4cc,
      name: e.name,
    });
  }
  return map;
};

describe("displayNameOf", () => {
  it("prefers user_name when present", () => {
    const t = track({ name: "Audio 3", user_name: "Acoustic GTR" });

    expect(displayNameOf(t, new Map())).toBe("Acoustic GTR");
  });

  it("for instrument tracks, uses the registry-resolved name with the 'Manufacturer: ' prefix stripped", () => {
    const t = track({
      kind: "instrument",
      instrument: inst("aumu/DD02/TCHC"),
    });
    const reg = registry({
      fingerprint: "aumu/DD02/TCHC",
      name: "Crow Hill: Pocket Strings",
    });

    expect(displayNameOf(t, reg)).toBe("Pocket Strings");
  });

  it("returns the auval name unchanged when there's no 'Manufacturer: ' prefix", () => {
    const t = track({
      kind: "instrument",
      instrument: inst("aumu/dlsm/appl"),
    });
    const reg = registry({
      fingerprint: "aumu/dlsm/appl",
      name: "DLSMusicDevice",
    });

    expect(displayNameOf(t, reg)).toBe("DLSMusicDevice");
  });

  it("falls back to channel-strip name when registry has no match", () => {
    const t = track({
      kind: "instrument",
      instrument: inst("aumu/missing/Mfgr"),
    });

    expect(displayNameOf(t, new Map())).toBe("Inst 1");
  });

  it("uses channel-strip name for audio tracks without user_name (no instrument name to fall back to)", () => {
    const t = track({ kind: "audio", name: "Audio 3", instrument: null });

    expect(displayNameOf(t, new Map())).toBe("Audio 3");
  });

  it("user_name beats the instrument name even when the registry has a match", () => {
    const t = track({
      kind: "instrument",
      name: "Inst 1",
      user_name: "My Custom Name",
      instrument: inst("aumu/DD02/TCHC"),
    });
    const reg = registry({
      fingerprint: "aumu/DD02/TCHC",
      name: "Crow Hill: Pocket Strings",
    });

    expect(displayNameOf(t, reg)).toBe("My Custom Name");
  });
});
