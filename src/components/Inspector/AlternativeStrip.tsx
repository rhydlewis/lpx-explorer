import { useRef } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";

import type { Alternative } from "../../lib/types";
import { formatRelative } from "../../lib/time-utils";

import styles from "./AlternativeStrip.module.css";

interface Props {
  readonly alternatives: ReadonlyArray<Alternative>;
  readonly activeVariantIndex: number;
  readonly onSelectAlternative: (index: number) => void;
  /** Reference instant for the per-thumb relative-time caption. Tests pin it. */
  readonly now?: Date;
}

export function AlternativeStrip({
  alternatives,
  activeVariantIndex,
  onSelectAlternative,
  now = new Date(),
}: Props) {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function handleKey(event: React.KeyboardEvent<HTMLButtonElement>, pos: number) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const nextPos = event.key === "ArrowRight" ? pos + 1 : pos - 1;
    // Clamp at boundaries — no wrap. Wrap-around is disorienting in a
    // selector that the user will treat as a left-to-right timeline.
    if (nextPos < 0 || nextPos >= alternatives.length) return;
    onSelectAlternative(alternatives[nextPos].index);
    buttonRefs.current[nextPos]?.focus();
  }

  return (
    <div role="group" aria-label="alternatives" className={styles.strip}>
      {alternatives.map((alt, pos) => {
        const isActive = alt.index === activeVariantIndex;
        return (
          <button
            key={alt.index}
            ref={(el) => {
              buttonRefs.current[pos] = el;
            }}
            type="button"
            className={styles.thumb}
            data-active={isActive ? "true" : undefined}
            aria-current={isActive ? "true" : undefined}
            aria-label={alt.display_name}
            onClick={() => onSelectAlternative(alt.index)}
            onKeyDown={(e) => handleKey(e, pos)}
          >
            {alt.window_image_path !== null ? (
              <img
                className={styles.thumbImage}
                src={convertFileSrc(alt.window_image_path)}
                alt=""
                decoding="async"
                loading="lazy"
              />
            ) : (
              <span className={styles.thumbPlaceholder} aria-hidden="true">
                ◦
              </span>
            )}
            <span className={styles.thumbLabel}>{alt.display_name}</span>
            {alt.last_saved_unix > 0 && (
              <span className={styles.thumbTimestamp}>
                {formatRelative(alt.last_saved_unix, now)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
