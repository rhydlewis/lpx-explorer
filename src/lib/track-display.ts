import type { AuvalEntry, Track } from "./types";

/**
 * Logic-natural display name for a track. Resolution order:
 *
 *   1. `track.user_name` — recovered from region-record clustering
 *      (covers user-renamed audio tracks).
 *   2. For instrument tracks: the loaded instrument's auval name with
 *      the "Manufacturer: " prefix stripped (covers Logic's default
 *      "show the instrument name on the track header" behaviour).
 *   3. `track.name` — the channel-strip default ("Inst 1", "Audio 3").
 *
 * Mirrors `Track.display_name` in `lpx-toolkit/lpx_inspect.py:96-109`.
 */
export function displayNameOf(
  track: Track,
  byFingerprint: ReadonlyMap<string, AuvalEntry>,
): string {
  if (track.user_name !== null && track.user_name !== "") {
    return track.user_name;
  }
  if (track.kind === "instrument" && track.instrument !== null) {
    const fingerprint = `${track.instrument.type_code}/${track.instrument.subtype}/${track.instrument.manufacturer}`;
    const entry = byFingerprint.get(fingerprint);
    if (entry !== undefined) {
      return stripManufacturerPrefix(entry.name);
    }
  }
  return track.name;
}

/**
 * `auval -l` formats names as "Manufacturer: Plug-in Name". Logic's
 * track-header display drops the prefix. If no `: ` separator is
 * present (e.g. Apple's built-ins like "AUDynamicsProcessor"), return
 * the name unchanged.
 */
function stripManufacturerPrefix(name: string): string {
  const sep = ": ";
  const idx = name.indexOf(sep);
  if (idx === -1) {
    return name;
  }
  return name.slice(idx + sep.length);
}
