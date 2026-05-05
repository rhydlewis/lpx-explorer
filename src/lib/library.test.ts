import { describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";

import { scanFolder } from "./library";

const mockInvoke = vi.mocked(invoke);

describe("scanFolder IPC contract", () => {
  it("returns the array of .logicx paths from the scan_folder command", async () => {
    mockInvoke.mockResolvedValueOnce([
      "/Users/rhyd/Music/Logic/a.logicx",
      "/Users/rhyd/Music/Logic/b.logicx",
    ]);

    const result = await scanFolder("/Users/rhyd/Music/Logic");

    expect(result).toEqual([
      "/Users/rhyd/Music/Logic/a.logicx",
      "/Users/rhyd/Music/Logic/b.logicx",
    ]);
  });

  it("forwards the folder path to the scan_folder command", async () => {
    mockInvoke.mockResolvedValueOnce([]);

    await scanFolder("/Users/rhyd/Music/Logic");

    expect(mockInvoke).toHaveBeenCalledWith("scan_folder", {
      path: "/Users/rhyd/Music/Logic",
    });
  });

  it("propagates ScanError rejections", async () => {
    mockInvoke.mockRejectedValueOnce({ kind: "NotFound", message: "/missing" });

    await expect(scanFolder("/missing")).rejects.toEqual({
      kind: "NotFound",
      message: "/missing",
    });
  });
});
