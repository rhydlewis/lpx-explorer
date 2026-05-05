import { useCallback, useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWebview } from "@tauri-apps/api/webview";

import { parseProject } from "./lib/parse";
import { routeDrop } from "./lib/drop-routing";
import type { ProjectSummary as ProjectSummaryData } from "./lib/types";
import { AppShell } from "./components/AppShell";
import { EmptyState } from "./components/EmptyState";
import { PluginList } from "./components/Inspector/PluginList";
import { TopBar } from "./components/TopBar";

import "./App.css";

type Status =
  | { kind: "idle" }
  | { kind: "loading"; path: string }
  | { kind: "loaded"; path: string; summary: ProjectSummaryData }
  | { kind: "error"; message: string };

const HINT_DISMISS_MS = 4000;

function projectNameOf(path: string): string {
  const segments = path.split("/").filter(Boolean);
  const last = segments[segments.length - 1] ?? path;
  return last.replace(/\.logicx$/i, "");
}

function App() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [hint, setHint] = useState<string | null>(null);

  const loadProject = useCallback(async (path: string) => {
    setStatus({ kind: "loading", path });
    try {
      const summary = await parseProject(path);
      setStatus({ kind: "loaded", path, summary });
    } catch (e) {
      setStatus({
        kind: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }, []);

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
    await loadProject(selection);
  }

  useEffect(() => {
    const unlistenPromise = getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type !== "drop") {
        return;
      }
      const action = routeDrop(event.payload.paths);
      if (action.kind === "open-project") {
        void loadProject(action.path);
      } else {
        setHint(action.reason);
      }
    });
    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [loadProject]);

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

  const main = renderMain(status, pickProject);

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

function renderMain(status: Status, pickProject: () => Promise<void>) {
  if (status.kind === "idle") {
    return <EmptyState onPickProject={pickProject} />;
  }
  if (status.kind === "loading") {
    return <p>Parsing {status.path}…</p>;
  }
  if (status.kind === "error") {
    return <p role="alert">Error: {status.message}</p>;
  }
  return (
    <>
      <p>
        <code>{status.path}</code>
      </p>
      <PluginList summary={status.summary} />
    </>
  );
}

export default App;
