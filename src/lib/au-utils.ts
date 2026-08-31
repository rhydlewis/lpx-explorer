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

/**
 * How long a registry stays trustworthy without a corroborating
 * folder-mtime change. Backstop only — the mtime probe is the primary
 * staleness signal (lpx-explorer-kw0).
 */
export const REGISTRY_TTL_SECONDS = 24 * 60 * 60;

/**
 * Decide whether a cached AU registry can still be trusted
 * (lpx-explorer-kw0). Two independent signals:
 *
 *  1. `newestPluginMtimeUnix` — the newest mtime across the AU search
 *     paths. Strictly newer than the scan means something was installed
 *     or removed since. Equal timestamps count as fresh: a scan kicked
 *     off by an install lands in the same second as the mtime that
 *     triggered it, and treating that as stale would rescan forever.
 *  2. `REGISTRY_TTL_SECONDS` — a backstop for installers that swap a
 *     bundle's innards without touching the bundle or its parent.
 *
 * A `scanned_at_unix` in the future (clock skew, restored backup) is
 * treated as fresh rather than infinitely old.
 */
export function registryIsStale(
  registry: AuRegistry,
  newestPluginMtimeUnix: number | null,
  nowUnix: number,
): boolean {
  const scannedAt = registry.scanned_at_unix;
  if (newestPluginMtimeUnix !== null && newestPluginMtimeUnix > scannedAt) {
    return true;
  }
  return nowUnix - scannedAt > REGISTRY_TTL_SECONDS;
}

export interface FingerprintGroup {
  readonly fingerprint: string;
  readonly count: number;
  /** Byte offset of the first occurrence — used as a stable React key. */
  readonly first_offset: number;
  /**
   * Set when the parser identified the plug-in directly (Apple stock
   * via `GAME` 4CC). Carried from the first AURef in the group. Callers
   * use this to bypass the auval-fingerprint lookup and render the human
   * name instead of the synthesised fingerprint.
   */
  readonly display_name?: string;
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
  const groups = new Map<
    string,
    { count: number; first_offset: number; display_name?: string }
  >();
  for (const ref of refs) {
    const fingerprint = `${ref.type_code}/${ref.subtype}/${ref.manufacturer}`;
    const existing = groups.get(fingerprint);
    if (existing === undefined) {
      order.push(fingerprint);
      groups.set(fingerprint, {
        count: 1,
        first_offset: ref.offset,
        display_name: ref.display_name,
      });
    } else {
      existing.count += 1;
    }
  }
  return order.map((fingerprint) => {
    const g = groups.get(fingerprint);
    if (g === undefined) {
      throw new Error("invariant: ordered key has no group");
    }
    return {
      fingerprint,
      count: g.count,
      first_offset: g.first_offset,
      display_name: g.display_name,
    };
  });
}
