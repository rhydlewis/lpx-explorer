import type { AURef, Track, TrackKind } from "../../lib/types";
import { StatusDot } from "../StatusDot";

import styles from "./TrackRow.module.css";

interface Props {
  readonly track: Track;
  readonly depth: number;
}

const KIND_GLYPH: Record<TrackKind, string> = {
  audio: "🎤",
  instrument: "🎹",
  folder: "🗀",
  "summing-stack": "⊞",
  master: "M",
  output: "→",
  bus: "B",
  aux: "A",
  input: "←",
  unknown: "?",
};

function fingerprintOf(au: AURef): string {
  return `${au.type_code}/${au.subtype}/${au.manufacturer}`;
}

function collectInserts(track: Track): readonly AURef[] {
  // Logic's signal flow: instrument first, then MIDI FX, then audio FX.
  const out: AURef[] = [];
  if (track.instrument !== null) {
    out.push(track.instrument);
  }
  out.push(...track.midi_fx, ...track.audio_fx);
  return out;
}

export function TrackRow({ track, depth }: Props) {
  const inserts = collectInserts(track);
  return (
    <div
      className={styles.row}
      data-track-kind={track.kind}
      data-track-depth={depth}
      data-track-active={track.is_active}
    >
      <div className={styles.header}>
        <span className={styles.icon} aria-hidden="true">
          {KIND_GLYPH[track.kind]}
        </span>
        <span
          className={styles.name}
          title={track.user_name ?? track.name}
        >
          {track.user_name ?? track.name}
        </span>
        <StatusDot status={track.is_active ? "clean" : "neutral"} />
      </div>
      {inserts.length > 0 && (
        <ul className={styles.inserts}>
          {inserts.map((au) => (
            <li key={`${au.offset}:${fingerprintOf(au)}`}>
              {fingerprintOf(au)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
