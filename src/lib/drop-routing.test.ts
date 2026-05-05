import { describe, expect, it } from "vitest";

import { routeDrop } from "./drop-routing";

describe("routeDrop", () => {
  it("opens a single .logicx as a project", () => {
    const action = routeDrop(["/Users/rhyd/Music/Logic/arp strings.logicx"]);

    expect(action).toEqual({
      kind: "open-project",
      path: "/Users/rhyd/Music/Logic/arp strings.logicx",
    });
  });

  it("matches .logicx case-insensitively", () => {
    const action = routeDrop(["/path/to/Demo.LOGICX"]);

    expect(action.kind).toBe("open-project");
  });

  it("strips a trailing slash before opening", () => {
    const action = routeDrop(["/Users/rhyd/Music/Logic/song.logicx/"]);

    expect(action).toEqual({
      kind: "open-project",
      path: "/Users/rhyd/Music/Logic/song.logicx",
    });
  });

  it("rejects non-.logicx files with an explanatory reason", () => {
    const action = routeDrop(["/path/to/song.wav"]);

    expect(action.kind).toBe("unsupported");
    if (action.kind === "unsupported") {
      expect(action.reason).toMatch(/\.logicx/i);
    }
  });

  it("rejects multi-file drops", () => {
    const action = routeDrop([
      "/path/to/a.logicx",
      "/path/to/b.logicx",
    ]);

    expect(action.kind).toBe("unsupported");
    if (action.kind === "unsupported") {
      expect(action.reason).toMatch(/one project/i);
    }
  });

  it("rejects an empty drop", () => {
    const action = routeDrop([]);

    expect(action.kind).toBe("unsupported");
  });
});
