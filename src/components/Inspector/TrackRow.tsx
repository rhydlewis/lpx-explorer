import { useEffect, useMemo, useRef } from "react";

import type { AURef, AuvalEntry, Track } from "../../lib/types";
import { displayNameOf } from "../../lib/track-display";
import { TrackIcon } from "../../lib/track-icon";
import { useAuRegistryStore } from "../../store/au-registry-store";
import { useUIStore } from "../../store/ui-store";
import { StatusDot } from "../StatusDot";

import styles from "./TrackRow.module.css";

interface Props {
  readonly track: Track;
  readonly depth: number;
}

type InsertKind = "instrument" | "midi" | "fx";

interface InsertItem {
  readonly au: AURef;
  readonly kind: InsertKind;
}

const TYPE_LABEL: Record<InsertKind, string> = {
  instrument: "Instrument",
  midi: "MIDI",
  fx: "FX",
};

function fingerprintOf(au: AURef): string {
  return `${au.type_code}/${au.subtype}/${au.manufacturer}`;
}

function labelOf(au: AURef, byFingerprint: ReadonlyMap<string, AuvalEntry>): string {
  if (au.display_name !== undefined) {
    return au.display_name;
  }
  const fp = fingerprintOf(au);
  return byFingerprint.get(fp)?.name ?? fp;
}

function collectInserts(track: Track): readonly InsertItem[] {
  // Logic's signal flow: instrument first, then MIDI FX, then audio FX.
  const out: InsertItem[] = [];
  if (track.instrument !== null) {
    out.push({ au: track.instrument, kind: "instrument" });
  }
  for (const au of track.midi_fx) {
    out.push({ au, kind: "midi" });
  }
  for (const au of track.audio_fx) {
    out.push({ au, kind: "fx" });
  }
  return out;
}

export function TrackRow({ track, depth }: Props) {
  const registryStatus = useAuRegistryStore((s) => s.status);
  const tracksAllExpanded = useUIStore((s) => s.tracksAllExpanded);
  const tracksExpansionNonce = useUIStore((s) => s.tracksExpansionNonce);
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
  const detailsRef = useRef<HTMLDetailsElement | null>(null);

  // Sync this row's <details> to the project-level expand/collapse signal
  // each time the nonce bumps. Skip nonce 0 so a fresh project load
  // doesn't auto-open every disclosure.
  useEffect(() => {
    if (tracksExpansionNonce === 0) return;
    const el = detailsRef.current;
    if (el === null) return;
    el.open = tracksAllExpanded;
  }, [tracksExpansionNonce, tracksAllExpanded]);

  return (
    <div
      className={styles.row}
      data-track-kind={track.kind}
      data-track-depth={depth}
      data-track-active={track.is_active}
    >
      <div className={styles.header}>
        <span className={styles.icon} aria-hidden="true">
          <TrackIcon kind={track.kind} />
        </span>
        <span className={styles.name} title={name}>
          {name}
        </span>
        <StatusDot status={track.is_active ? "clean" : "neutral"} />
      </div>
      {inserts.length > 0 && (
        <details ref={detailsRef} className={styles.disclosure}>
          <summary className={styles.summary}>
            {inserts.length} insert{inserts.length === 1 ? "" : "s"}
          </summary>
          <table className={styles.insertsTable}>
            <thead className={styles.srOnly}>
              <tr>
                <th scope="col">Insert</th>
                <th scope="col">Type</th>
              </tr>
            </thead>
            <tbody>
              {inserts.map(({ au, kind }) => (
                <tr key={`${au.offset}:${fingerprintOf(au)}`}>
                  <td>
                    <span data-kind={kind} className={styles.pill}>
                      {labelOf(au, byFingerprint)}
                    </span>
                  </td>
                  <td className={styles.typeCell}>{TYPE_LABEL[kind]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}
