import {
  Activity,
  AppWindow,
  AudioLines,
  Calendar,
  Clock4,
  FileAudio,
  Film,
  HardDrive,
  History,
  Layers,
  Music,
  Radio,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { describeAxis, type SimilarityAxis } from "../../lib/similarity";
import type { BundleStats, ProjectMetadata } from "../../lib/types";
import { formatRelative } from "../../lib/time-utils";
import { useLibraryStore } from "../../store/library-store";
import { useProjectStore } from "../../store/project-store";
import { useUIStore } from "../../store/ui-store";

import sectionStyles from "./Inspector.module.css";
import styles from "./ProjectInfo.module.css";

interface Props {
  readonly metadata: ProjectMetadata;
  readonly stats: BundleStats;
  /**
   * Logic Pro version that last saved the project (lpx-explorer-2o2),
   * verbatim from `LastSavedFrom`. Omitted from the panel when null/absent.
   */
  readonly lastSavedFrom?: string | null;
  /**
   * Reference instant for relative-time formatting. Defaults to `new Date()`
   * — tests pin it for deterministic output.
   */
  readonly now?: Date;
}

interface MetaItem {
  readonly label: string;
  readonly value: React.ReactNode;
  readonly icon: LucideIcon;
}

function formatKey(meta: ProjectMetadata): string {
  if (meta.song_key === "?" || meta.song_key === "") {
    return "?";
  }
  if (meta.song_gender === "?" || meta.song_gender === "") {
    return meta.song_key;
  }
  return `${meta.song_key} ${meta.song_gender.toLowerCase()}`;
}

function formatBpm(bpm: number): string {
  if (bpm <= 0) {
    return "—";
  }
  return bpm.toFixed(1);
}

function formatSig(meta: ProjectMetadata): string {
  return `${meta.sig_numerator}/${meta.sig_denominator}`;
}

function formatSampleRate(hz: number): string {
  if (hz <= 0) {
    return "—";
  }
  const khz = hz / 1000;
  return `${khz.toFixed(1)} kHz`;
}

/**
 * Logic stores frame rate as a small integer index into a SMPTE rate
 * table (e.g. 0→24fps, 1→25fps, 2→29.97 drop-frame). Mirrors the table
 * at lpx_inspect.py:133-142.
 */
const FRAME_RATE_BY_INDEX: Record<number, string> = {
  0: "24 fps",
  1: "25 fps",
  2: "29.97 fps (drop)",
  3: "30 fps (drop)",
  4: "29.97 fps",
  5: "30 fps",
  6: "23.976 fps",
  7: "23.976 fps",
};

function formatFrameRate(idx: number): string | null {
  return FRAME_RATE_BY_INDEX[idx] ?? null;
}

function formatDateWithRelative(unix: number, now: Date): string {
  if (unix <= 0) {
    return "—";
  }
  const iso = new Date(unix * 1000).toISOString().slice(0, 10);
  return `${iso} (${formatRelative(unix, now)})`;
}

function formatBytes(n: number): string {
  if (n <= 0) {
    return "—";
  }
  if (n < 1024) {
    return `${n} B`;
  }
  const KB = 1024;
  const MB = KB * 1024;
  const GB = MB * 1024;
  if (n < MB) {
    return `${(n / KB).toFixed(1)} KB`;
  }
  if (n < GB) {
    return `${(n / MB).toFixed(1)} MB`;
  }
  return `${(n / GB).toFixed(1)} GB`;
}

function isKeyKnown(meta: ProjectMetadata): boolean {
  return (
    meta.song_key !== "?" &&
    meta.song_key !== "" &&
    meta.song_gender !== "?" &&
    meta.song_gender !== ""
  );
}

function isBpmKnown(meta: ProjectMetadata): boolean {
  return meta.bpm > 0;
}

/**
 * Apply a similarity axis: stash the filter, close the current project,
 * and pivot to the LibraryHome view of the folder that contained it
 * (lpx-explorer-89p). Folder lookup runs at call time — the store is
 * the source of truth for both the open project and the rail folders,
 * so we don't need to plumb path through props.
 */
function pivotToSimilar(axis: SimilarityAxis): void {
  const project = useProjectStore.getState().current;
  const path = project.kind === "idle" ? null : project.path;
  console.info(`[similar] axis=${describeAxis(axis)}`);
  useUIStore.getState().setLibrarySimilarityFilter(axis);
  useProjectStore.getState().clear();
  if (path !== null) {
    const folders = useLibraryStore.getState().folders;
    const containing = folders.find((f) => f.projects.includes(path));
    if (containing !== undefined) {
      useUIStore.getState().setSelectedLibraryFolder(containing.path);
    }
  }
}

function buildItems(
  metadata: ProjectMetadata,
  stats: BundleStats,
  now: Date,
  lastSavedFrom: string | null,
): ReadonlyArray<MetaItem> {
  const keyText = formatKey(metadata);
  const bpmText = formatBpm(metadata.bpm);
  const items: MetaItem[] = [
    {
      label: "Key",
      value: isKeyKnown(metadata) ? (
        <PivotButton
          ariaLabel={`Find other projects in ${keyText}`}
          title={`Find other projects in ${keyText}`}
          onClick={() =>
            pivotToSimilar({
              kind: "key",
              song_key: metadata.song_key,
              song_gender: metadata.song_gender,
            })
          }
        >
          {keyText}
        </PivotButton>
      ) : (
        keyText
      ),
      icon: Music,
    },
    {
      label: "BPM",
      value: isBpmKnown(metadata) ? (
        <PivotButton
          ariaLabel={`Find projects ${describeAxis({
            kind: "bpm",
            bpm: metadata.bpm,
          })}`}
          title={`Find projects ${describeAxis({
            kind: "bpm",
            bpm: metadata.bpm,
          })}`}
          onClick={() =>
            pivotToSimilar({ kind: "bpm", bpm: metadata.bpm })
          }
        >
          {bpmText}
        </PivotButton>
      ) : (
        bpmText
      ),
      icon: Activity,
    },
    { label: "Time signature", value: formatSig(metadata), icon: Clock4 },
    {
      label: "Sample rate",
      value: formatSampleRate(metadata.sample_rate),
      icon: AudioLines,
    },
  ];
  const fr = formatFrameRate(metadata.frame_rate_index);
  if (fr !== null) {
    items.push({ label: "Frame rate", value: fr, icon: Film });
  }
  items.push(
    { label: "Tracks", value: metadata.track_count, icon: Layers },
    {
      label: "Created",
      value: formatDateWithRelative(stats.created_at_unix, now),
      icon: Calendar,
    },
    {
      label: "Modified",
      value: formatDateWithRelative(stats.modified_at_unix, now),
      icon: History,
    },
    // Logic version that last saved the project (lpx-explorer-2o2);
    // omitted when unknown.
    ...(lastSavedFrom !== null && lastSavedFrom !== ""
      ? [{ label: "Last saved with", value: lastSavedFrom, icon: AppWindow }]
      : []),
    {
      label: "Bundle size",
      value: formatBytes(stats.size_bytes),
      icon: HardDrive,
    },
    {
      label: "Audio files",
      value: metadata.audio_file_count,
      icon: FileAudio,
    },
  );
  if (metadata.impulse_response_count > 0) {
    items.push({
      label: "Impulse responses",
      value: metadata.impulse_response_count,
      icon: Radio,
    });
  }
  return items;
}

export function ProjectInfo({
  metadata,
  stats,
  lastSavedFrom = null,
  now = new Date(),
}: Props) {
  const items = buildItems(metadata, stats, now, lastSavedFrom);
  const combined =
    isKeyKnown(metadata) && isBpmKnown(metadata)
      ? ({
          kind: "key+bpm",
          song_key: metadata.song_key,
          song_gender: metadata.song_gender,
          bpm: metadata.bpm,
        } as const)
      : null;
  return (
    <section aria-label="project info" className={sectionStyles.section}>
      <h3 className={sectionStyles.sectionLabel}>Metadata</h3>
      <dl className={styles.grid}>
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Pair key={item.label} icon={<Icon size="1em" aria-hidden="true" />} label={item.label}>
              {item.value}
            </Pair>
          );
        })}
      </dl>
      {combined !== null && (
        <button
          type="button"
          className={styles.combined}
          aria-label={`Find projects in ${describeAxis(combined)}`}
          title={`Find projects in ${describeAxis(combined)}`}
          onClick={() => pivotToSimilar(combined)}
        >
          Find similar — {describeAxis(combined)}
        </button>
      )}
    </section>
  );
}

interface PairProps {
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly children: React.ReactNode;
}

function Pair({ icon, label, children }: PairProps) {
  return (
    <>
      <dt>
        <span className={styles.iconWrap}>{icon}</span>
        <span>{label}</span>
      </dt>
      <dd>{children}</dd>
    </>
  );
}

interface PivotButtonProps {
  readonly ariaLabel: string;
  readonly title: string;
  readonly onClick: () => void;
  readonly children: React.ReactNode;
}

function PivotButton({ ariaLabel, title, onClick, children }: PivotButtonProps) {
  return (
    <button
      type="button"
      className={styles.pivot}
      aria-label={ariaLabel}
      title={title}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
