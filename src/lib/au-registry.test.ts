import { describe, expect, it, vi } from "vitest";
import { Channel, invoke } from "@tauri-apps/api/core";

import type { AuRegistry, AuvalEntry } from "./types";

import { loadAuRegistry, runAuScan } from "./au-registry";

const mockInvoke = vi.mocked(invoke);

interface ScanInvokeArgs {
  readonly onEvent: Channel<unknown>;
}

type AuvalEvent =
  | { type: "Entry"; entry: AuvalEntry }
  | { type: "Done" };

describe("loadAuRegistry IPC contract", () => {
  it("forwards to the load_au_registry command (no args)", async () => {
    mockInvoke.mockResolvedValueOnce(null);

    await loadAuRegistry();

    expect(mockInvoke).toHaveBeenCalledWith("load_au_registry");
  });

  it("returns null when the cache is absent", async () => {
    mockInvoke.mockResolvedValueOnce(null);

    const result = await loadAuRegistry();

    expect(result).toBeNull();
  });

  it("returns the typed AuRegistry payload when the cache exists", async () => {
    const expected: AuRegistry = {
      entries: [
        {
          fingerprint: "aumu/EZk2/Toon",
          type_4cc: "aumu",
          subtype_4cc: "EZk2",
          manufacturer_4cc: "Toon",
          name: "EZdrummer 2",
        },
      ],
      scanned_at_unix: 1_777_889_700,
    };
    mockInvoke.mockResolvedValueOnce(expected);

    const result = await loadAuRegistry();

    expect(result).toEqual(expected);
  });

  it("propagates AuvalError rejections", async () => {
    mockInvoke.mockRejectedValueOnce({
      kind: "CacheParse",
      message: "expected `,`",
    });

    await expect(loadAuRegistry()).rejects.toEqual({
      kind: "CacheParse",
      message: "expected `,`",
    });
  });
});

describe("runAuScan IPC contract", () => {
  it("forwards a Channel to the run_au_scan command", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);

    await runAuScan();

    expect(mockInvoke).toHaveBeenCalledWith(
      "run_au_scan",
      expect.objectContaining({
        onEvent: expect.any(Channel),
      }),
    );
  });

  it("calls onEntry for each AuvalEvent.Entry event", async () => {
    mockInvoke.mockImplementationOnce(async (_cmd, args) => {
      const { onEvent } = args as unknown as ScanInvokeArgs;
      const handler = onEvent.onmessage;
      handler?.({
        type: "Entry",
        entry: {
          fingerprint: "aumu/EZk2/Toon",
          type_4cc: "aumu",
          subtype_4cc: "EZk2",
          manufacturer_4cc: "Toon",
          name: "EZdrummer 2",
        },
      } satisfies AuvalEvent);
      handler?.({
        type: "Entry",
        entry: {
          fingerprint: "aufx/Cmpr/appl",
          type_4cc: "aufx",
          subtype_4cc: "Cmpr",
          manufacturer_4cc: "appl",
          name: "AUDynamicsProcessor",
        },
      } satisfies AuvalEvent);
      handler?.({ type: "Done" } satisfies AuvalEvent);
    });
    const onEntry = vi.fn<(entry: AuvalEntry) => void>();

    await runAuScan(onEntry);

    expect(onEntry).toHaveBeenCalledTimes(2);
    expect(onEntry).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ fingerprint: "aumu/EZk2/Toon" }),
    );
    expect(onEntry).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ fingerprint: "aufx/Cmpr/appl" }),
    );
  });

  it("propagates AuvalError rejections (e.g. SpawnFailed when auval segfaults)", async () => {
    mockInvoke.mockRejectedValueOnce({
      kind: "SpawnFailed",
      message: "auval exited with signal: 11",
    });

    await expect(runAuScan()).rejects.toEqual({
      kind: "SpawnFailed",
      message: "auval exited with signal: 11",
    });
  });
});
