import { useCallback, useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";

import { listAudioFiles, pickHeroAudio } from "../../lib/parse";
import type { AudioFile, AudioCategory } from "../../lib/types";

import sectionStyles from "./Inspector.module.css";
import styles from "./AudioPreview.module.css";
import { WaveformPlayer } from "./WaveformPlayer";

interface Props {
  /** Absolute path to the `.logicx` bundle. */
  readonly path: string;
}

const CATEGORY_LABEL: Record<AudioCategory, string> = {
  bounce: "Bounce",
  "audio-region": "Audio region",
  "freeze-file": "Freeze file",
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

const CAF_NOT_SUPPORTED_TITLE =
  "Format not supported in preview — CAF can't play in WebView";

/**
 * Audio snippet preview for `.logicx` bundles (lpx-explorer-34y).
 *
 * Fetches the bundle's audio inventory on mount, smart-picks a hero
 * file (Bounce → AudioRegion → FreezeFile, previewable only), and
 * exposes the full inventory in an expandable panel. Maintains a
 * single `<audio>` element controlled by `playingPath` state so the
 * "starting one ▶ stops any prior playback" invariant holds.
 */
export function AudioPreview({ path }: Props) {
  const [files, setFiles] = useState<ReadonlyArray<AudioFile> | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [playingPath, setPlayingPath] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setFiles(null);
    setPlayingPath(null);
    setExpanded(false);
    void listAudioFiles(path).then((found) => {
      if (!cancelled) setFiles(found);
    });
    return () => {
      cancelled = true;
    };
  }, [path]);

  // Stable ref — WaveformPlayer's create-effect depends on `onEnded`,
  // so a new function identity each render would tear down + recreate
  // the wavesurfer instance mid-playback. Must live above any early
  // return to satisfy the Rules of Hooks.
  const handlePlaybackEnded = useCallback(() => setPlayingPath(null), []);

  if (files === null) {
    return null;
  }

  if (files.length === 0) {
    return (
      <section aria-label="audio preview" className={sectionStyles.section}>
        <h3 className={sectionStyles.sectionLabel}>Audio Preview</h3>
        <p className={styles.placeholder}>
          This project has no recorded audio, bounces, or freeze files.
        </p>
      </section>
    );
  }

  const hero = pickHeroAudio(files);
  // No previewable hero (e.g. CAF-only freeze files) → show the
  // inventory directly. The user came for a play button; if we can't
  // give them one, at least show *why* and what files do exist.
  const isExpanded = expanded || hero === null;
  const togglePlay = (file: AudioFile) => {
    if (!file.previewable) return;
    setPlayingPath((current) => (current === file.path ? null : file.path));
  };

  return (
    <section aria-label="audio preview" className={sectionStyles.section}>
      <h3 className={sectionStyles.sectionLabel}>Audio Preview</h3>

      {hero !== null && (
        <div className={styles.hero}>
          <button
            type="button"
            className={styles.heroPlay}
            aria-label={
              playingPath === hero.path
                ? `Pause ${hero.file_name}`
                : `Play ${hero.file_name}`
            }
            aria-pressed={playingPath === hero.path}
            onClick={() => togglePlay(hero)}
          >
            {playingPath === hero.path ? "❚❚" : "▶"}
          </button>
          <div className={styles.heroMeta}>
            <span className={styles.heroLabel}>
              {CATEGORY_LABEL[hero.category]}
            </span>
            <span className={styles.heroName} title={hero.path}>
              {hero.file_name}
            </span>
          </div>
        </div>
      )}

      {hero !== null && (
        <button
          type="button"
          className={styles.expandToggle}
          aria-expanded={isExpanded}
          onClick={() => setExpanded((e) => !e)}
        >
          {isExpanded ? "▾" : "▸"} All audio files ({files.length})
        </button>
      )}

      {isExpanded && (
        <ul className={styles.inventoryList}>
          {files.map((file) => {
            const isPlaying = playingPath === file.path;
            const disabled = !file.previewable;
            let label: string;
            if (disabled) {
              label = `${file.file_name} — not previewable`;
            } else if (isPlaying) {
              label = `Pause ${file.file_name}`;
            } else {
              label = `Play ${file.file_name}`;
            }
            return (
              <li key={file.path} className={styles.inventoryRow}>
                <button
                  type="button"
                  className={styles.rowPlay}
                  aria-label={label}
                  aria-pressed={isPlaying}
                  disabled={disabled}
                  title={disabled ? CAF_NOT_SUPPORTED_TITLE : undefined}
                  onClick={() => togglePlay(file)}
                >
                  {isPlaying ? "❚❚" : "▶"}
                </button>
                <span className={styles.rowName} title={file.path}>
                  {file.file_name}
                </span>
                <span className={styles.rowCategory}>
                  {CATEGORY_LABEL[file.category]}
                </span>
                <span className={styles.rowSize}>
                  {formatBytes(file.size_bytes)}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {playingPath !== null && (
        <div className={styles.nowPlaying}>
          <span className={styles.nowPlayingLabel}>
            Now playing:{" "}
            <strong>
              {files.find((f) => f.path === playingPath)?.file_name ?? ""}
            </strong>
          </span>
          <WaveformPlayer
            // `key` forces remount on src change so wavesurfer's
            // decoded buffer for the previous track is released and a
            // fresh instance loads the new one — keeps the
            // single-player invariant honest.
            key={playingPath}
            src={convertFileSrc(playingPath)}
            autoPlay
            onEnded={handlePlaybackEnded}
          />
        </div>
      )}
    </section>
  );
}
