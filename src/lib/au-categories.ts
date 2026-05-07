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

/**
 * Fine-grained Logic-Pro-style category (lpx-explorer-uqg).
 * Mirrors Logic's Plug-in Manager taxonomy. Effects are sub-divided;
 * instruments and MIDI processors keep their coarse buckets — Logic's
 * UI doesn't sub-divide those either.
 *
 * 'Uncategorised' is a real value, not a sentinel — used by the rail
 * 'M of N categorised' indicator to tell the user how complete the
 * static table is.
 */
export type AuFineCategory =
  | "EQ"
  | "Dynamics"
  | "Reverb"
  | "Delay"
  | "Modulation"
  | "Distortion"
  | "Pitch"
  | "Imaging"
  | "Metering"
  | "Utility"
  | "Specialty"
  | "Drum Machine"
  | "Sampler"
  | "Instrument"
  | "MIDI Effect"
  | "Uncategorised";

/**
 * Apple stock plug-ins (Logic) keyed by their display name as recovered
 * by the GAME-marker scan in `apple_stock.rs`. Logic's stock plug-ins
 * are not registered as system Audio Units — `auval -l` doesn't see
 * them — so the only reliable key is the display name we already
 * recover from ProjectData.
 *
 * Curated against Logic Pro 12.2's stock effect set. Coverage is
 * deliberately partial: the 'M of N categorised' indicator surfaces
 * gaps so they can be filed (lpx-explorer-d5f extends the upstream
 * fingerprint table; this map should grow alongside it).
 */
const FINE_CATEGORIES_BY_NAME_OBJ: Readonly<Record<string, AuFineCategory>> = {
  // EQ
  "Channel EQ": "EQ",
  "Linear Phase EQ": "EQ",
  "Match EQ": "EQ",
  "Single-Band EQ": "EQ",
  "Vintage Console EQ": "EQ",
  "Vintage Graphic EQ": "EQ",
  "Vintage Tube EQ": "EQ",
  "Graphic EQ": "EQ",
  AUNBandEQ: "EQ",
  AUParametricEQ: "EQ",
  AUGraphicEQ: "EQ",

  // Dynamics
  Compressor: "Dynamics",
  "Adaptive Limiter": "Dynamics",
  Limiter: "Dynamics",
  Multipressor: "Dynamics",
  "DeEsser 2": "Dynamics",
  "Noise Gate": "Dynamics",
  Expander: "Dynamics",
  Enveloper: "Dynamics",
  AUDynamicsProcessor: "Dynamics",
  AUPeakLimiter: "Dynamics",
  AUMultibandCompressor: "Dynamics",

  // Reverb
  "Space Designer": "Reverb",
  ChromaVerb: "Reverb",
  EnVerb: "Reverb",
  SilverVerb: "Reverb",
  PlatinumVerb: "Reverb",
  AUMatrixReverb: "Reverb",
  AUReverb2: "Reverb",

  // Delay
  Echo: "Delay",
  "Tape Delay": "Delay",
  "Sample Delay": "Delay",
  "Delay Designer": "Delay",
  "Stereo Delay": "Delay",
  AUDelay: "Delay",
  AUSampleDelay: "Delay",

  // Modulation
  Chorus: "Modulation",
  Ensemble: "Modulation",
  "Modulation Delay": "Modulation",
  Phaser: "Modulation",
  Flanger: "Modulation",
  Tremolo: "Modulation",
  RingShifter: "Modulation",
  Microphaser: "Modulation",
  "Scanner Vibrato": "Modulation",
  Spreader: "Modulation",
  RotorCabinet: "Modulation",

  // Distortion
  Distortion: "Distortion",
  Overdrive: "Distortion",
  "Phase Distortion": "Distortion",
  Bitcrusher: "Distortion",
  "Clip Distortion": "Distortion",
  "Distortion II": "Distortion",
  AUDistortion: "Distortion",

  // Pitch
  "Pitch Correction": "Pitch",
  "Pitch Shifter": "Pitch",
  "Pitch Shifter II": "Pitch",
  "Vocal Transformer": "Pitch",
  AUNewPitch: "Pitch",
  AUPitch: "Pitch",
  AUNewTimePitch: "Pitch",

  // Imaging
  "Direction Mixer": "Imaging",
  "Stereo Spread": "Imaging",
  "Binaural Post-Processing": "Imaging",

  // Metering
  Multimeter: "Metering",
  Tuner: "Metering",
  "Loudness Meter": "Metering",
  "Level Meter": "Metering",
  "Correlation Meter": "Metering",
  "BPM Counter": "Metering",

  // Utility
  Gain: "Utility",
  "Test Oscillator": "Utility",
  "I/O": "Utility",
  "External Instrument": "Utility",
  AUFilter: "Utility",
  AUHipass: "Utility",
  AULowpass: "Utility",
  AUBandpass: "Utility",
  AUHighShelfFilter: "Utility",
  AULowShelfFilter: "Utility",

  // Specialty
  "Speech Enhancer": "Specialty",
  Exciter: "Specialty",
  "Spectral Gate": "Specialty",

  // Drum Machine
  "Drum Machine Designer": "Drum Machine",
  "Drum Synth": "Drum Machine",
  "Drum Kit Designer": "Drum Machine",

  // Sampler
  Sampler: "Sampler",
  "Quick Sampler": "Sampler",
  "Auto Sampler": "Sampler",
  AUSampler: "Sampler",
  EXS24: "Sampler",
};

const FINE_CATEGORIES_BY_NAME: ReadonlyMap<string, AuFineCategory> = new Map(
  Object.entries(FINE_CATEGORIES_BY_NAME_OBJ),
);

/**
 * Resolve the fine-grained category for a plug-in. Inputs:
 *   - `displayName`: preferred lookup key. The GAME-marker scan
 *     recovers stock-plug-in names from ProjectData; for non-stock
 *     plug-ins, this comes from the auval registry entry.
 *   - `fingerprint`: secondary lookup; falls back to the coarse
 *     category to ensure instrument/midi plug-ins land in their
 *     coarse bucket rather than 'Uncategorised'.
 */
export function fineCategoryOf({
  displayName,
  fingerprint,
}: {
  readonly displayName?: string;
  readonly fingerprint: string;
}): AuFineCategory {
  if (displayName !== undefined) {
    const hit = FINE_CATEGORIES_BY_NAME.get(displayName);
    if (hit !== undefined) return hit;
  }
  const coarse = categoryOfFingerprint(fingerprint);
  if (coarse === "instrument") return "Instrument";
  if (coarse === "midi") return "MIDI Effect";
  return "Uncategorised";
}
