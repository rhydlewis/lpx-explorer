import { describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";

import { makeSummary } from "../test/fixtures";
import type { AudioFile } from "./types";

import { listAudioFiles, parseProject, pickHeroAudio } from "./parse";

const mockInvoke = vi.mocked(invoke);

function audio(overrides: Partial<AudioFile> = {}): AudioFile {
  return {
    path: "/x.logicx/Bounces/mix.wav",
    file_name: "mix.wav",
    category: "bounce",
    size_bytes: 100,
    mtime_unix: 1715000000,
    previewable: true,
    ...overrides,
  };
}

describe("parseProject IPC contract", () => {
  it("returns the full ProjectSummary payload from the parse_project command", async () => {
    const expected = makeSummary({
      fingerprints: [
        { type_code: "aumu", subtype: "EZk2", manufacturer: "Toon", offset: 12 },
      ],
      metadata: { song_key: "C", song_gender: "major", bpm: 120, track_count: 3 },
      stats: { size_bytes: 405020, modified_at_unix: 1714476899 },
    });
    mockInvoke.mockResolvedValueOnce(expected);

    const result = await parseProject("/Users/rhyd/Music/Logic/Demo.logicx");

    expect(result).toEqual(expected);
  });

  it("forwards the bundle path to the parse_project command", async () => {
    mockInvoke.mockResolvedValueOnce(makeSummary());

    await parseProject("/some/path.logicx");

    expect(mockInvoke).toHaveBeenCalledWith("parse_project", {
      path: "/some/path.logicx",
    });
  });

  it("listAudioFiles forwards the bundle path to the list_audio_files command", async () => {
    mockInvoke.mockResolvedValueOnce([] satisfies AudioFile[]);

    await listAudioFiles("/x.logicx");

    expect(mockInvoke).toHaveBeenCalledWith("list_audio_files", {
      path: "/x.logicx",
    });
  });

  it("round-trips the tracks payload alongside fingerprints + metadata", async () => {
    const expected = makeSummary({
      tracks: [
        {
          name: "Audio 1",
          user_name: null,
          kind: "audio",
          offset: 1024,
          is_active: true,
          instrument: null,
          midi_fx: [],
          audio_fx: [],
          sub_number: null,
          parent_offset: null,
        },
        {
          name: "Inst 1",
          user_name: "Pocket Strings",
          kind: "instrument",
          offset: 2048,
          is_active: false,
          instrument: {
            type_code: "aumu",
            subtype: "EZk2",
            manufacturer: "Toon",
            offset: 2080,
          },
          midi_fx: [],
          audio_fx: [],
          sub_number: null,
          parent_offset: null,
        },
      ],
    });
    mockInvoke.mockResolvedValueOnce(expected);

    const result = await parseProject("/x.logicx");

    expect(result.tracks).toHaveLength(2);
    expect(result.tracks[0]?.name).toBe("Audio 1");
    expect(result.tracks[1]?.instrument?.type_code).toBe("aumu");
  });
});

describe("pickHeroAudio", () => {
  it("prefers the most recent Bounce over any AudioRegion", () => {
    // Tier ordering: Bounces always beat Audio Files / Freeze Files
    // because they're the closest answer to 'what does the song sound
    // like?'. Within Bounces, most recent mtime wins.
    const hero = pickHeroAudio([
      audio({
        category: "audio-region",
        file_name: "huge_vocal.wav",
        size_bytes: 100_000,
        mtime_unix: 1715999999,
      }),
      audio({ file_name: "old_mix.wav", mtime_unix: 1715000000 }),
      audio({ file_name: "new_mix.wav", mtime_unix: 1715500000 }),
    ]);

    expect(hero?.file_name).toBe("new_mix.wav");
    expect(hero?.category).toBe("bounce");
  });

  it("falls back to the largest AudioRegion when no Bounces exist", () => {
    const hero = pickHeroAudio([
      audio({ category: "audio-region", file_name: "snippet.wav", size_bytes: 100 }),
      audio({ category: "audio-region", file_name: "full_take.wav", size_bytes: 50_000 }),
    ]);

    expect(hero?.file_name).toBe("full_take.wav");
  });

  it("skips non-previewable files when selecting a hero", () => {
    // CAF files are listed in the inventory but flagged
    // previewable=false. They must never be selected as the hero —
    // the play button would be disabled, which is a worse UX than
    // 'no hero, just an empty state'.
    const hero = pickHeroAudio([
      audio({ category: "freeze-file", file_name: "track.caf", previewable: false }),
    ]);

    expect(hero).toBeNull();
  });

  it("returns null when the inventory is empty", () => {
    expect(pickHeroAudio([])).toBeNull();
  });
});
