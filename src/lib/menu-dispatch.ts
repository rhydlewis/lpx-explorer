import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";

import { useLibraryStore } from "../store/library-store";
import { useProjectStore } from "../store/project-store";
import { useUIStore } from "../store/ui-store";

import { runReadmeExport } from "./export-action";
import { openProject } from "./open-project";
import { pickAndAddFolder } from "./open-folder";
import { isSearchEngineId } from "./search-engines";

export const REPORT_ISSUE_URL =
  "https://github.com/rhydlewis/lpx-explorer/issues";
export const BUY_ME_COFFEE_URL = "https://buymeacoffee.com/rhyd";

/**
 * The two things the native menu can't do for itself: open the file
 * picker (needs the component's own dialog flow) and report a result
 * back to the user (needs the transient hint banner).
 */
export interface MenuDispatchDeps {
  readonly pickProject: () => void;
  readonly setHint: (message: string) => void;
}

/**
 * Exact-match menu items. A lookup table rather than an `else if` chain
 * — the chain outgrew the complexity budget once View → Search With
 * landed, and a table makes "which ids are handled" readable at a
 * glance.
 */
function exactHandlers(
  deps: MenuDispatchDeps,
): Readonly<Record<string, () => void>> {
  return {
    menu_open_project: () => deps.pickProject(),
    menu_open_folder: () => void pickAndAddFolder(),
    clear_recent_projects: () => useLibraryStore.getState().clearRecent(),
    clear_recent_folders: () => useLibraryStore.getState().clearRecentFolders(),
    help_report_issue: () => void openUrl(REPORT_ISSUE_URL),
    help_buy_me_coffee: () => void openUrl(BUY_ME_COFFEE_URL),
    theme_system: () => useUIStore.getState().setTheme("system"),
    theme_light: () => useUIStore.getState().setTheme("light"),
    theme_dark: () => useUIStore.getState().setTheme("dark"),
    menu_open_in_logic: () => openCurrentInLogic(),
    menu_export_readme: () => exportReadme(deps.setHint),
  };
}

/** Prefixed menu items, where the id carries a payload after `::`. */
const PREFIXES: ReadonlyArray<readonly [string, (arg: string) => void]> = [
  [
    "search_engine::",
    (engine) => {
      // Guard rather than cast: the menu and the engine list could drift.
      if (isSearchEngineId(engine)) {
        useUIStore.getState().setSearchEngine(engine);
      }
    },
  ],
  ["recent_project::", (path) => void openProject(path)],
  ["recent_folder::", (path) => void useLibraryStore.getState().addFolder(path)],
];

/**
 * Route one `menu-event` payload to its action. Unknown ids are
 * ignored — a menu item can ship ahead of its handler.
 */
export function dispatchMenuEvent(id: string, deps: MenuDispatchDeps): void {
  const exact = exactHandlers(deps)[id];
  if (exact) {
    exact();
    return;
  }
  for (const [prefix, handle] of PREFIXES) {
    if (id.startsWith(prefix)) {
      handle(id.slice(prefix.length));
      return;
    }
  }
}

function openCurrentInLogic(): void {
  const cur = useProjectStore.getState().current;
  if (cur.kind === "loaded") {
    void invoke("open_in_logic", { path: cur.path });
  }
}

function exportReadme(setHint: (message: string) => void): void {
  void runReadmeExport().then((result) => {
    if (result.kind === "written") {
      const name = result.path.split("/").pop() ?? result.path;
      setHint(`Exported README to ${name}`);
    } else if (result.kind === "error") {
      setHint(`Export failed: ${result.message}`);
    }
    // 'no-project' and 'cancelled' are silent — nothing to report.
  });
}
