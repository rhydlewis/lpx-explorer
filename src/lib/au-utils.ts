import type { AURef, AuRegistry } from "./types";

export type InstallStatus = "installed" | "missing" | "unknown";

/**
 * Decide a fingerprint's install status against the loaded AU registry.
 * Returns `unknown` when the registry isn't loaded — callers render a
 * neutral grey badge in that case.
 *
 * Matches case-sensitively and preserves trailing/leading spaces in
 * 4CCs verbatim. The fingerprint format `"{type}/{subtype}/{manufacturer}"`
 * must match exactly what `auval -l` emits (and what
 * `lpx-parser::AURef::fingerprint` produces) — any normalisation here
 * silently breaks lookups.
 */
export function installStatusOf(
  fingerprint: string,
  registry: AuRegistry | null,
): InstallStatus {
  if (registry === null) {
    return "unknown";
  }
  const installed = registry.entries.some((e) => e.fingerprint === fingerprint);
  return installed ? "installed" : "missing";
}

export interface FingerprintGroup {
  readonly fingerprint: string;
  readonly count: number;
  /** Byte offset of the first occurrence — used as a stable React key. */
  readonly first_offset: number;
}

/**
 * Collapse identical fingerprints into one group with `count: N`.
 * Preserves first-seen order across distinct fingerprints.
 *
 * Used by `<PluginList>` to render the `×N` badge for phantom plug-ins
 * (per docs/decisions.md 2026-05-04 #2). Track-level inserts
 * (`Track.midi_fx`/`audio_fx`) keep their individual `AURef` identity
 * — grouping is a *display* concern at the inventory level only.
 */
export function groupFingerprints(
  refs: ReadonlyArray<AURef>,
): ReadonlyArray<FingerprintGroup> {
  const order: string[] = [];
  const groups = new Map<string, { count: number; first_offset: number }>();
  for (const ref of refs) {
    const fingerprint = `${ref.type_code}/${ref.subtype}/${ref.manufacturer}`;
    const existing = groups.get(fingerprint);
    if (existing === undefined) {
      order.push(fingerprint);
      groups.set(fingerprint, { count: 1, first_offset: ref.offset });
    } else {
      existing.count += 1;
    }
  }
  return order.map((fingerprint) => {
    const g = groups.get(fingerprint);
    if (g === undefined) {
      throw new Error("invariant: ordered key has no group");
    }
    return { fingerprint, count: g.count, first_offset: g.first_offset };
  });
}
