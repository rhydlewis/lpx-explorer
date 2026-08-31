import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));
vi.mock("./open-project", () => ({ openProject: vi.fn() }));
vi.mock("./open-folder", () => ({ pickAndAddFolder: vi.fn() }));
vi.mock("./export-action", () => ({ runReadmeExport: vi.fn() }));

import { openUrl } from "@tauri-apps/plugin-opener";

import { useUIStore } from "../store/ui-store";

import { dispatchMenuEvent, REPORT_ISSUE_URL } from "./menu-dispatch";
import { openProject } from "./open-project";

const deps = { pickProject: vi.fn(), setHint: vi.fn() };

describe("dispatchMenuEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUIStore.setState({ searchEngine: "google", theme: "system" });
  });

  it("routes an exact id to its handler", () => {
    dispatchMenuEvent("menu_open_project", deps);

    expect(deps.pickProject).toHaveBeenCalledTimes(1);
  });

  it("routes a theme id to the ui store", () => {
    dispatchMenuEvent("theme_dark", deps);

    expect(useUIStore.getState().theme).toBe("dark");
  });

  it("routes a help id to the opener", () => {
    dispatchMenuEvent("help_report_issue", deps);

    expect(openUrl).toHaveBeenCalledWith(REPORT_ISSUE_URL);
  });

  it("routes a search-engine pick to the ui store", () => {
    // lpx-explorer-tmo — View → Search With.
    dispatchMenuEvent("search_engine::duckduckgo", deps);

    expect(useUIStore.getState().searchEngine).toBe("duckduckgo");
  });

  it("ignores a search-engine id the frontend doesn't know", () => {
    // The native menu list and the TS engine list could drift; an
    // unknown id must not write junk into the persisted preference.
    dispatchMenuEvent("search_engine::askjeeves", deps);

    expect(useUIStore.getState().searchEngine).toBe("google");
  });

  it("routes a prefixed recent-project id with its path payload", () => {
    dispatchMenuEvent("recent_project::/Users/x/a.logicx", deps);

    expect(openProject).toHaveBeenCalledWith("/Users/x/a.logicx");
  });

  it("ignores an unknown id rather than throwing", () => {
    // A menu item can ship ahead of its handler.
    expect(() => dispatchMenuEvent("menu_does_not_exist", deps)).not.toThrow();
    expect(deps.pickProject).not.toHaveBeenCalled();
  });
});
