import { describe, expect, it } from "vitest";

import { makeSummary } from "../test/fixtures";

import { describeAxis, matchesAxis, type SimilarityAxis } from "./similarity";

describe("matchesAxis — key", () => {
  const axis: SimilarityAxis = { kind: "key", song_key: "C", song_gender: "Major" };

  it("matches when both song_key and song_gender are equal", () => {
    const s = makeSummary({ metadata: { song_key: "C", song_gender: "Major" } });
    expect(matchesAxis(s, axis)).toBe(true);
  });

  it("rejects when song_key differs", () => {
    const s = makeSummary({ metadata: { song_key: "D", song_gender: "Major" } });
    expect(matchesAxis(s, axis)).toBe(false);
  });

  it("rejects when song_gender differs (C major != C minor)", () => {
    const s = makeSummary({ metadata: { song_key: "C", song_gender: "Minor" } });
    expect(matchesAxis(s, axis)).toBe(false);
  });

  it("rejects when candidate key is unknown ('?')", () => {
    const s = makeSummary({ metadata: { song_key: "?", song_gender: "?" } });
    expect(matchesAxis(s, axis)).toBe(false);
  });

  it("rejects when candidate gender is unknown but key matches", () => {
    const s = makeSummary({ metadata: { song_key: "C", song_gender: "?" } });
    expect(matchesAxis(s, axis)).toBe(false);
  });

  it("rejects when target key is unknown — never claims a match against '?'", () => {
    const unknownAxis: SimilarityAxis = {
      kind: "key",
      song_key: "?",
      song_gender: "?",
    };
    const s = makeSummary({ metadata: { song_key: "?", song_gender: "?" } });
    expect(matchesAxis(s, unknownAxis)).toBe(false);
  });
});

describe("matchesAxis — bpm", () => {
  // target=92 → rounded bucket 90 → window 88–92 inclusive.
  const axis: SimilarityAxis = { kind: "bpm", bpm: 92 };

  it("matches the lower edge (88)", () => {
    const s = makeSummary({ metadata: { bpm: 88 } });
    expect(matchesAxis(s, axis)).toBe(true);
  });

  it("matches the upper edge (92)", () => {
    const s = makeSummary({ metadata: { bpm: 92 } });
    expect(matchesAxis(s, axis)).toBe(true);
  });

  it("rejects 87 — one BPM below the band", () => {
    const s = makeSummary({ metadata: { bpm: 87 } });
    expect(matchesAxis(s, axis)).toBe(false);
  });

  it("rejects 93 — one BPM above the band", () => {
    const s = makeSummary({ metadata: { bpm: 93 } });
    expect(matchesAxis(s, axis)).toBe(false);
  });

  it("matches across the rounding boundary — target=93 buckets to 95, window 93–97", () => {
    const wider: SimilarityAxis = { kind: "bpm", bpm: 93 };
    const s = makeSummary({ metadata: { bpm: 97 } });
    expect(matchesAxis(s, wider)).toBe(true);
  });

  it("rejects when candidate bpm is 0 (unknown)", () => {
    const s = makeSummary({ metadata: { bpm: 0 } });
    expect(matchesAxis(s, axis)).toBe(false);
  });
});

describe("matchesAxis — key+bpm", () => {
  const axis: SimilarityAxis = {
    kind: "key+bpm",
    song_key: "C",
    song_gender: "Major",
    bpm: 92,
  };

  it("matches when both axes match", () => {
    const s = makeSummary({
      metadata: { song_key: "C", song_gender: "Major", bpm: 90 },
    });
    expect(matchesAxis(s, axis)).toBe(true);
  });

  it("rejects when key matches but bpm is out of band", () => {
    const s = makeSummary({
      metadata: { song_key: "C", song_gender: "Major", bpm: 100 },
    });
    expect(matchesAxis(s, axis)).toBe(false);
  });

  it("rejects when bpm matches but key differs", () => {
    const s = makeSummary({
      metadata: { song_key: "D", song_gender: "Major", bpm: 90 },
    });
    expect(matchesAxis(s, axis)).toBe(false);
  });

  it("rejects when key is unknown", () => {
    const s = makeSummary({
      metadata: { song_key: "?", song_gender: "?", bpm: 90 },
    });
    expect(matchesAxis(s, axis)).toBe(false);
  });
});

describe("describeAxis", () => {
  it("describes a key axis as 'C major'", () => {
    expect(
      describeAxis({ kind: "key", song_key: "C", song_gender: "Major" }),
    ).toBe("C major");
  });

  it("describes a key axis with minor gender", () => {
    expect(
      describeAxis({ kind: "key", song_key: "F#", song_gender: "Minor" }),
    ).toBe("F# minor");
  });

  it("describes a bpm axis with the rounded bucket and ±2 window", () => {
    expect(describeAxis({ kind: "bpm", bpm: 92 })).toBe("around 92 BPM (88–92)");
  });

  it("describes a key+bpm axis as 'C major around 92 BPM (88–92)'", () => {
    expect(
      describeAxis({
        kind: "key+bpm",
        song_key: "C",
        song_gender: "Major",
        bpm: 92,
      }),
    ).toBe("C major around 92 BPM (88–92)");
  });
});
