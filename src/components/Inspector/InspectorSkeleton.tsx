import { Skeleton } from "../Skeleton";

import sectionStyles from "./Inspector.module.css";

/**
 * Block-shaped placeholders matching the final Inspector row geometry —
 * shown while `parse_project` is in flight. Four regions in the same
 * order as the live `<ProjectInspector>`: project header, compatibility
 * band, project info grid, tracks.
 *
 * Aria-hidden because the skeleton blocks are decorative; the
 * `aria-live="polite"` "Reading project…" announcement carries the
 * loading status for assistive tech.
 */
export function InspectorSkeleton() {
  return (
    <div>
      <p aria-live="polite" className={sectionStyles.placeholder}>
        Reading project…
      </p>
      <section aria-hidden="true" className={sectionStyles.section}>
        <Skeleton height={18} width="40%" />
        <Skeleton
          height={11}
          width="70%"
          style={{ marginTop: "var(--s-1)" }}
        />
      </section>
      <section aria-hidden="true" className={sectionStyles.section}>
        <Skeleton height={10} width="20%" />
        <Skeleton
          height={28}
          width="40%"
          style={{ marginTop: "var(--s-2)" }}
        />
      </section>
      <section aria-hidden="true" className={sectionStyles.section}>
        <Skeleton height={10} width="20%" />
        <Skeleton
          height={11}
          width="60%"
          style={{ marginTop: "var(--s-2)" }}
        />
        <Skeleton
          height={11}
          width="50%"
          style={{ marginTop: "var(--s-1)" }}
        />
        <Skeleton
          height={11}
          width="55%"
          style={{ marginTop: "var(--s-1)" }}
        />
      </section>
      <section aria-hidden="true" className={sectionStyles.section}>
        <Skeleton height={10} width="20%" />
        <Skeleton
          height={14}
          width="40%"
          style={{ marginTop: "var(--s-2)" }}
        />
        <Skeleton
          height={14}
          width="35%"
          style={{ marginTop: "var(--s-1)" }}
        />
      </section>
    </div>
  );
}
