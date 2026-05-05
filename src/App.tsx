import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWebview } from "@tauri-apps/api/webview";

import { routeDrop } from "./lib/drop-routing";
import { useProjectStore } from "./store/project-store";
import { AppShell } from "./components/AppShell";
import { EmptyState } from "./components/EmptyState";
import { ProjectInspector } from "./components/Inspector/ProjectInspector";
import { TopBar } from "./components/TopBar";

import "./App.css";

const HINT_DISMISS_MS = 4000;

function projectNameOf(path: string): string {
  const trimmed = path.endsWith("/") ? path.slice(0, -1) : path;
  const segments = trimmed.split("/").filter(Boolean);
  const last = segments[segments.length - 1] ?? trimmed;
  return last.replace(/\.logicx$/i, "");
}

function App() {
  const status = useProjectStore((s) => s.current);
  const select = useProjectStore((s) => s.select);
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
    await select(selection);
  }

  useEffect(() => {
    const unlistenPromise = getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type !== "drop") {
        return;
      }
      const action = routeDrop(event.payload.paths);
      if (action.kind === "open-project") {
        void select(action.path);
      } else {
        setHint(action.reason);
      }
    });
    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [select]);

  useEffect(() => {
    if (hint === null) {
      return;
    }
    const timer = setTimeout(() => setHint(null), HINT_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [hint]);

  const topBar = (
    <TopBar
      projectName={
        status.kind === "loaded" ? projectNameOf(status.path) : undefined
      }
    />
  );

  const main = status.kind === "idle"
    ? <EmptyState onPickProject={pickProject} />
    : <ProjectInspector status={status} />;

  return (
    <>
      <AppShell topBar={topBar} main={main} />
      {hint !== null && (
        <div role="status" aria-live="polite" className="drop-hint">
          {hint}
        </div>
      )}
    </>
  );
}

export default App;
