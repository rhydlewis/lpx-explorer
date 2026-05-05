import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { RECENT_LIMIT, useLibraryStore } from "./library-store";

describe("useLibraryStore", () => {
  beforeEach(() => {
    useLibraryStore.getState().clear();
  });
  afterEach(() => {
    useLibraryStore.getState().clear();
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
});
