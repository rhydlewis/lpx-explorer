import { describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";

import { parseProject } from "./parse";
import type { ProjectSummary } from "./types";

const mockInvoke = vi.mocked(invoke);

describe("parseProject IPC contract", () => {
  it("returns the fingerprints payload from the parse_project command", async () => {
    const expected: ProjectSummary = {
      fingerprints: [
        {
          type_code: "aumu",
          subtype: "EZk2",
          manufacturer: "Toon",
          offset: 12,
        },
      ],
    };
    mockInvoke.mockResolvedValueOnce(expected);

    const result = await parseProject("/Users/rhyd/Music/Logic/Demo.logicx");

    expect(result).toEqual(expected);
  });

  it("forwards the bundle path to the parse_project command", async () => {
    mockInvoke.mockResolvedValueOnce({ fingerprints: [] } satisfies ProjectSummary);

    await parseProject("/some/path.logicx");

    expect(mockInvoke).toHaveBeenCalledWith("parse_project", {
      path: "/some/path.logicx",
    });
  });
});
