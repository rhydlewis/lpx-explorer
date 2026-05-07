import {
  Activity,
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

import type { BundleStats, ProjectMetadata } from "../../lib/types";
import { formatRelative } from "../../lib/time-utils";

import sectionStyles from "./Inspector.module.css";
import styles from "./ProjectInfo.module.css";

interface Props {
  readonly metadata: ProjectMetadata;
  readonly stats: BundleStats;
  /**
   * Reference instant for relative-time formatting. Defaults to `new Date()`
   * — tests pin it for deterministic output.
   */
  readonly now?: Date;
}

interface MetaItem {
  readonly label: string;
  readonly value: string | number;
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

function buildItems(
  metadata: ProjectMetadata,
  stats: BundleStats,
  now: Date,
): ReadonlyArray<MetaItem> {
  const items: MetaItem[] = [
    { label: "Key", value: formatKey(metadata), icon: Music },
    { label: "BPM", value: formatBpm(metadata.bpm), icon: Activity },
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
  now = new Date(),
}: Props) {
  const items = buildItems(metadata, stats, now);
  return (
    <section aria-label="project info" className={sectionStyles.section}>
      <h3 className={sectionStyles.sectionLabel}>Project</h3>
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
