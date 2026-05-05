import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ProjectSummary } from "../lib/types";
import { parseProject } from "../lib/parse";
import { makeSummary } from "../test/fixtures";

import { useProjectStore } from "./project-store";

vi.mock("../lib/parse", () => ({
  parseProject: vi.fn(),
}));

const mockedParse = vi.mocked(parseProject);

describe("useProjectStore", () => {
  beforeEach(() => {
    useProjectStore.getState().clear();
    mockedParse.mockReset();
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
    let resolve!: (value: ProjectSummary) => void;
    mockedParse.mockReturnValueOnce(
      new Promise<ProjectSummary>((res) => {
        resolve = res;
      }),
    );

    const selectPromise = useProjectStore
      .getState()
      .select("/Music/Logic/song.logicx");

    expect(useProjectStore.getState().current).toEqual({
      kind: "loading",
      path: "/Music/Logic/song.logicx",
    });

    resolve(summary);
    await selectPromise;

    expect(useProjectStore.getState().current).toEqual({
      kind: "loaded",
      path: "/Music/Logic/song.logicx",
      summary,
    });
  });

  it("transitions to error when parseProject rejects", async () => {
    mockedParse.mockRejectedValueOnce(new Error("ProjectData not found"));

    await useProjectStore.getState().select("/broken.logicx");

    expect(useProjectStore.getState().current).toEqual({
      kind: "error",
      path: "/broken.logicx",
      message: "ProjectData not found",
    });
  });

  it("handles non-Error rejections by stringifying", async () => {
    mockedParse.mockRejectedValueOnce("io error");

    await useProjectStore.getState().select("/x.logicx");

    const state = useProjectStore.getState().current;
    expect(state.kind).toBe("error");
    if (state.kind === "error") {
      expect(state.message).toBe("io error");
    }
  });

  it("clear resets to idle", async () => {
    mockedParse.mockResolvedValueOnce(makeSummary());
    await useProjectStore.getState().select("/x.logicx");
    expect(useProjectStore.getState().current.kind).toBe("loaded");

    useProjectStore.getState().clear();

    expect(useProjectStore.getState().current).toEqual({ kind: "idle" });
  });
});
