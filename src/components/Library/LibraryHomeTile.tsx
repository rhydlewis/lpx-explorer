import { useEffect, useState } from "react";

import { openProject } from "../../lib/open-project";
import { projectNameOf } from "../../lib/path-utils";
import type { ProjectSummary } from "../../lib/types";
import { useLibrarySummariesStore } from "../../store/library-summaries-store";

import styles from "./LibraryHomeTile.module.css";

interface Props {
  readonly path: string;
}

type TileState =
  | { kind: "loading" }
  | { kind: "loaded"; summary: ProjectSummary }
  | { kind: "error"; message: string };

function formatKey(meta: ProjectSummary["metadata"]): string | null {
  if (meta.song_key === "?" || meta.song_key === "") return null;
  if (meta.song_gender === "?" || meta.song_gender === "") return meta.song_key;
  return `${meta.song_key} ${meta.song_gender.toLowerCase()}`;
}

function formatBpm(bpm: number): string | null {
  return bpm > 0 ? bpm.toFixed(1) : null;
}

function formatSig(meta: ProjectSummary["metadata"]): string {
  return `${meta.sig_numerator}/${meta.sig_denominator}`;
}

function formatBytes(n: number): string {
  if (n <= 0) return "—";
  const KB = 1024;
  const MB = KB * 1024;
  const GB = MB * 1024;
  if (n < KB) return `${n} B`;
  if (n < MB) return `${(n / KB).toFixed(1)} KB`;
  if (n < GB) return `${(n / MB).toFixed(1)} MB`;
  return `${(n / GB).toFixed(1)} GB`;
}

/**
 * One project card in the library home view (lpx-explorer-1di).
 *
 * Triggers a parse via `useLibrarySummariesStore.getOrParse` on mount —
 * the store de-dupes concurrent calls, so re-mounts (e.g. tile reorder)
 * don't re-parse. Renders the project name (extracted from the path)
 * immediately so the grid lays out at constant geometry; metadata fades
 * in once the summary lands.
 */
export function LibraryHomeTile({ path }: Props) {
  const summary = useLibrarySummariesStore((s) => s.summaries.get(path));
  const error = useLibrarySummariesStore((s) => s.errors.get(path));
  const getOrParse = useLibrarySummariesStore((s) => s.getOrParse);
  const [, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await getOrParse(path);
      if (!cancelled && result === null) {
        // Trigger a re-render so the error state appears even when the
        // store error map was the only thing that changed.
        setTick((t) => t + 1);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [path, getOrParse]);

  const state = resolveState(summary, error);

  const name = projectNameOf(path);

  return (
    <button
      type="button"
      className={styles.tile}
      data-state={state.kind}
      onClick={() => void openProject(path)}
      title={path}
    >
      <h3 className={styles.name}>{name}</h3>
      <TileBody state={state} />
    </button>
  );
}

function resolveState(
  summary: ProjectSummary | undefined,
  error: string | undefined,
): TileState {
  if (summary !== undefined) return { kind: "loaded", summary };
  if (error !== undefined) return { kind: "error", message: error };
  return { kind: "loading" };
}

function TileBody({ state }: { readonly state: TileState }) {
  if (state.kind === "loading") {
    return (
      <p className={styles.placeholder} aria-live="polite">
        Reading…
      </p>
    );
  }
  if (state.kind === "error") {
    return (
      <p className={styles.error}>Couldn't read this project.</p>
    );
  }
  const { summary } = state;
  const key = formatKey(summary.metadata);
  const bpm = formatBpm(summary.metadata.bpm);
  const sig = formatSig(summary.metadata);
  const tracks = summary.metadata.track_count;
  // Distinct fingerprints (deduped) — same definition the rail uses.
  const distinctPlugins = new Set(
    summary.fingerprints.map(
      (f) => `${f.type_code}/${f.subtype}/${f.manufacturer}`,
    ),
  ).size;

  return (
    <>
      <div className={styles.musicalLine}>
        {key !== null && <span>{key}</span>}
        {bpm !== null && <span>{bpm}</span>}
        <span>{sig}</span>
      </div>
      <div className={styles.countsLine}>
        <span>
          {tracks} {tracks === 1 ? "track" : "tracks"}
        </span>
        <span>·</span>
        <span>
          {distinctPlugins} {distinctPlugins === 1 ? "plug-in" : "plug-ins"}
        </span>
      </div>
      <div className={styles.sizeLine}>
        {formatBytes(summary.stats.size_bytes)}
      </div>
    </>
  );
}
