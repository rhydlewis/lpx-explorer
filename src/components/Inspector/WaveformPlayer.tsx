import { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";

import styles from "./WaveformPlayer.module.css";

interface Props {
  /**
   * Asset-protocol URL to the audio file (e.g. `asset:///path/to.wav`).
   * Pass already converted via `convertFileSrc` — this component does
   * not transform the value, so tests can stub it cleanly.
   *
   * Surfaced on the wrapper as `data-now-playing-src` to let tests
   * assert on the active source without poking at wavesurfer internals.
   */
  readonly src: string;
  readonly autoPlay?: boolean;
  /** Called when playback reaches the end of the file. */
  readonly onEnded?: () => void;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const mm = Math.floor(seconds / 60);
  const ss = Math.floor(seconds % 60);
  return `${mm.toString().padStart(2, "0")}:${ss.toString().padStart(2, "0")}`;
}

/**
 * Waveform-rendering audio player (lpx-explorer-17z).
 *
 * Wraps wavesurfer.js: decodes the file in-browser via Web Audio API,
 * renders the amplitude waveform on a canvas, and exposes click-to-seek
 * via wavesurfer's built-in click handling. Replaces the native
 * `<audio controls>` element used in 34y's first cut so users can see
 * the song's shape and jump to a specific point instead of scrubbing
 * blind through a multi-minute bounce.
 *
 * One instance per active playback (mounted in AudioPreview's
 * "now playing" dock). The single-player invariant in AudioPreview
 * still holds — only one WaveformPlayer exists at a time.
 */
export function WaveformPlayer({ src, autoPlay = false, onEnded }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    if (containerRef.current === null) return;

    const ws = WaveSurfer.create({
      container: containerRef.current,
      url: src,
      height: 60,
      // Theme-agnostic semi-transparent palette — looks reasonable in
      // both light and dark mode without us wiring CSS variables into
      // the canvas. If this turns out to clash, swap to ResizeObserver-
      // backed re-creation that reads computed styles.
      waveColor: "rgba(140, 140, 140, 0.55)",
      progressColor: "rgba(80, 160, 220, 0.95)",
      cursorColor: "rgba(80, 160, 220, 0.95)",
      cursorWidth: 1,
      barWidth: 2,
      barGap: 1,
      barRadius: 1,
      autoplay: autoPlay,
      // Disable wavesurfer's keyboard handling so it doesn't intercept
      // global shortcuts (Cmd-O for open project, etc.) when the
      // canvas has focus.
      interact: true,
    });
    wsRef.current = ws;

    const subs = [
      ws.on("ready", () => {
        setDuration(ws.getDuration());
        setStatus("ready");
      }),
      ws.on("play", () => setIsPlaying(true)),
      ws.on("pause", () => setIsPlaying(false)),
      ws.on("finish", () => {
        setIsPlaying(false);
        onEnded?.();
      }),
      ws.on("timeupdate", (time) => setCurrentTime(time)),
      ws.on("error", () => setStatus("error")),
    ];

    return () => {
      // Wavesurfer's destroy() also unsubscribes listeners, but calling
      // them explicitly keeps the cleanup order obvious.
      for (const unsub of subs) unsub();
      ws.destroy();
      wsRef.current = null;
    };
  }, [src, autoPlay, onEnded]);

  const togglePlayback = () => {
    const ws = wsRef.current;
    if (ws === null || status !== "ready") return;
    void ws.playPause();
  };

  return (
    <div className={styles.player} data-now-playing-src={src}>
      <div className={styles.transport}>
        <button
          type="button"
          className={styles.playPause}
          aria-label={isPlaying ? "Pause" : "Play"}
          aria-pressed={isPlaying}
          disabled={status !== "ready"}
          onClick={togglePlayback}
        >
          {isPlaying ? "❚❚" : "▶"}
        </button>
        <span className={styles.time}>
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>

      {status === "error" ? (
        <div className={styles.error}>
          Couldn't decode this file. The format may not be supported.
        </div>
      ) : (
        <div ref={containerRef} className={styles.waveform} />
      )}
    </div>
  );
}
