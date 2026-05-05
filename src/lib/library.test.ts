import { describe, expect, it, vi } from "vitest";
import { Channel, invoke } from "@tauri-apps/api/core";

import { scanFolder } from "./library";

const mockInvoke = vi.mocked(invoke);

interface ScanInvokeArgs {
  readonly path: string;
  readonly onEvent: Channel<unknown>;
}

describe("scanFolder IPC contract", () => {
  it("forwards the folder path + a Channel to the scan_folder command", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);

    await scanFolder("/Users/rhyd/Music/Logic");

    expect(mockInvoke).toHaveBeenCalledWith(
      "scan_folder",
      expect.objectContaining({
        path: "/Users/rhyd/Music/Logic",
        onEvent: expect.any(Channel),
      }),
    );
  });

  it("calls onProject for each ScanEvent.Project event", async () => {
    mockInvoke.mockImplementationOnce(async (_cmd, args) => {
      const { onEvent } = args as unknown as ScanInvokeArgs;
      const handler = onEvent.onmessage;
      handler?.({ type: "Project", path: "/a.logicx" });
      handler?.({ type: "Project", path: "/b.logicx" });
      handler?.({ type: "Done" });
    });
    const onProject = vi.fn<(p: string) => void>();

    await scanFolder("/Music/Logic", onProject);

    expect(onProject).toHaveBeenCalledTimes(2);
    expect(onProject).toHaveBeenNthCalledWith(1, "/a.logicx");
    expect(onProject).toHaveBeenNthCalledWith(2, "/b.logicx");
  });

  it("propagates ScanError rejections", async () => {
    mockInvoke.mockRejectedValueOnce({ kind: "NotFound", message: "/missing" });

    await expect(scanFolder("/missing")).rejects.toEqual({
      kind: "NotFound",
      message: "/missing",
    });
  });
});
