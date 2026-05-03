import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";

import { parseProject } from "./lib/parse";
import type { ProjectSummary as ProjectSummaryData } from "./lib/types";
import { ProjectSummary } from "./components/ProjectSummary";

import "./App.css";

type Status =
  | { kind: "idle" }
  | { kind: "loading"; path: string }
  | { kind: "loaded"; path: string; summary: ProjectSummaryData }
  | { kind: "error"; message: string };

function App() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function pickProject() {
    const selection = await open({
      directory: true,
      multiple: false,
      title: "Select a .logicx project bundle",
    });
    if (typeof selection !== "string") {
      return;
    }
    setStatus({ kind: "loading", path: selection });
    try {
      const summary = await parseProject(selection);
      setStatus({ kind: "loaded", path: selection, summary });
    } catch (e) {
      setStatus({
        kind: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return (
    <main className="container">
      <h1>lpx-explorer</h1>
      <p>Walking-skeleton tracer: pick a .logicx and see its AU fingerprints.</p>
      <button type="button" onClick={pickProject}>
        Pick project
      </button>
      {status.kind === "loading" && <p>Parsing {status.path}…</p>}
      {status.kind === "error" && <p role="alert">Error: {status.message}</p>}
      {status.kind === "loaded" && (
        <>
          <p>
            <code>{status.path}</code>
          </p>
          <ProjectSummary summary={status.summary} />
        </>
      )}
    </main>
  );
}

export default App;
