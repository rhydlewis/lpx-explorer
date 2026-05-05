import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { scanFolder } from "../lib/library";

import { RECENT_LIMIT, useLibraryStore } from "./library-store";
import { useProjectStore } from "./project-store";

vi.mock("../lib/library", () => ({
  scanFolder: vi.fn(),
}));

vi.mock("../lib/parse", () => ({
  parseProject: vi.fn().mockResolvedValue({ fingerprints: [] }),
}));

const mockedScan = vi.mocked(scanFolder);

describe("useLibraryStore", () => {
  beforeEach(() => {
    useLibraryStore.getState().clear();
    useProjectStore.getState().clear();
    mockedScan.mockReset();
  });
  afterEach(() => {
    useLibraryStore.getState().clear();
    useProjectStore.getState().clear();
  });

  it("starts with an empty recent list", () => {
    expect(useLibraryStore.getState().recent).toEqual([]);
  });

  it("adds a recent entry with the project name extracted from the path", () => {
    useLibraryStore.getState().addRecent(
      "/Users/rhyd/Music/Logic/arp strings.logicx",
      1_700_000_000_000,
    );

    expect(useLibraryStore.getState().recent).toEqual([
      {
        path: "/Users/rhyd/Music/Logic/arp strings.logicx",
        name: "arp strings",
        lastLoadedMs: 1_700_000_000_000,
      },
    ]);
  });

  it("dedupes by path — re-adding moves the entry to the top with the new timestamp", () => {
    const store = useLibraryStore.getState();
    store.addRecent("/a.logicx", 1);
    store.addRecent("/b.logicx", 2);
    store.addRecent("/a.logicx", 3);

    const recent = useLibraryStore.getState().recent;
    expect(recent).toHaveLength(2);
    expect(recent[0]?.path).toBe("/a.logicx");
    expect(recent[0]?.lastLoadedMs).toBe(3);
    expect(recent[1]?.path).toBe("/b.logicx");
  });

  it("caps the list at RECENT_LIMIT — oldest drops off", () => {
    const store = useLibraryStore.getState();
    for (let i = 0; i < RECENT_LIMIT + 3; i++) {
      store.addRecent(`/project-${i}.logicx`, i);
    }

    const recent = useLibraryStore.getState().recent;
    expect(recent).toHaveLength(RECENT_LIMIT);
    // Newest (highest i) at the top, oldest dropped from the tail
    expect(recent[0]?.path).toBe(`/project-${RECENT_LIMIT + 2}.logicx`);
    expect(recent.find((r) => r.path === "/project-0.logicx")).toBeUndefined();
  });

  it("removeRecent removes the matching entry without disturbing siblings", () => {
    const store = useLibraryStore.getState();
    store.addRecent("/a.logicx", 1);
    store.addRecent("/b.logicx", 2);
    store.addRecent("/c.logicx", 3);

    store.removeRecent("/b.logicx");

    const recent = useLibraryStore.getState().recent;
    expect(recent.map((r) => r.path)).toEqual([
      "/c.logicx",
      "/a.logicx",
    ]);
  });

  it("clear empties the recent list", () => {
    useLibraryStore.getState().addRecent("/a.logicx", 1);
    useLibraryStore.getState().clear();

    expect(useLibraryStore.getState().recent).toEqual([]);
  });

  it("starts with an empty query", () => {
    expect(useLibraryStore.getState().query).toBe("");
  });

  it("setQuery stores the user's filter input", () => {
    useLibraryStore.getState().setQuery("strings");

    expect(useLibraryStore.getState().query).toBe("strings");
  });

  it("clear resets the query as well", () => {
    useLibraryStore.getState().setQuery("foo");

    useLibraryStore.getState().clear();

    expect(useLibraryStore.getState().query).toBe("");
  });

  // ─── Folder slice ───────────────────────────────────────────────────

  it("starts with no folders", () => {
    expect(useLibraryStore.getState().folders).toEqual([]);
  });

  it("addFolder appends the folder and immediately starts a scan", async () => {
    mockedScan.mockImplementationOnce(async (_path, onProject) => {
      onProject?.("/Music/Logic/a.logicx");
    });

    await useLibraryStore.getState().addFolder("/Music/Logic");

    const folders = useLibraryStore.getState().folders;
    expect(folders).toHaveLength(1);
    expect(folders[0]?.path).toBe("/Music/Logic");
    expect(folders[0]?.status).toEqual({ kind: "done" });
    expect(folders[0]?.projects).toEqual(["/Music/Logic/a.logicx"]);
    expect(mockedScan).toHaveBeenCalledWith(
      "/Music/Logic",
      expect.any(Function),
    );
  });

  it("addFolder is idempotent — re-adding an existing folder does nothing", async () => {
    mockedScan.mockImplementation(async () => {
      // no projects emitted
    });
    await useLibraryStore.getState().addFolder("/Music/Logic");
    mockedScan.mockClear();

    await useLibraryStore.getState().addFolder("/Music/Logic");

    expect(useLibraryStore.getState().folders).toHaveLength(1);
    expect(mockedScan).not.toHaveBeenCalled();
  });

  it("appends discovered projects progressively as onProject is called", async () => {
    let onProjectRef: ((path: string) => void) | undefined;
    let resolveScan!: () => void;
    mockedScan.mockImplementationOnce(async (_path, onProject) => {
      onProjectRef = onProject;
      await new Promise<void>((r) => {
        resolveScan = r;
      });
    });

    const scanPromise = useLibraryStore.getState().addFolder("/Music/Logic");
    expect(useLibraryStore.getState().folders[0]?.projects).toEqual([]);

    onProjectRef?.("/Music/Logic/a.logicx");
    expect(useLibraryStore.getState().folders[0]?.projects).toEqual([
      "/Music/Logic/a.logicx",
    ]);

    onProjectRef?.("/Music/Logic/b.logicx");
    onProjectRef?.("/Music/Logic/c.logicx");
    expect(useLibraryStore.getState().folders[0]?.projects).toEqual([
      "/Music/Logic/a.logicx",
      "/Music/Logic/b.logicx",
      "/Music/Logic/c.logicx",
    ]);
    // Status stays "scanning" until the wrapper resolves.
    expect(useLibraryStore.getState().folders[0]?.status).toEqual({
      kind: "scanning",
    });

    resolveScan();
    await scanPromise;

    expect(useLibraryStore.getState().folders[0]?.status).toEqual({ kind: "done" });
  });

  it("startScan sets scanning status while the scan is in flight", async () => {
    let resolveScan!: () => void;
    mockedScan.mockImplementationOnce(async () => {
      await new Promise<void>((r) => {
        resolveScan = r;
      });
    });

    const scanPromise = useLibraryStore.getState().addFolder("/Music/Logic");

    expect(useLibraryStore.getState().folders[0]?.status).toEqual({
      kind: "scanning",
    });

    resolveScan();
    await scanPromise;

    expect(useLibraryStore.getState().folders[0]?.status).toEqual({ kind: "done" });
  });

  it("startScan transitions to error when scanFolder rejects", async () => {
    mockedScan.mockRejectedValueOnce(new Error("permission denied"));

    await useLibraryStore.getState().addFolder("/restricted");

    expect(useLibraryStore.getState().folders[0]?.status).toEqual({
      kind: "error",
      message: "permission denied",
    });
  });

  it("extracts .message from a Tauri-style ScanError object", async () => {
    // Tauri serializes #[derive(thiserror::Error, Serialize)] enums to
    // {kind, message}; the rejection isn't an Error instance, so the
    // store has to dig the message out by hand.
    mockedScan.mockRejectedValueOnce({
      kind: "ReadFailed",
      message: "/restricted: Permission denied (os error 13)",
    });

    await useLibraryStore.getState().addFolder("/restricted");

    expect(useLibraryStore.getState().folders[0]?.status).toEqual({
      kind: "error",
      message: "/restricted: Permission denied (os error 13)",
    });
  });

  it("cancelScan resets the entry to idle with empty projects", async () => {
    mockedScan.mockImplementationOnce(async (_path, onProject) => {
      onProject?.("/x.logicx");
      onProject?.("/y.logicx");
    });
    await useLibraryStore.getState().addFolder("/Music/Logic");
    expect(useLibraryStore.getState().folders[0]?.projects).toHaveLength(2);

    useLibraryStore.getState().cancelScan("/Music/Logic");

    expect(useLibraryStore.getState().folders[0]?.status).toEqual({ kind: "idle" });
    expect(useLibraryStore.getState().folders[0]?.projects).toEqual([]);
  });

  it("removeFolder clears the loaded project if it came from that folder", async () => {
    mockedScan.mockImplementationOnce(async (_path, onProject) => {
      onProject?.("/Music/Logic/song.logicx");
    });
    await useLibraryStore.getState().addFolder("/Music/Logic");
    await useProjectStore.getState().select("/Music/Logic/song.logicx");
    expect(useProjectStore.getState().current.kind).toBe("loaded");

    useLibraryStore.getState().removeFolder("/Music/Logic");

    expect(useProjectStore.getState().current).toEqual({ kind: "idle" });
  });

  it("removeFolder leaves the loaded project alone if it came from elsewhere", async () => {
    mockedScan.mockImplementation(async () => {
      // empty scan
    });
    await useLibraryStore.getState().addFolder("/Music/Logic");
    await useProjectStore.getState().select("/Other/song.logicx");
    expect(useProjectStore.getState().current.kind).toBe("loaded");

    useLibraryStore.getState().removeFolder("/Music/Logic");

    const status = useProjectStore.getState().current;
    expect(status.kind).toBe("loaded");
    if (status.kind === "loaded") {
      expect(status.path).toBe("/Other/song.logicx");
    }
  });

  it("removeFolder filters by path without disturbing siblings", async () => {
    mockedScan.mockImplementation(async () => {
      // empty scan
    });
    await useLibraryStore.getState().addFolder("/a");
    await useLibraryStore.getState().addFolder("/b");
    await useLibraryStore.getState().addFolder("/c");

    useLibraryStore.getState().removeFolder("/b");

    expect(
      useLibraryStore.getState().folders.map((f) => f.path),
    ).toEqual(["/a", "/c"]);
  });

  it("clear empties the folder list as well", async () => {
    mockedScan.mockImplementationOnce(async () => {
      // empty scan
    });
    await useLibraryStore.getState().addFolder("/x");

    useLibraryStore.getState().clear();

    expect(useLibraryStore.getState().folders).toEqual([]);
  });

  // ─── Recent folders + clear actions + hydrate ───────────────────────

  it("addRecentFolder records the folder with its basename", () => {
    useLibraryStore.getState().addRecentFolder(
      "/Users/rhyd/Music/Logic",
      1_700_000_000_000,
    );

    expect(useLibraryStore.getState().recentFolders).toEqual([
      { path: "/Users/rhyd/Music/Logic", name: "Logic", lastLoadedMs: 1_700_000_000_000 },
    ]);
  });

  it("addRecentFolder dedupes by path with most-recent ordering", () => {
    const store = useLibraryStore.getState();
    store.addRecentFolder("/a", 1);
    store.addRecentFolder("/b", 2);
    store.addRecentFolder("/a", 3);

    const folders = useLibraryStore.getState().recentFolders;
    expect(folders.map((f) => f.path)).toEqual(["/a", "/b"]);
    expect(folders[0]?.lastLoadedMs).toBe(3);
  });

  it("addRecentFolder caps at RECENT_LIMIT — oldest drops", () => {
    const store = useLibraryStore.getState();
    for (let i = 0; i < RECENT_LIMIT + 3; i++) {
      store.addRecentFolder(`/folder-${i}`, i);
    }

    const folders = useLibraryStore.getState().recentFolders;
    expect(folders).toHaveLength(RECENT_LIMIT);
    expect(folders[0]?.path).toBe(`/folder-${RECENT_LIMIT + 2}`);
    expect(folders.find((f) => f.path === "/folder-0")).toBeUndefined();
  });

  it("addFolder also bumps the matching recentFolders entry", async () => {
    mockedScan.mockImplementation(async () => {
      // empty scan
    });

    await useLibraryStore.getState().addFolder("/Music/Logic");

    expect(
      useLibraryStore.getState().recentFolders.map((f) => f.path),
    ).toEqual(["/Music/Logic"]);
  });

  it("re-opening a folder via addFolder re-orders recentFolders most-recent-first", async () => {
    mockedScan.mockImplementation(async () => {
      // empty scan
    });
    await useLibraryStore.getState().addFolder("/a");
    await useLibraryStore.getState().addFolder("/b");

    // Re-open /a — re-add path is idempotent for the rail (still 2 folders),
    // but recentFolders should bump /a to the front.
    await useLibraryStore.getState().addFolder("/a");

    expect(
      useLibraryStore.getState().recentFolders.map((f) => f.path),
    ).toEqual(["/a", "/b"]);
  });

  it("clearRecent wipes recent without touching folders or recentFolders", async () => {
    const store = useLibraryStore.getState();
    store.addRecent("/proj.logicx", 1);
    store.addRecentFolder("/Music", 2);

    store.clearRecent();

    expect(useLibraryStore.getState().recent).toEqual([]);
    expect(useLibraryStore.getState().recentFolders).toHaveLength(1);
  });

  it("clearRecentFolders wipes recentFolders without touching recent or rail folders", async () => {
    mockedScan.mockImplementation(async () => {
      // empty scan
    });
    await useLibraryStore.getState().addFolder("/Music/Logic");
    useLibraryStore.getState().addRecent("/proj.logicx", 1);

    useLibraryStore.getState().clearRecentFolders();

    expect(useLibraryStore.getState().recentFolders).toEqual([]);
    expect(useLibraryStore.getState().recent).toHaveLength(1);
    expect(useLibraryStore.getState().folders).toHaveLength(1);
  });

  it("hydrate replaces recent + recentFolders in one shot", () => {
    useLibraryStore.getState().hydrate({
      recent: [{ path: "/p.logicx", name: "p", lastLoadedMs: 1 }],
      recentFolders: [{ path: "/f", name: "f", lastLoadedMs: 2 }],
    });

    const state = useLibraryStore.getState();
    expect(state.recent).toEqual([
      { path: "/p.logicx", name: "p", lastLoadedMs: 1 },
    ]);
    expect(state.recentFolders).toEqual([
      { path: "/f", name: "f", lastLoadedMs: 2 },
    ]);
  });

  it("hydrate truncates oversized lists to RECENT_LIMIT", () => {
    const oversized = Array.from({ length: RECENT_LIMIT + 5 }, (_, i) => ({
      path: `/p-${i}.logicx`,
      name: `p-${i}`,
      lastLoadedMs: i,
    }));

    useLibraryStore.getState().hydrate({
      recent: oversized,
      recentFolders: oversized,
    });

    expect(useLibraryStore.getState().recent).toHaveLength(RECENT_LIMIT);
    expect(useLibraryStore.getState().recentFolders).toHaveLength(RECENT_LIMIT);
  });

  it("clear also resets recentFolders", () => {
    useLibraryStore.getState().addRecentFolder("/x", 1);

    useLibraryStore.getState().clear();

    expect(useLibraryStore.getState().recentFolders).toEqual([]);
  });
});
