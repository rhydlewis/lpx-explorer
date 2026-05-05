import { describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";

import { makeSummary } from "../test/fixtures";

import { parseProject } from "./parse";

const mockInvoke = vi.mocked(invoke);

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
});
