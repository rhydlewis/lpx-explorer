import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RecentEntry } from "./types";

const storeData = new Map<string, unknown>();
const mockGet = vi.fn(async (key: string) => storeData.get(key));
const mockSet = vi.fn(async (key: string, value: unknown) => {
  storeData.set(key, value);
});
const mockSave = vi.fn(async () => {
  // tauri-plugin-store auto-saves with a debounce; the explicit save in
  // persistLibrary forces it through immediately for tests.
});
const mockKeys = vi.fn(async () => Array.from(storeData.keys()));
const mockDelete = vi.fn(async (key: string) => {
  storeData.delete(key);
});
const mockLoad = vi.fn(async () => ({
  get: mockGet,
  set: mockSet,
  save: mockSave,
  keys: mockKeys,
  delete: mockDelete,
}));

vi.mock("@tauri-apps/plugin-store", () => ({
  load: () => mockLoad(),
}));

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: unknown) => mockInvoke(cmd, args),
}));

import {
  loadParseCache,
  loadPersistedFolderPaths,
  loadPersistedLibrary,
  loadTextZoom,
  loadThemePreference,
  persistFolderPaths,
  persistLibrary,
  persistParseCacheEntry,
  persistTextZoom,
  persistThemePreference,
  setRecentMenu,
  setThemeMenu,
} from "./persistence";

import { makeSummary } from "../test/fixtures";

const entry = (path: string, lastLoadedMs = 1): RecentEntry => ({
  path,
  name: path.split("/").filter(Boolean).pop() ?? path,
  lastLoadedMs,
});

describe("loadPersistedLibrary", () => {
  beforeEach(() => {
    storeData.clear();
    mockGet.mockClear();
    mockSet.mockClear();
    mockSave.mockClear();
    mockInvoke.mockReset();
  });
  afterEach(() => {
    storeData.clear();
  });

  it("returns empty lists when the store is empty", async () => {
    const persisted = await loadPersistedLibrary();

    expect(persisted).toEqual({ recent: [], recentFolders: [] });
  });

  it("drops paths whose targets no longer exist on disk", async () => {
    storeData.set("recent", [entry("/exists.logicx"), entry("/missing.logicx")]);
    storeData.set("recentFolders", [entry("/Music"), entry("/dead")]);

    // is_dir mock: only /exists.logicx and /Music are still on disk.
    mockInvoke.mockImplementation((cmd: string, args: { path: string }) => {
      if (cmd !== "is_dir") {
        return Promise.resolve(undefined);
      }
      const alive = new Set(["/exists.logicx", "/Music"]);
      return Promise.resolve(alive.has(args.path));
    });

    const persisted = await loadPersistedLibrary();

    expect(persisted.recent.map((r) => r.path)).toEqual(["/exists.logicx"]);
    expect(persisted.recentFolders.map((r) => r.path)).toEqual(["/Music"]);
  });

  it("treats a thrown is_dir error as 'path missing'", async () => {
    storeData.set("recent", [entry("/anything.logicx")]);

    mockInvoke.mockImplementation(() => Promise.reject(new Error("denied")));

    const persisted = await loadPersistedLibrary();

    expect(persisted.recent).toEqual([]);
  });

  it("ignores malformed persisted data (non-array, missing fields)", async () => {
    storeData.set("recent", "this is not an array");
    storeData.set("recentFolders", [{ path: 5, name: null }]);

    const persisted = await loadPersistedLibrary();

    expect(persisted).toEqual({ recent: [], recentFolders: [] });
  });
});

describe("persistLibrary", () => {
  beforeEach(() => {
    storeData.clear();
    mockGet.mockClear();
    mockSet.mockClear();
    mockSave.mockClear();
  });

  it("writes both keys and saves once", async () => {
    const recent = [entry("/a.logicx"), entry("/b.logicx", 2)];
    const folders = [entry("/Music")];

    await persistLibrary(recent, folders);

    expect(mockSet).toHaveBeenCalledWith("recent", recent);
    expect(mockSet).toHaveBeenCalledWith("recentFolders", folders);
    expect(mockSave).toHaveBeenCalledTimes(1);
  });
});

describe("setRecentMenu", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it("invokes set_recent_menu with path+name pairs only", async () => {
    const recent = [
      { path: "/a.logicx", name: "a", lastLoadedMs: 1 },
      { path: "/b.logicx", name: "b", lastLoadedMs: 2 },
    ];
    const folders = [{ path: "/Music", name: "Music", lastLoadedMs: 3 }];

    await setRecentMenu(recent, folders);

    expect(mockInvoke).toHaveBeenCalledWith("set_recent_menu", {
      recentProjects: [
        { path: "/a.logicx", name: "a" },
        { path: "/b.logicx", name: "b" },
      ],
      recentFolders: [{ path: "/Music", name: "Music" }],
    });
  });
});

describe("loadTextZoom / persistTextZoom", () => {
  beforeEach(() => {
    storeData.clear();
    mockGet.mockClear();
    mockSet.mockClear();
    mockSave.mockClear();
  });
  afterEach(() => {
    storeData.clear();
  });

  it("returns null when nothing has been persisted yet", async () => {
    expect(await loadTextZoom()).toBeNull();
  });

  it("round-trips a zoom value through persistTextZoom + loadTextZoom", async () => {
    await persistTextZoom(1.3);

    expect(await loadTextZoom()).toBe(1.3);
  });

  it("returns null for non-finite stored values (corrupted store)", async () => {
    storeData.set("textZoom", Number.NaN);
    expect(await loadTextZoom()).toBeNull();

    storeData.set("textZoom", "1.2"); // wrong type
    expect(await loadTextZoom()).toBeNull();
  });

  it("persistTextZoom calls save() so the value lands on disk immediately", async () => {
    await persistTextZoom(0.9);

    expect(mockSave).toHaveBeenCalledTimes(1);
  });
});

describe("loadPersistedFolderPaths / persistFolderPaths", () => {
  beforeEach(() => {
    storeData.clear();
    mockGet.mockClear();
    mockSet.mockClear();
    mockSave.mockClear();
    mockInvoke.mockReset();
    // Default: every path the loader checks is treated as an existing
    // directory. Individual tests override per-path as needed.
    mockInvoke.mockResolvedValue(true);
  });
  afterEach(() => {
    storeData.clear();
  });

  it("returns an empty array when nothing has been persisted", async () => {
    expect(await loadPersistedFolderPaths()).toEqual([]);
  });

  it("round-trips a folder-paths list through persistFolderPaths + loadPersistedFolderPaths", async () => {
    await persistFolderPaths([
      "/Users/rhyd/Music/Logic",
      "/Users/rhyd/Side Projects",
    ]);

    expect(await loadPersistedFolderPaths()).toEqual([
      "/Users/rhyd/Music/Logic",
      "/Users/rhyd/Side Projects",
    ]);
  });

  it("filters non-string entries defensively (corrupted store)", async () => {
    storeData.set("folders", ["/ok.logicx", 42, null, "/also-ok"]);

    expect(await loadPersistedFolderPaths()).toEqual([
      "/ok.logicx",
      "/also-ok",
    ]);
  });

  it("drops paths whose targets no longer exist on disk", async () => {
    storeData.set("folders", ["/exists", "/gone"]);
    mockInvoke.mockImplementation(async (_cmd, args) =>
      (args as { path: string }).path === "/exists",
    );

    expect(await loadPersistedFolderPaths()).toEqual(["/exists"]);
  });

  it("returns an empty array when the stored value is not an array", async () => {
    storeData.set("folders", "not an array");
    expect(await loadPersistedFolderPaths()).toEqual([]);
  });

  it("persistFolderPaths calls save() immediately", async () => {
    await persistFolderPaths(["/a"]);

    expect(mockSave).toHaveBeenCalledTimes(1);
  });
});

describe("theme preference (lpx-explorer-6zn)", () => {
  beforeEach(() => {
    storeData.clear();
    mockGet.mockClear();
    mockSet.mockClear();
    mockSave.mockClear();
    mockInvoke.mockReset();
  });

  it("loadThemePreference returns null when nothing is persisted", async () => {
    expect(await loadThemePreference()).toBeNull();
  });

  it("loadThemePreference returns null when stored value isn't a valid mode", async () => {
    storeData.set("theme", "neon");
    expect(await loadThemePreference()).toBeNull();

    storeData.set("theme", 7);
    expect(await loadThemePreference()).toBeNull();
  });

  it("round-trips system / light / dark", async () => {
    await persistThemePreference("system");
    expect(await loadThemePreference()).toBe("system");

    await persistThemePreference("light");
    expect(await loadThemePreference()).toBe("light");

    await persistThemePreference("dark");
    expect(await loadThemePreference()).toBe("dark");
  });

  it("persistThemePreference calls save() immediately", async () => {
    await persistThemePreference("light");
    expect(mockSave).toHaveBeenCalledTimes(1);
  });
});

describe("parse cache versioning (lpx-explorer-ttb)", () => {
  beforeEach(() => {
    storeData.clear();
    mockGet.mockClear();
    mockSet.mockClear();
    mockSave.mockClear();
  });

  it("persistParseCacheEntry stamps parser_version automatically", async () => {
    const summary = makeSummary({});
    await persistParseCacheEntry("/x.logicx", {
      mtime_unix: 100,
      size_bytes: 50,
      summary,
    });

    // bxb: keys now include `#variant=N`; default variant is 0.
    const stored = storeData.get("/x.logicx#variant=0") as Record<string, unknown>;
    expect(stored.parser_version).toBe(6);
    expect(stored.mtime_unix).toBe(100);
    expect(stored.size_bytes).toBe(50);
  });

  it("loadParseCache skips entries with a stale or missing parser_version", async () => {
    // Older entry without the version field — this is what every
    // pre-ttb cache row looks like on disk.
    storeData.set("/old.logicx", {
      mtime_unix: 100,
      size_bytes: 50,
      summary: makeSummary({}),
    });
    // Older entry with an explicitly stale version.
    storeData.set("/older.logicx", {
      parser_version: 1,
      mtime_unix: 100,
      size_bytes: 50,
      summary: makeSummary({}),
    });
    // Current entry — written with the post-bxb composite-key format.
    await persistParseCacheEntry("/fresh.logicx", {
      mtime_unix: 100,
      size_bytes: 50,
      summary: makeSummary({}),
    });

    const cache = await loadParseCache();

    expect(cache.has("/old.logicx")).toBe(false);
    expect(cache.has("/older.logicx")).toBe(false);
    expect(cache.has("/fresh.logicx#variant=0")).toBe(true);
  });

  // ── lpx-explorer-bxb: composite cache key ──────────────────────────

  it("persistParseCacheEntry writes per-variant entries", async () => {
    await persistParseCacheEntry(
      "/multi.logicx",
      { mtime_unix: 100, size_bytes: 50, summary: makeSummary({}) },
      0,
    );
    await persistParseCacheEntry(
      "/multi.logicx",
      { mtime_unix: 200, size_bytes: 80, summary: makeSummary({}) },
      1,
    );

    expect(storeData.has("/multi.logicx#variant=0")).toBe(true);
    expect(storeData.has("/multi.logicx#variant=1")).toBe(true);
    const v0 = storeData.get("/multi.logicx#variant=0") as Record<string, unknown>;
    const v1 = storeData.get("/multi.logicx#variant=1") as Record<string, unknown>;
    expect(v0.mtime_unix).toBe(100);
    expect(v1.mtime_unix).toBe(200);
  });

  it("loadParseCache normalises pre-bxb keys (bare path) to variant=0", async () => {
    // Pre-bxb format: stored under the raw path. Carries the
    // current parser_version so it isn't filtered out by the version
    // check. After load, the composite key should appear in the map.
    storeData.set("/legacy.logicx", {
      parser_version: 6,
      mtime_unix: 50,
      size_bytes: 30,
      summary: makeSummary({}),
    });

    const cache = await loadParseCache();

    expect(cache.has("/legacy.logicx#variant=0")).toBe(true);
    expect(cache.has("/legacy.logicx")).toBe(false);
  });
});

describe("setThemeMenu (lpx-explorer-3x8)", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it("invokes the set_theme_menu Tauri command with the given mode", async () => {
    mockInvoke.mockResolvedValue(undefined);
    await setThemeMenu("light");

    expect(mockInvoke).toHaveBeenCalledWith("set_theme_menu", {
      theme: "light",
    });
  });
});
