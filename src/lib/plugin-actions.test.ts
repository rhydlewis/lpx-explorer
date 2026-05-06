import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { copyFingerprint, searchPluginOnWeb } from "./plugin-actions";

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn().mockResolvedValue(undefined),
}));

import { openUrl } from "@tauri-apps/plugin-opener";

const mockedOpenUrl = vi.mocked(openUrl);

describe("copyFingerprint", () => {
  let writeText: ReturnType<typeof vi.fn>;
  let originalClipboard: Clipboard | undefined;

  beforeEach(() => {
    originalClipboard = navigator.clipboard;
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
  });

  afterEach(() => {
    if (originalClipboard !== undefined) {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: originalClipboard,
      });
    }
  });

  it("writes the fingerprint string to the clipboard verbatim", async () => {
    await copyFingerprint("aufx/Comp/appl");

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith("aufx/Comp/appl");
  });

  it("preserves trailing/leading spaces in 4CCs (auval quirks)", async () => {
    // Soundtoys EchoBoy: subtype 'EB  ' has trailing spaces. Trimming the
    // string would silently break round-trip lookup against auval.
    await copyFingerprint("aufx/EB  /SToy");

    expect(writeText).toHaveBeenCalledWith("aufx/EB  /SToy");
  });
});

describe("searchPluginOnWeb", () => {
  beforeEach(() => {
    mockedOpenUrl.mockClear();
  });

  it("opens a Google search URL for the given query", async () => {
    await searchPluginOnWeb("Soundtoys EchoBoy");

    expect(mockedOpenUrl).toHaveBeenCalledTimes(1);
    const url = mockedOpenUrl.mock.calls[0][0];
    expect(url).toMatch(/^https:\/\/www\.google\.com\/search\?q=/);
    expect(url).toContain(encodeURIComponent("Soundtoys EchoBoy"));
  });

  it("URL-encodes special characters in the query", async () => {
    await searchPluginOnWeb("aufx/Comp/appl");

    const url = mockedOpenUrl.mock.calls[0][0];
    // Slashes must be percent-encoded in the query string.
    expect(url).toContain("aufx%2FComp%2Fappl");
    expect(url).not.toContain("/Comp/appl");
  });
});
