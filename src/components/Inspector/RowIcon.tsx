import {
  AudioWaveform,
  Ghost,
  Piano,
  Workflow,
  type LucideIcon,
} from "lucide-react";

import { categoryOfFingerprint } from "../../lib/au-categories";
import type { InstallStatus } from "../../lib/au-utils";

import styles from "./PluginRail.module.css";

const KLOPFGEIST_FINGERPRINT = "aumu/klop/appl";

const CATEGORY_ICON: Record<"effect" | "instrument" | "midi", LucideIcon> = {
  effect: AudioWaveform,
  instrument: Piano,
  midi: Workflow,
};

const CATEGORY_LABEL: Record<"effect" | "instrument" | "midi", string> = {
  effect: "Audio effect",
  instrument: "Instrument",
  midi: "MIDI processor",
};

interface Props {
  readonly fingerprint: string;
  readonly status: InstallStatus;
}

/**
 * Per-row leading icon for `<PluginRail />` rows (lpx-explorer-4l1).
 * Driven by `categoryOfFingerprint` — `aumu/klop/appl` (Klopfgeist) is
 * special-cased to use the `Ghost` glyph, moving the easter egg from a
 * trailing decoration to the icon column where it costs nothing.
 *
 * Suppressed when the install status is unknown (registry not yet
 * scanned) — the row carries no other coloured signals at that point
 * and a leading icon reads as noise.
 */
export function RowIcon({ fingerprint, status }: Props) {
  if (status === "unknown") return null;
  const category = categoryOfFingerprint(fingerprint);
  if (category === "other") return null;
  if (fingerprint === KLOPFGEIST_FINGERPRINT) {
    return (
      <span
        className={styles.rowIcon}
        aria-label="Klopfgeist (Logic's stock metronome)"
        title="Klopfgeist — Logic's stock metronome (German: poltergeist)"
      >
        <Ghost size="0.95em" aria-hidden="true" />
      </span>
    );
  }
  const Icon = CATEGORY_ICON[category];
  const label = CATEGORY_LABEL[category];
  return (
    <span
      className={styles.rowIcon}
      aria-label={label}
      title={label}
    >
      <Icon size="0.95em" aria-hidden="true" />
    </span>
  );
}
