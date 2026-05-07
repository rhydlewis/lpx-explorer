import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getCurrentWebview } from "@tauri-apps/api/webview";

import { openProject } from "./lib/open-project";
import { pickAndAddFolder } from "./lib/open-folder";
import { routeDrop } from "./lib/drop-routing";
import {
  loadPersistedFolderPaths,
  loadPersistedLibrary,
  loadTextZoom,
  persistFolderPaths,
  persistLibrary,
  persistTextZoom,
  setRecentMenu,
} from "./lib/persistence";
import { useMediaQuery } from "./lib/use-media-query";
import { useAuRegistryStore } from "./store/au-registry-store";
import { useLibraryStore } from "./store/library-store";
import { useProjectStore } from "./store/project-store";
import { TEXT_ZOOM_STEP, useUIStore } from "./store/ui-store";
import { AppShell } from "./components/AppShell";
import { EmptyState } from "./components/EmptyState";
import { ProjectInspector } from "./components/Inspector/ProjectInspector";
import { PluginRail } from "./components/Inspector/PluginRail";
import { LibraryHome } from "./components/Library/LibraryHome";
import { LibraryRail } from "./components/Library/LibraryRail";

import "./App.css";

const HINT_DISMISS_MS = 4000;

/**
 * Subscribe to LibraryStore changes and persist the deltas — recents,
 * recent folders, and the active-folder paths. Extracted from the
 * App.tsx hydration effect to keep that effect's cognitive complexity
 * under the lint budget.
 */
function subscribeLibraryPersistence(persisted: {
  recent: ReadonlyArray<{ readonly path: string }>;
  recentFolders: ReadonlyArray<{ readonly path: string }>;
}): () => void {
  let prevRecent = persisted.recent;
  let prevRecentFolders = persisted.recentFolders;
  let prevFolderPaths = useLibraryStore
    .getState()
    .folders.map((f) => f.path);
  return useLibraryStore.subscribe((state) => {
    if (
      state.recent !== prevRecent ||
      state.recentFolders !== prevRecentFolders
    ) {
      prevRecent = state.recent;
      prevRecentFolders = state.recentFolders;
      void persistLibrary(state.recent, state.recentFolders);
      void setRecentMenu(state.recent, state.recentFolders);
    }
    const nextFolderPaths = state.folders.map((f) => f.path);
    if (folderPathsDiffer(prevFolderPaths, nextFolderPaths)) {
      prevFolderPaths = nextFolderPaths;
      void persistFolderPaths(nextFolderPaths);
    }
  });
}

function folderPathsDiffer(
  prev: ReadonlyArray<string>,
  next: ReadonlyArray<string>,
): boolean {
  if (prev.length !== next.length) return true;
  for (let i = 0; i < prev.length; i += 1) {
    if (prev[i] !== next[i]) return true;
  }
  return false;
}

/**
 * If `~/Music/Logic` exists, register it as a library folder. Used on
 * truly-first launch only (gated upstream by recents + recentFolders
 * both empty). The `isCancelled` thunk lets the caller abort if the
 * App component unmounts mid-flight.
 */
async function maybeAutoAddDefaultLibrary(
  isCancelled: () => boolean,
): Promise<void> {
  const home = await invoke<string | null>("home_dir");
  if (home === null || isCancelled()) return;
  const defaultLib = `${home}/Music/Logic`;
  const exists = await invoke<boolean>("is_dir", { path: defaultLib });
  if (!exists || isCancelled()) return;
  await useLibraryStore.getState().addFolder(defaultLib);
}
const REPORT_ISSUE_URL = "https://github.com/rhydlewis/lpx-explorer/issues";
const BUY_ME_COFFEE_URL = "https://buymeacoffee.com/rhyd";
/**
 * Below this viewport width the right Plug-ins rail collapses to a
 * topbar toggle — at narrower widths a 320px rail crowds the
 * Inspector main column past usability. Picked empirically against
 * the existing `--rail-width` (260px) plus `--plugin-rail-width`
 * (320px) plus a working min-width for the main pane (~520px).
 */
const RIGHT_RAIL_BREAKPOINT_PX = 1100;

function App() {
  const status = useProjectStore((s) => s.current);
  const recentCount = useLibraryStore((s) => s.recent.length);
  const folderCount = useLibraryStore((s) => s.folders.length);
  const folders = useLibraryStore((s) => s.folders);
  const auRegistryStatus = useAuRegistryStore((s) => s.status);
  const pluginRailOpen = useUIStore((s) => s.pluginRailOpen);
  const togglePluginRailOpen = useUIStore((s) => s.togglePluginRailOpen);
  const selectedLibraryFolder = useUIStore((s) => s.selectedLibraryFolder);
  const textZoom = useUIStore((s) => s.textZoom);
  const isNarrow = useMediaQuery(`(max-width: ${RIGHT_RAIL_BREAKPOINT_PX - 1}px)`);
  const [hint, setHint] = useState<string | null>(null);

  async function pickProject() {
    const selection = await open({
      directory: false,
      multiple: false,
      title: "Select a .logicx project bundle",
      filters: [{ name: "Logic Pro project", extensions: ["logicx"] }],
    });
    if (typeof selection !== "string") {
      return;
    }
    await openProject(selection);
  }

  useEffect(() => {
    void useAuRegistryStore.getState().autoScanIfAbsent();
  }, []);

  // Text zoom — Cmd-+ / Cmd-- / Cmd-0. Hydrate from disk on mount, then
  // sync the CSS custom property + persist on every change. Keyboard
  // listener uses metaKey for Cmd; treats '=' (the unshifted '+') and
  // 'Equal'/'Plus' as zoom-in.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const persisted = await loadTextZoom();
      if (cancelled || persisted === null) return;
      useUIStore.getState().setTextZoom(persisted);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty("--text-zoom", String(textZoom));
    void persistTextZoom(textZoom);
  }, [textZoom]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.metaKey || e.altKey || e.ctrlKey) return;
      // Cmd-+ (also matches '=' on US layouts since '+' is shift-=) → zoom in
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        useUIStore.getState().bumpTextZoom(TEXT_ZOOM_STEP);
        return;
      }
      if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        useUIStore.getState().bumpTextZoom(-TEXT_ZOOM_STEP);
        return;
      }
      if (e.key === "0") {
        e.preventDefault();
        useUIStore.getState().resetTextZoom();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Persistence: hydrate from disk, then sync writes + native menu on every
  // recent-list change. Subscribes AFTER hydration so the initial fill
  // doesn't echo straight back to disk. The native macOS File menu's
  // "Open Recent Project" / "Open Recent Folder" submenus are rebuilt on
  // each change via `set_recent_menu` (Tauri command).
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    let cancelled = false;

    void (async () => {
      const persisted = await loadPersistedLibrary();
      if (cancelled) {
        return;
      }
      useLibraryStore.getState().hydrate(persisted);
      await setRecentMenu(persisted.recent, persisted.recentFolders);
      if (cancelled) {
        return;
      }

      // Restore active folders from disk — re-runs scan_folder for each
      // path so the project lists pick up new .logicx files added since
      // last quit (lpx-explorer-vn5). Awaited sequentially so the
      // library-browse target setter below can pick the first folder.
      const persistedFolderPaths = await loadPersistedFolderPaths();
      if (cancelled) return;
      for (const path of persistedFolderPaths) {
        if (cancelled) return;
        await useLibraryStore.getState().addFolder(path);
      }

      // Per lpx-explorer-3mo + vn5: auto-add ~/Music/Logic on truly-first
      // launch (no recents AND no recent folders). Once the user has
      // interacted at all the gate stays closed forever.
      const isFirstLaunch =
        persisted.recent.length === 0 &&
        persisted.recentFolders.length === 0;
      if (isFirstLaunch) {
        await maybeAutoAddDefaultLibrary(() => cancelled);
      }
      if (cancelled) return;

      // If exactly one folder is in the rail (auto-added or restored),
      // surface its tile grid by default. Multiple folders means the
      // user has organised their library — let them pick which one to
      // browse explicitly.
      const initialFolders = useLibraryStore.getState().folders;
      if (initialFolders.length === 1) {
        useUIStore
          .getState()
          .setSelectedLibraryFolder(initialFolders[0]!.path);
      }

      unsubscribe = subscribeLibraryPersistence(persisted);
    })();

    return () => {
      cancelled = true;
      if (unsubscribe !== null) {
        unsubscribe();
      }
    };
  }, []);

  useEffect(() => {
    const isDir = (path: string): Promise<boolean> =>
      invoke<boolean>("is_dir", { path });
    const unlistenPromise = getCurrentWebview().onDragDropEvent(async (event) => {
      if (event.payload.type !== "drop") {
        return;
      }
      const action = await routeDrop(event.payload.paths, isDir);
      if (action.kind === "open-project") {
        void openProject(action.path);
      } else if (action.kind === "open-folder") {
        void useLibraryStore.getState().addFolder(action.path);
      } else {
        setHint(action.reason);
      }
    });
    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  useEffect(() => {
    if (hint === null) {
      return;
    }
    const timer = setTimeout(() => setHint(null), HINT_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [hint]);

  useEffect(() => {
    const unlistenPromise = listen<string>("menu-event", (event) => {
      const id = event.payload;
      if (id === "menu_open_project") {
        void pickProject();
      } else if (id === "menu_open_folder") {
        void pickAndAddFolder();
      } else if (id === "clear_recent_projects") {
        useLibraryStore.getState().clearRecent();
      } else if (id === "clear_recent_folders") {
        useLibraryStore.getState().clearRecentFolders();
      } else if (id === "help_report_issue") {
        void openUrl(REPORT_ISSUE_URL);
      } else if (id === "help_buy_me_coffee") {
        void openUrl(BUY_ME_COFFEE_URL);
      } else if (id.startsWith("recent_project::")) {
        void openProject(id.slice("recent_project::".length));
      } else if (id.startsWith("recent_folder::")) {
        void useLibraryStore
          .getState()
          .addFolder(id.slice("recent_folder::".length));
      }
    });
    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  const rail = recentCount > 0 || folderCount > 0 ? <LibraryRail /> : undefined;

  // Library-browse state: idle project + a selected library folder that
  // exists in the rail. Falls through to EmptyState when no folder is
  // selected (or the selected one was removed). Per lpx-explorer-1di.
  const browseFolder =
    status.kind === "idle" && selectedLibraryFolder !== null
      ? folders.find((f) => f.path === selectedLibraryFolder)
      : undefined;

  let main;
  if (status.kind === "idle") {
    main = browseFolder !== undefined ? (
      <LibraryHome folder={browseFolder} />
    ) : (
      <EmptyState
        onPickProject={pickProject}
        onOpenFolder={() => void pickAndAddFolder()}
        auRegistryStatus={auRegistryStatus}
      />
    );
  } else {
    main = <ProjectInspector status={status} />;
  }

  // Right rail is project-scoped — only visible once a project is
  // loaded. At narrow widths the rail collapses to a topbar toggle so
  // the main column has room; the toggle's open/closed state lives in
  // ui-store (in-session) per lpx-explorer-fom.
  const projectLoaded = status.kind === "loaded";
  const rightRailVisible = projectLoaded && (!isNarrow || pluginRailOpen);
  const rightRail = rightRailVisible ? (
    <PluginRail summary={status.summary} />
  ) : undefined;

  // Topbar shows the rail toggle only when narrow + a project is loaded.
  // Above the breakpoint the rail is always visible, so a toggle would
  // be cosmetic; below it the user needs a way back to the rail.
  const topBar =
    isNarrow && projectLoaded ? (
      <button
        type="button"
        onClick={togglePluginRailOpen}
        aria-pressed={pluginRailOpen}
        className="plugin-rail-toggle"
      >
        {pluginRailOpen ? "Hide plug-ins" : "Show plug-ins"}
      </button>
    ) : undefined;

  return (
    <>
      <AppShell topBar={topBar} rail={rail} rightRail={rightRail} main={main} />
      {hint !== null && (
        <div role="status" aria-live="polite" className="drop-hint">
          {hint}
        </div>
      )}
    </>
  );
}

export default App;
