import type { ProjectSummary } from "./types";

/**
 * Three pivots for the "find similar projects" affordance
 * (lpx-explorer-c2u). Each axis is a self-describing record so the
 * library-home chip can render its own label without knowing which
 * pivot it represents.
 */
export type SimilarityAxis =
  | { readonly kind: "key"; readonly song_key: string; readonly song_gender: string }
  | { readonly kind: "bpm"; readonly bpm: number }
  | {
      readonly kind: "key+bpm";
      readonly song_key: string;
      readonly song_gender: string;
      readonly bpm: number;
    };

/**
 * BPM band: round target to nearest 5, match candidates within ±2 of
 * the rounded bucket. Exact-match was too narrow against real
 * libraries; a hard 5-BPM bucket clipped neighbours sitting on a
 * boundary. ±2 around the rounded target gives a 5-wide window
 * regardless of the input.
 */
const BPM_BUCKET = 5;
const BPM_TOLERANCE = 2;

function bpmBucket(bpm: number): number {
  return Math.round(bpm / BPM_BUCKET) * BPM_BUCKET;
}

function isUnknownKey(song_key: string, song_gender: string): boolean {
  return song_key === "?" || song_gender === "?";
}

function bpmInBand(candidate: number, target: number): boolean {
  if (candidate <= 0 || target <= 0) return false;
  const bucket = bpmBucket(target);
  return candidate >= bucket - BPM_TOLERANCE && candidate <= bucket + BPM_TOLERANCE;
}

function keyMatches(
  candidate_key: string,
  candidate_gender: string,
  target_key: string,
  target_gender: string,
): boolean {
  if (isUnknownKey(target_key, target_gender)) return false;
  if (isUnknownKey(candidate_key, candidate_gender)) return false;
  return candidate_key === target_key && candidate_gender === target_gender;
}

export function matchesAxis(summary: ProjectSummary, axis: SimilarityAxis): boolean {
  const meta = summary.metadata;
  switch (axis.kind) {
    case "key":
      return keyMatches(meta.song_key, meta.song_gender, axis.song_key, axis.song_gender);
    case "bpm":
      return bpmInBand(meta.bpm, axis.bpm);
    case "key+bpm":
      return (
        keyMatches(meta.song_key, meta.song_gender, axis.song_key, axis.song_gender) &&
        bpmInBand(meta.bpm, axis.bpm)
      );
  }
}

function formatKey(song_key: string, song_gender: string): string {
  return `${song_key} ${song_gender.toLowerCase()}`;
}

function formatBpmBand(bpm: number): string {
  const bucket = bpmBucket(bpm);
  const lo = bucket - BPM_TOLERANCE;
  const hi = bucket + BPM_TOLERANCE;
  return `around ${Math.round(bpm)} BPM (${lo}–${hi})`;
}

export function describeAxis(axis: SimilarityAxis): string {
  switch (axis.kind) {
    case "key":
      return formatKey(axis.song_key, axis.song_gender);
    case "bpm":
      return formatBpmBand(axis.bpm);
    case "key+bpm":
      return `${formatKey(axis.song_key, axis.song_gender)} ${formatBpmBand(axis.bpm)}`;
  }
}
