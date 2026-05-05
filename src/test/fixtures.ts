import type {
  AURef,
  AuRegistry,
  AuvalEntry,
  BundleStats,
  ProjectMetadata,
  ProjectSummary,
  Track,
  TrackRegistryEntry,
} from "../lib/types";

const DEFAULT_METADATA: ProjectMetadata = {
  song_key: "?",
  song_gender: "?",
  bpm: 0,
  sig_numerator: 4,
  sig_denominator: 4,
  track_count: 0,
  sample_rate: 0,
  audio_file_count: 0,
  impulse_response_count: 0,
  frame_rate_index: 0,
};

const DEFAULT_STATS: BundleStats = {
  size_bytes: 0,
  created_at_unix: 0,
  modified_at_unix: 0,
};

/**
 * Build a `ProjectSummary` for tests with sensible defaults.
 *
 * Pass overrides for the fields you actually want to assert against;
 * everything else carries the Pythonish defaults so a single change to
 * the IPC shape doesn't require updating dozens of test fixtures.
 */
export function makeSummary(
  overrides: {
    fingerprints?: AURef[];
    metadata?: Partial<ProjectMetadata>;
    stats?: Partial<BundleStats>;
    tracks?: Track[];
    tracks_registry?: TrackRegistryEntry[];
  } = {},
): ProjectSummary {
  return {
    fingerprints: overrides.fingerprints ?? [],
    metadata: { ...DEFAULT_METADATA, ...(overrides.metadata ?? {}) },
    stats: { ...DEFAULT_STATS, ...(overrides.stats ?? {}) },
    tracks: overrides.tracks ?? [],
    tracks_registry: overrides.tracks_registry ?? [],
  };
}

/**
 * Build an [`AuRegistry`] for tests. Pass fingerprint strings; helper
 * splits them into the 4CC fields so callers don't repeat the dance.
 */
export function makeAuRegistry(fingerprints: ReadonlyArray<string> = []): AuRegistry {
  const entries: AuvalEntry[] = fingerprints.map((fingerprint) => {
    const [type_4cc = "", subtype_4cc = "", manufacturer_4cc = ""] =
      fingerprint.split("/");
    return {
      fingerprint,
      type_4cc,
      subtype_4cc,
      manufacturer_4cc,
      name: fingerprint, // tests usually don't care about the human name
    };
  });
  return { entries, scanned_at_unix: 0 };
}
