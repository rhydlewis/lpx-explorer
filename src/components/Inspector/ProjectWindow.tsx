import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";

import type { Alternative } from "../../lib/types";
import { formatRelative } from "../../lib/time-utils";

import { AlternativeStrip } from "./AlternativeStrip";
import sectionStyles from "./Inspector.module.css";
import styles from "./ProjectWindow.module.css";
import { WindowImageLightbox } from "./WindowImageLightbox";

interface Props {
  readonly alternatives: ReadonlyArray<Alternative>;
  readonly activeVariantIndex: number;
  readonly onSelectAlternative: (index: number) => void;
  /** Bundle modified-time. Drives the "Snapshot from last save · …" caption. */
  readonly lastSavedUnix: number;
  /** Reference instant for relative-time formatting. Tests pin it. */
  readonly now?: Date;
}

interface MenuPos {
  readonly x: number;
  readonly y: number;
}

export function ProjectWindow({
  alternatives,
  activeVariantIndex,
  onSelectAlternative,
  lastSavedUnix,
  now = new Date(),
}: Props) {
  const active = alternatives.find((a) => a.index === activeVariantIndex);
  const windowImagePath = active?.window_image_path ?? null;
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null);

  // Dismiss the image context menu on outside mousedown / Escape, and
  // only while it's open (mirrors ProjectHeader's pattern).
  useEffect(() => {
    if (menuPos === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuPos(null);
    };
    const onMouseDown = () => setMenuPos(null);
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onMouseDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onMouseDown);
    };
  }, [menuPos]);

  return (
    <section aria-label="project window" className={sectionStyles.section}>
      <h3 className={sectionStyles.sectionLabel}>Project</h3>
      <div className={styles.layout}>
        <AlternativeStrip
          alternatives={alternatives}
          activeVariantIndex={activeVariantIndex}
          onSelectAlternative={onSelectAlternative}
          now={now}
        />
        {windowImagePath !== null ? (
          <figure className={styles.figure}>
            <img
              className={styles.image}
              src={convertFileSrc(windowImagePath)}
              alt="Logic window at last save"
              decoding="async"
              loading="lazy"
              onDoubleClick={() => setLightboxOpen(true)}
              // Suppress the WebView's default image menu — its 'Open
              // Image in New Window' is a dead no-op on asset:// URLs
              // (lpx-explorer-l7e) — and show our own working entry.
              onContextMenu={(e) => {
                e.preventDefault();
                setMenuPos({ x: e.clientX, y: e.clientY });
              }}
            />
            <figcaption className={styles.caption}>
              Snapshot from last save · {formatRelative(lastSavedUnix, now)}
            </figcaption>
          </figure>
        ) : (
          <p className={styles.placeholder}>
            No preview available — saved with older Logic.
          </p>
        )}
      </div>
      {menuPos !== null && (
        <div
          role="menu"
          className={styles.contextMenu}
          style={{ top: menuPos.y, left: menuPos.x }}
          // Stop the global mousedown from dismissing the menu before the
          // item's onClick runs.
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            className={styles.contextMenuItem}
            onClick={() => {
              setLightboxOpen(true);
              setMenuPos(null);
            }}
          >
            Open Image in New Window
          </button>
        </div>
      )}
      {lightboxOpen && windowImagePath !== null && (
        <WindowImageLightbox
          imagePath={windowImagePath}
          alternativeName={active?.display_name ?? ""}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </section>
  );
}
