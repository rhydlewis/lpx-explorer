import { describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";

import type { AuRegistry } from "./types";

import { loadAuRegistry } from "./au-registry";

const mockInvoke = vi.mocked(invoke);

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
