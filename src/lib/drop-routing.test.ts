import { describe, expect, it, vi } from "vitest";

import { routeDrop } from "./drop-routing";

const isDirAlways = vi.fn().mockResolvedValue(true);
const isDirNever = vi.fn().mockResolvedValue(false);

describe("routeDrop", () => {
  it("opens a single .logicx as a project", async () => {
    const action = await routeDrop(
      ["/Users/rhyd/Music/Logic/arp strings.logicx"],
      isDirNever,
    );

    expect(action).toEqual({
      kind: "open-project",
      path: "/Users/rhyd/Music/Logic/arp strings.logicx",
    });
  });

  it("matches .logicx case-insensitively", async () => {
    const action = await routeDrop(["/path/to/Demo.LOGICX"], isDirNever);

    expect(action.kind).toBe("open-project");
  });

  it("strips a trailing slash before opening", async () => {
    const action = await routeDrop(
      ["/Users/rhyd/Music/Logic/song.logicx/"],
      isDirNever,
    );

    expect(action).toEqual({
      kind: "open-project",
      path: "/Users/rhyd/Music/Logic/song.logicx",
    });
  });

  it("opens a non-.logicx directory as a folder", async () => {
    const action = await routeDrop(
      ["/Users/rhyd/Music/Logic"],
      isDirAlways,
    );

    expect(action).toEqual({
      kind: "open-folder",
      path: "/Users/rhyd/Music/Logic",
    });
  });

  it("rejects a non-.logicx file with an explanatory reason", async () => {
    const action = await routeDrop(["/path/to/song.wav"], isDirNever);

    expect(action.kind).toBe("unsupported");
    if (action.kind === "unsupported") {
      expect(action.reason).toMatch(/\.logicx|folder/i);
    }
  });

  it("rejects multi-item drops", async () => {
    const action = await routeDrop(
      ["/path/to/a.logicx", "/path/to/b.logicx"],
      isDirNever,
    );

    expect(action.kind).toBe("unsupported");
    if (action.kind === "unsupported") {
      expect(action.reason).toMatch(/one project|folder/i);
    }
  });

  it("rejects an empty drop", async () => {
    const action = await routeDrop([], isDirNever);

    expect(action.kind).toBe("unsupported");
  });
});
