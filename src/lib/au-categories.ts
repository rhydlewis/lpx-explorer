/**
 * Coarse Audio Unit categorisation derived from the type 4CC.
 *
 * lpx-explorer-01w investigation revealed that the fine-grained Logic
 * Plug-in Manager taxonomy (EQ, Dynamics, Reverb, Delay, …) isn't
 * deterministically recoverable from `.component` bundles' `Info.plist`:
 * across 226 installed plug-ins on the dev machine, only 2 carried any
 * `tags` array and both were empty. The `type` 4CC inside the
 * `AudioComponents` array is the only universal signal.
 *
 * v1 ships these four buckets; finer categorisation (e.g. EQ vs
 * Dynamics within `effect`) is filed as a follow-up that would need
 * either a static name→category map or vendor-specific heuristics.
 */
export type AuCategory = "effect" | "instrument" | "midi" | "other";

const EFFECT_TYPES = new Set([
  "aufx", // standard audio effect
  "aufc", // format converter
  "aupn", // panner
  "augn", // generator
  "auol", // offline effect
]);

const MIDI_TYPES = new Set([
  "aumf", // MIDI-controlled audio
  "aumi", // MIDI processor
]);

export function categoryOf(typeCode: string): AuCategory {
  if (EFFECT_TYPES.has(typeCode)) return "effect";
  if (typeCode === "aumu") return "instrument";
  if (MIDI_TYPES.has(typeCode)) return "midi";
  return "other";
}

/**
 * Convenience helper: derive the category from a fingerprint string of
 * the shape `"{type}/{subtype}/{manufacturer}"`. Falls through to
 * `'other'` if the fingerprint is malformed.
 */
export function categoryOfFingerprint(fingerprint: string): AuCategory {
  const slash = fingerprint.indexOf("/");
  if (slash < 0) return "other";
  return categoryOf(fingerprint.slice(0, slash));
}
