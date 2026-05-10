import { useEffect, useRef } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { X } from "lucide-react";

import styles from "./WindowImageLightbox.module.css";

interface Props {
  readonly imagePath: string;
  readonly alternativeName: string;
  readonly onClose: () => void;
}

export function WindowImageLightbox({ imagePath, alternativeName, onClose }: Props) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    // Move focus to the close button so keyboard users can dismiss
    // without hunting; Tab from here stays inside the (very small)
    // dialog content. Browser-managed Tab order is sufficient — no
    // explicit focus trap needed for a 1-button dialog.
    closeButtonRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${alternativeName} — Logic window screenshot`}
      className={styles.backdrop}
      onClick={onClose}
    >
      <div
        className={styles.panel}
        // Clicks inside the panel must not bubble to the backdrop — only
        // the empty area dismisses the lightbox.
        onClick={(e) => e.stopPropagation()}
      >
        <button
          ref={closeButtonRef}
          type="button"
          className={styles.closeButton}
          aria-label="Close"
          onClick={onClose}
        >
          <X size="1.2em" aria-hidden="true" />
        </button>
        <img
          className={styles.image}
          src={convertFileSrc(imagePath)}
          alt={`${alternativeName} — Logic window at last save`}
          decoding="async"
        />
      </div>
    </div>
  );
}
