import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWebview } from "@tauri-apps/api/webview";

import { openProject } from "./lib/open-project";
import { pickAndAddFolder } from "./lib/open-folder";
import { projectNameOf } from "./lib/path-utils";
import { routeDrop } from "./lib/drop-routing";
import { useAuRegistryStore } from "./store/au-registry-store";
import { useLibraryStore } from "./store/library-store";
import { useProjectStore } from "./store/project-store";
import { AppShell } from "./components/AppShell";
import { EmptyState } from "./components/EmptyState";
import { ProjectInspector } from "./components/Inspector/ProjectInspector";
import { LibraryRail } from "./components/Library/LibraryRail";
import { TopBar } from "./components/TopBar";

import "./App.css";

const HINT_DISMISS_MS = 4000;

function App() {
  const status = useProjectStore((s) => s.current);
  const recentCount = useLibraryStore((s) => s.recent.length);
  const folderCount = useLibraryStore((s) => s.folders.length);
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
    void useAuRegistryStore.getState().loadFromCache();
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
      if (event.payload === "menu_open_project") {
        void pickProject();
      } else if (event.payload === "menu_open_folder") {
        void pickAndAddFolder();
      }
    });
    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  const topBar = (
    <TopBar
      projectName={
        status.kind === "loaded" ? projectNameOf(status.path) : undefined
      }
    />
  );

  const rail = recentCount > 0 || folderCount > 0 ? <LibraryRail /> : undefined;

  const main = status.kind === "idle"
    ? <EmptyState
        onPickProject={pickProject}
        onOpenFolder={() => void pickAndAddFolder()}
      />
    : <ProjectInspector status={status} />;

  return (
    <>
      <AppShell topBar={topBar} rail={rail} main={main} />
      {hint !== null && (
        <div role="status" aria-live="polite" className="drop-hint">
          {hint}
        </div>
      )}
    </>
  );
}

export default App;
