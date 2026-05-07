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
const mockLoad = vi.fn(async () => ({
  get: mockGet,
  set: mockSet,
  save: mockSave,
}));

vi.mock("@tauri-apps/plugin-store", () => ({
  load: () => mockLoad(),
}));

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: unknown) => mockInvoke(cmd, args),
}));

import {
  loadPersistedFolderPaths,
  loadPersistedLibrary,
  loadTextZoom,
  persistFolderPaths,
  persistLibrary,
  persistTextZoom,
  setRecentMenu,
} from "./persistence";

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

  it("returns an empty array when the stored value is not an array", async () => {
    storeData.set("folders", "not an array");
    expect(await loadPersistedFolderPaths()).toEqual([]);
  });

  it("persistFolderPaths calls save() immediately", async () => {
    await persistFolderPaths(["/a"]);

    expect(mockSave).toHaveBeenCalledTimes(1);
  });
});
