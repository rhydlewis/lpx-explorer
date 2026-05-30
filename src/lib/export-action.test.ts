import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";

import { makeLoadedStatus, makeSummary } from "../test/fixtures";
import { useProjectStore } from "../store/project-store";
import { useAuRegistryStore } from "../store/au-registry-store";

import { runReadmeExport } from "./export-action";

const mockedSave = vi.mocked(save);
const mockedInvoke = vi.mocked(invoke);

describe("runReadmeExport", () => {
  beforeEach(() => {
    mockedSave.mockReset();
    mockedInvoke.mockReset();
    useProjectStore.getState().clear();
    useAuRegistryStore.setState({ status: { kind: "idle" } });
  });

  afterEach(() => {
    useProjectStore.getState().clear();
  });

  function loadProject(): void {
    useProjectStore.setState({
      current: makeLoadedStatus({
        path: "/Music/Logic/song.logicx",
        summary: makeSummary({ metadata: { bpm: 120 } }),
      }),
    });
  }

  it("no-ops when no project is open", async () => {
    const result = await runReadmeExport();

    expect(result).toEqual({ kind: "no-project" });
    expect(mockedSave).not.toHaveBeenCalled();
  });

  it("writes the README via export_readme to the chosen path", async () => {
    loadProject();
    mockedSave.mockResolvedValueOnce("/Users/r/Desktop/song README.txt");
    mockedInvoke.mockResolvedValueOnce(undefined);

    const result = await runReadmeExport();

    expect(result).toEqual({
      kind: "written",
      path: "/Users/r/Desktop/song README.txt",
    });
    expect(mockedInvoke).toHaveBeenCalledTimes(1);
    const [command, args] = mockedInvoke.mock.calls[0];
    expect(command).toBe("export_readme");
    expect(args).toMatchObject({ path: "/Users/r/Desktop/song README.txt" });
    // The generated text leads with the project name.
    expect((args as { contents: string }).contents).toContain("song");
  });

  it("defaults the save filename to '<project> README.txt'", async () => {
    loadProject();
    mockedSave.mockResolvedValueOnce(null);

    await runReadmeExport();

    expect(mockedSave).toHaveBeenCalledTimes(1);
    expect(mockedSave.mock.calls[0][0]).toMatchObject({
      defaultPath: "song README.txt",
    });
  });

  it("returns 'cancelled' and never writes when the user dismisses the dialog", async () => {
    loadProject();
    mockedSave.mockResolvedValueOnce(null);

    const result = await runReadmeExport();

    expect(result).toEqual({ kind: "cancelled" });
    expect(mockedInvoke).not.toHaveBeenCalled();
  });

  it("surfaces a write failure as an error result", async () => {
    loadProject();
    mockedSave.mockResolvedValueOnce("/Users/r/song README.txt");
    mockedInvoke.mockRejectedValueOnce("refusing to write inside a .logicx bundle");

    const result = await runReadmeExport();

    expect(result).toEqual({
      kind: "error",
      message: "refusing to write inside a .logicx bundle",
    });
  });
});
