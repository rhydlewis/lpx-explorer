import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getCurrentWebview } from "@tauri-apps/api/webview";

import { runLibraryHydration } from "./lib/library-hydration";
import {
  hydrateParseCacheAsync,
  installScanIdleGate,
} from "./lib/scan-scheduler";
import { installThemeWatcher } from "./lib/theme";
import { openProject } from "./lib/open-project";
import { pickAndAddFolder } from "./lib/open-folder";
import { routeDrop } from "./lib/drop-routing";
import {
  loadShowFingerprints,
  loadTextZoom,
  loadThemePreference,
  persistShowFingerprints,
  persistTextZoom,
  persistThemePreference,
  setThemeMenu,
} from "./lib/persistence";
import { useMediaQuery } from "./lib/use-media-query";
import { useAuRegistryStore } from "./store/au-registry-store";
import { useLibraryStore } from "./store/library-store";
import { useProjectStore } from "./store/project-store";
import { TEXT_ZOOM_STEP, useUIStore } from "./store/ui-store";
import { AppShell } from "./components/AppShell";
import { EmptyState } from "./components/EmptyState";
import { ScanBanner } from "./components/ScanBanner";
import { ProjectInspector } from "./components/Inspector/ProjectInspector";
import { PluginRail } from "./components/Inspector/PluginRail";
import { LibraryHome } from "./components/Library/LibraryHome";
import { LibraryRail } from "./components/Library/LibraryRail";

import "./App.css";

const HINT_DISMISS_MS = 4000;
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
  const showFingerprints = useUIStore((s) => s.pluginRailShowFingerprints);
  const theme = useUIStore((s) => s.theme);
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

  useEffect(() => hydrateParseCacheAsync(), []);
  useEffect(() => installScanIdleGate(), []);
  useEffect(() => installThemeWatcher(), []);

  // Hydration gates (lpx-explorer-04y). Each persisted preference
  // has a hydrate-then-persist effect pair. The persist effect MUST
  // wait for hydration to finish — otherwise the synchronous mount
  // commit overwrites disk with the ui-store default value before
  // the async loadXxx() resolves. The ref flips to true once the
  // hydrate effect has decided whether to setXxx the persisted value.
  const themeHydrated = useRef(false);
  const textZoomHydrated = useRef(false);
  const showFingerprintsHydrated = useRef(false);

  // Theme preference (lpx-explorer-6zn) — hydrate once on mount,
  // persist on every change. The watcher above re-applies the
  // resolved theme to documentElement when the store updates, so the
  // persisted value flows through to the DOM without extra wiring.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const persisted = await loadThemePreference();
      if (cancelled) return;
      themeHydrated.current = true;
      if (persisted !== null) useUIStore.getState().setTheme(persisted);
    })();
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!themeHydrated.current) return;
    void persistThemePreference(theme);
    void setThemeMenu(theme);
  }, [theme]);

  // Text zoom — Cmd-+ / Cmd-- / Cmd-0. Hydrate from disk on mount, then
  // sync the CSS custom property + persist on every change. Keyboard
  // listener uses metaKey for Cmd; treats '=' (the unshifted '+') and
  // 'Equal'/'Plus' as zoom-in.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const persisted = await loadTextZoom();
      if (cancelled) return;
      textZoomHydrated.current = true;
      if (persisted !== null) useUIStore.getState().setTextZoom(persisted);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty("--text-zoom", String(textZoom));
    if (!textZoomHydrated.current) return;
    void persistTextZoom(textZoom);
  }, [textZoom]);

  // Plug-in rail "Show IDs" pref — hydrate once, persist on change.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const p = await loadShowFingerprints();
      if (cancelled) return;
      showFingerprintsHydrated.current = true;
      if (p !== null) useUIStore.getState().setPluginRailShowFingerprints(p);
    })();
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!showFingerprintsHydrated.current) return;
    void persistShowFingerprints(showFingerprints);
  }, [showFingerprints]);

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

  useEffect(() => runLibraryHydration(), []);

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
      } else if (id === "theme_system") {
        useUIStore.getState().setTheme("system");
      } else if (id === "theme_light") {
        useUIStore.getState().setTheme("light");
      } else if (id === "theme_dark") {
        useUIStore.getState().setTheme("dark");
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

  let mainContent;
  if (status.kind === "idle") {
    mainContent = browseFolder !== undefined ? (
      <LibraryHome folder={browseFolder} />
    ) : (
      <EmptyState
        onPickProject={pickProject}
        onOpenFolder={() => void pickAndAddFolder()}
        auRegistryStatus={auRegistryStatus}
      />
    );
  } else {
    mainContent = <ProjectInspector status={status} />;
  }
  const main = (
    <>
      <ScanBanner />
      {mainContent}
    </>
  );

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
