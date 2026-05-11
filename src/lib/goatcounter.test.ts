import { beforeEach, describe, expect, it, vi } from "vitest";

const storeData = new Map<string, unknown>();
const mockGet = vi.fn(async (key: string) => storeData.get(key));
const mockSet = vi.fn(async (key: string, value: unknown) => {
  storeData.set(key, value);
});
const mockSave = vi.fn(async () => {});
const mockLoad = vi.fn(async () => ({
  get: mockGet,
  set: mockSet,
  save: mockSave,
}));

vi.mock("@tauri-apps/plugin-store", () => ({
  load: () => mockLoad(),
}));

const mockFetch = vi.fn();
vi.mock("@tauri-apps/plugin-http", () => ({
  fetch: (...args: unknown[]) => mockFetch(...args),
}));

const mockGetVersion = vi.fn();
vi.mock("@tauri-apps/api/app", () => ({
  getVersion: () => mockGetVersion(),
}));

import { trackInstall } from "./goatcounter";

function makeOkResponse() {
  return { ok: true, status: 200 };
}

function makeErrorResponse() {
  return { ok: false, status: 500 };
}

describe("trackInstall", () => {
  beforeEach(() => {
    storeData.clear();
    mockGet.mockClear();
    mockSet.mockClear();
    mockSave.mockClear();
    mockFetch.mockReset();
    mockGetVersion.mockReset();
    mockGetVersion.mockResolvedValue("0.0.5");
    vi.stubEnv("DEV", false);
  });

  it("skips tracking in dev mode", async () => {
    vi.stubEnv("DEV", true);

    await trackInstall();

    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockSet).not.toHaveBeenCalled();
  });

  it("skips tracking when stored version matches current", async () => {
    storeData.set("analytics:installed-version", "0.0.5");

    await trackInstall();

    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockSet).not.toHaveBeenCalled();
  });

  it("sends install event with version in path when no prior version stored", async () => {
    mockFetch.mockResolvedValue(makeOkResponse());

    await trackInstall();

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(url).toContain("https://lpx-explorer.goatcounter.com/count");
    expect(url).toContain("p=install/0.0.5");
    expect(url).toContain("t=Install+0.0.5");
    expect(url).toContain("e=true");
    expect(options.headers).toEqual({
      "User-Agent": "Mozilla/5.0 (Macintosh) lpx-explorer/0.0.5",
    });
  });

  it("sends upgrade event with from/to versions when stored differs", async () => {
    storeData.set("analytics:installed-version", "0.0.4");
    mockFetch.mockResolvedValue(makeOkResponse());

    await trackInstall();

    expect(mockFetch).toHaveBeenCalledOnce();
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("p=upgrade/0.0.4-to-0.0.5");
    expect(url).toContain("t=Upgrade+0.0.4+%E2%86%92+0.0.5");
  });

  it("stores current version after a 2xx response", async () => {
    mockFetch.mockResolvedValue(makeOkResponse());

    await trackInstall();

    expect(mockSet).toHaveBeenCalledWith(
      "analytics:installed-version",
      "0.0.5",
    );
    expect(mockSave).toHaveBeenCalled();
  });

  it("does not store the version when the response is not ok", async () => {
    mockFetch.mockResolvedValue(makeErrorResponse());

    await trackInstall();

    expect(mockSet).not.toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("does not throw on network error", async () => {
    mockFetch.mockRejectedValue(new Error("network down"));

    await expect(trackInstall()).resolves.toBeUndefined();
    expect(mockSet).not.toHaveBeenCalled();
  });

  it("does not throw on store read error", async () => {
    mockGet.mockRejectedValueOnce(new Error("store unreadable"));

    await expect(trackInstall()).resolves.toBeUndefined();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
