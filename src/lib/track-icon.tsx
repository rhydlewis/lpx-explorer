import {
  Cable,
  CircleQuestionMark,
  Crown,
  Folder,
  Layers,
  Mic,
  Piano,
  Plug,
  Split,
  Volume2,
  type LucideIcon,
} from "lucide-react";

import type { TrackKind } from "./types";

/**
 * Single source of truth mapping each `TrackKind` to a Lucide icon. Used
 * by `<TrackRow>` (Plug-in Chains rows) and `<TrackRegistry>` (Tracks
 * section). Two maps drifted apart in earlier iterations — keep this
 * one centralised.
 *
 * Icons inherit the surrounding `currentColor` and font-size by default,
 * so theme-mode and zoom Just Work — callers don't need to pass props.
 *
 * Mapping rationale:
 *   - audio        Mic         — captures the recording-from-input intent
 *   - instrument   Piano       — Logic's MIDI-instrument tracks
 *   - folder       Folder      — directly evokes the Tracks Area folder
 *   - summing-stack Layers     — stacks of children; matches Logic's UI
 *   - master       Crown       — single top-of-mix track
 *   - output       Volume2     — audio leaving for speakers
 *   - bus          Cable       — signal routing between strips
 *   - aux          Split       — parallel send/return paths
 *   - input        Plug        — hardware input port
 *   - unknown      CircleQuestionMark
 */
const KIND_ICON: Record<TrackKind, LucideIcon> = {
  audio: Mic,
  instrument: Piano,
  folder: Folder,
  "summing-stack": Layers,
  master: Crown,
  output: Volume2,
  bus: Cable,
  aux: Split,
  input: Plug,
  unknown: CircleQuestionMark,
};

interface Props {
  readonly kind: TrackKind;
}

/**
 * Render a Lucide icon for the given track kind. Sized to inherit `1em`
 * so it always matches the surrounding text. Inherits `currentColor`.
 */
export function TrackIcon({ kind }: Props) {
  const Icon = KIND_ICON[kind];
  return <Icon size="1em" aria-hidden="true" />;
}
