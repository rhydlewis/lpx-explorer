import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Alternative, ProjectSummary } from "../lib/types";
import { listAlternatives, parseAlternative } from "../lib/parse";
import { makeSummary } from "../test/fixtures";

import { useProjectStore } from "./project-store";

vi.mock("../lib/parse", () => ({
  listAlternatives: vi.fn(),
  parseAlternative: vi.fn(),
}));

const mockedListAlternatives = vi.mocked(listAlternatives);
const mockedParseAlternative = vi.mocked(parseAlternative);

function alt(
  index: number,
  display_name: string,
  is_active = false,
): Alternative {
  return { index, display_name, is_active, window_image_path: null };
}

describe("useProjectStore", () => {
  beforeEach(() => {
    useProjectStore.getState().clear();
    mockedListAlternatives.mockReset();
    mockedParseAlternative.mockReset();
  });

  afterEach(() => {
    useProjectStore.getState().clear();
  });

  it("starts idle", () => {
    expect(useProjectStore.getState().current).toEqual({ kind: "idle" });
  });

  it("transitions through loading → loaded on a successful select", async () => {
    const summary = makeSummary({
      fingerprints: [
        { type_code: "aumu", subtype: "EZk2", manufacturer: "Toon", offset: 12 },
      ],
    });
    mockedListAlternatives.mockResolvedValueOnce([
      alt(0, "song", true),
    ]);
    let resolve!: (value: ProjectSummary) => void;
    mockedParseAlternative.mockReturnValueOnce(
      new Promise<ProjectSummary>((res) => {
        resolve = res;
      }),
    );

    const selectPromise = useProjectStore
      .getState()
      .select("/Music/Logic/song.logicx");

    // Loading → list_alternatives → parse_alternative → loaded.
    // After list_alternatives resolves we're still in 'loading'.
    await Promise.resolve();
    expect(useProjectStore.getState().current.kind).toBe("loading");

    resolve(summary);
    await selectPromise;

    const state = useProjectStore.getState().current;
    expect(state).toEqual({
      kind: "loaded",
      path: "/Music/Logic/song.logicx",
      summary,
      alternatives: [alt(0, "song", true)],
      activeVariantIndex: 0,
    });
  });

  it("picks the manifest's active variant by default", async () => {
    mockedListAlternatives.mockResolvedValueOnce([
      alt(0, "new idea"),
      alt(1, "new idea - alt 1", true),
    ]);
    mockedParseAlternative.mockResolvedValueOnce(makeSummary());

    await useProjectStore.getState().select("/multi.logicx");

    const state = useProjectStore.getState().current;
    expect(state.kind).toBe("loaded");
    if (state.kind === "loaded") {
      expect(state.activeVariantIndex).toBe(1);
      expect(state.alternatives).toHaveLength(2);
    }
    expect(mockedParseAlternative).toHaveBeenCalledWith("/multi.logicx", 1);
  });

  it("defaults to variant 0 when no alternative is flagged active", async () => {
    mockedListAlternatives.mockResolvedValueOnce([alt(0, "song")]);
    mockedParseAlternative.mockResolvedValueOnce(makeSummary());

    await useProjectStore.getState().select("/x.logicx");

    const state = useProjectStore.getState().current;
    expect(state.kind).toBe("loaded");
    if (state.kind === "loaded") {
      expect(state.activeVariantIndex).toBe(0);
    }
  });

  it("setActiveVariant re-parses and updates the store", async () => {
    mockedListAlternatives.mockResolvedValueOnce([
      alt(0, "v0", true),
      alt(1, "v1"),
    ]);
    const v0 = makeSummary({});
    const v1 = makeSummary({});
    mockedParseAlternative.mockResolvedValueOnce(v0);
    await useProjectStore.getState().select("/multi.logicx");

    mockedParseAlternative.mockResolvedValueOnce(v1);
    await useProjectStore.getState().setActiveVariant(1);

    const state = useProjectStore.getState().current;
    expect(state.kind).toBe("loaded");
    if (state.kind === "loaded") {
      expect(state.activeVariantIndex).toBe(1);
      expect(state.summary).toBe(v1);
      // alternatives list preserved across the switch
      expect(state.alternatives).toHaveLength(2);
    }
  });

  it("setActiveVariant is a no-op when the index already matches", async () => {
    mockedListAlternatives.mockResolvedValueOnce([alt(0, "song", true)]);
    mockedParseAlternative.mockResolvedValueOnce(makeSummary());
    await useProjectStore.getState().select("/x.logicx");
    expect(mockedParseAlternative).toHaveBeenCalledTimes(1);

    await useProjectStore.getState().setActiveVariant(0);

    expect(mockedParseAlternative).toHaveBeenCalledTimes(1);
  });

  it("setActiveVariant ignores indices not in the alternatives list", async () => {
    mockedListAlternatives.mockResolvedValueOnce([alt(0, "song", true)]);
    mockedParseAlternative.mockResolvedValueOnce(makeSummary());
    await useProjectStore.getState().select("/x.logicx");

    await useProjectStore.getState().setActiveVariant(7);

    expect(mockedParseAlternative).toHaveBeenCalledTimes(1);
    const state = useProjectStore.getState().current;
    if (state.kind === "loaded") {
      expect(state.activeVariantIndex).toBe(0);
    }
  });

  it("setActiveVariant on an idle store is a no-op", async () => {
    await useProjectStore.getState().setActiveVariant(1);

    expect(mockedParseAlternative).not.toHaveBeenCalled();
    expect(useProjectStore.getState().current.kind).toBe("idle");
  });

  it("transitions to error when list_alternatives returns empty (unparseable bundle)", async () => {
    mockedListAlternatives.mockResolvedValueOnce([]);

    await useProjectStore.getState().select("/broken.logicx");

    const state = useProjectStore.getState().current;
    expect(state.kind).toBe("error");
    if (state.kind === "error") {
      expect(state.message).toMatch(/ProjectData not found/i);
    }
  });

  it("transitions to error when parse_alternative rejects", async () => {
    mockedListAlternatives.mockResolvedValueOnce([alt(0, "song", true)]);
    mockedParseAlternative.mockRejectedValueOnce(
      new Error("ProjectData not found"),
    );

    await useProjectStore.getState().select("/broken.logicx");

    expect(useProjectStore.getState().current).toEqual({
      kind: "error",
      path: "/broken.logicx",
      message: "ProjectData not found",
    });
  });

  it("unwraps Tauri's serialised ParseError shape", async () => {
    mockedListAlternatives.mockResolvedValueOnce([alt(0, "song", true)]);
    mockedParseAlternative.mockRejectedValueOnce({
      kind: "ProjectDataMissing",
      message: "ProjectData not found inside bundle at /x",
    });

    await useProjectStore.getState().select("/x.logicx");

    const state = useProjectStore.getState().current;
    expect(state.kind).toBe("error");
    if (state.kind === "error") {
      expect(state.message).toMatch(/ProjectData not found/);
    }
  });

  it("clear resets to idle", async () => {
    mockedListAlternatives.mockResolvedValueOnce([alt(0, "song", true)]);
    mockedParseAlternative.mockResolvedValueOnce(makeSummary());
    await useProjectStore.getState().select("/x.logicx");
    expect(useProjectStore.getState().current.kind).toBe("loaded");

    useProjectStore.getState().clear();

    expect(useProjectStore.getState().current).toEqual({ kind: "idle" });
  });
});
