import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useLibraryStore } from "../store/library-store";
import { useProjectStore } from "../store/project-store";

import { openProject } from "./open-project";

vi.mock("./parse", () => ({
  parseProject: vi.fn().mockResolvedValue({ fingerprints: [] }),
  // 4qf: project-store now drives loads through list_alternatives +
  // parse_alternative. Mock both to keep openProject tests focused
  // on Recents bookkeeping.
  listAlternatives: vi.fn().mockResolvedValue([
    { index: 0, display_name: "song", is_active: true },
  ]),
  parseAlternative: vi.fn().mockResolvedValue({ fingerprints: [] }),
  projectInformationPresent: vi.fn().mockResolvedValue(true),
}));

describe("openProject", () => {
  beforeEach(() => {
    useLibraryStore.getState().clear();
    useProjectStore.getState().clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    useLibraryStore.getState().clear();
    useProjectStore.getState().clear();
    vi.restoreAllMocks();
  });

  it("adds the project to Recent (top of list)", async () => {
    await openProject("/Users/rhyd/Music/Logic/song.logicx");

    expect(useLibraryStore.getState().recent[0]?.path).toBe(
      "/Users/rhyd/Music/Logic/song.logicx",
    );
  });

  it("loads the project into the Inspector", async () => {
    await openProject("/Users/rhyd/Music/Logic/song.logicx");

    const status = useProjectStore.getState().current;
    expect(status.kind).toBe("loaded");
    if (status.kind === "loaded") {
      expect(status.path).toBe("/Users/rhyd/Music/Logic/song.logicx");
    }
  });

  it("dedupes Recent when the same path is opened twice", async () => {
    await openProject("/a.logicx");
    await openProject("/b.logicx");
    await openProject("/a.logicx");

    expect(
      useLibraryStore.getState().recent.map((r) => r.path),
    ).toEqual(["/a.logicx", "/b.logicx"]);
  });
});
