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

export function ProjectInfo({ metadata, stats, now = new Date() }: Props) {
  return (
    <section aria-label="project info" className={sectionStyles.section}>
      <h3 className={sectionStyles.sectionLabel}>Project</h3>
      <dl className={styles.grid}>
        <dt>Key</dt>
        <dd>{formatKey(metadata)}</dd>
        <dt>BPM</dt>
        <dd>{formatBpm(metadata.bpm)}</dd>
        <dt>Time signature</dt>
        <dd>{formatSig(metadata)}</dd>
        <dt>Sample rate</dt>
        <dd>{formatSampleRate(metadata.sample_rate)}</dd>
        {formatFrameRate(metadata.frame_rate_index) !== null && (
          <>
            <dt>Frame rate</dt>
            <dd>{formatFrameRate(metadata.frame_rate_index)}</dd>
          </>
        )}
        <dt>Tracks</dt>
        <dd>{metadata.track_count}</dd>
        <dt>Created</dt>
        <dd>{formatDateWithRelative(stats.created_at_unix, now)}</dd>
        <dt>Modified</dt>
        <dd>{formatDateWithRelative(stats.modified_at_unix, now)}</dd>
        <dt>Bundle size</dt>
        <dd>{formatBytes(stats.size_bytes)}</dd>
        <dt>Audio files</dt>
        <dd>{metadata.audio_file_count}</dd>
        {metadata.impulse_response_count > 0 && (
          <>
            <dt>Impulse responses</dt>
            <dd>{metadata.impulse_response_count}</dd>
          </>
        )}
      </dl>
    </section>
  );
}
