import { useMemo } from "react";

import type { AURef, AuvalEntry, Track, TrackKind } from "../../lib/types";
import { displayNameOf } from "../../lib/track-display";
import { useAuRegistryStore } from "../../store/au-registry-store";
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

function labelOf(au: AURef): string {
  // Apple stock plug-ins carry their real display name (Compressor,
  // Bass Amp, ...). Their synthesised fingerprint is intentionally
  // unhelpful — render the human name instead.
  return au.display_name ?? fingerprintOf(au);
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

function summarizeInserts(track: Track): string {
  const instr = track.instrument !== null ? 1 : 0;
  const midi = track.midi_fx.length;
  const fx = track.audio_fx.length;
  const total = instr + midi + fx;
  const parts: string[] = [];
  if (instr > 0) parts.push(`${instr} instr`);
  if (midi > 0) parts.push(`${midi} midi`);
  if (fx > 0) parts.push(`${fx} fx`);
  return `${total} insert${total === 1 ? "" : "s"} · ${parts.join(" · ")}`;
}

export function TrackRow({ track, depth }: Props) {
  const registryStatus = useAuRegistryStore((s) => s.status);
  const byFingerprint = useMemo<ReadonlyMap<string, AuvalEntry>>(() => {
    if (registryStatus.kind !== "loaded") {
      return new Map();
    }
    const map = new Map<string, AuvalEntry>();
    for (const entry of registryStatus.registry.entries) {
      map.set(entry.fingerprint, entry);
    }
    return map;
  }, [registryStatus]);
  const inserts = collectInserts(track);
  const name = displayNameOf(track, byFingerprint);
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
        <span className={styles.name} title={name}>
          {name}
        </span>
        <StatusDot status={track.is_active ? "clean" : "neutral"} />
      </div>
      {inserts.length > 0 && (
        <details className={styles.disclosure}>
          <summary className={styles.summary}>
            {summarizeInserts(track)}
          </summary>
          <ul className={styles.inserts}>
            {inserts.map((au) => (
              <li key={`${au.offset}:${fingerprintOf(au)}`}>
                {labelOf(au)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
