import { Skeleton } from "../Skeleton";

import sectionStyles from "./Inspector.module.css";

interface Props {
  readonly path: string;
}

/**
 * Block-shaped placeholders matching the final Inspector row geometry —
 * shown while `parse_project` is in flight. Five regions in the same
 * order as the live `<ProjectInspector>`: project header, compatibility
 * pill, project info grid, tracks, plug-ins.
 *
 * Aria-hidden because the skeleton blocks are decorative; the
 * `aria-live="polite"` "Parsing…" announcement carries the loading
 * status for assistive tech.
 */
export function InspectorSkeleton({ path }: Props) {
  return (
    <div>
      <p aria-live="polite" className={sectionStyles.placeholder}>
        Parsing {path}…
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
      <section aria-hidden="true" className={sectionStyles.section}>
        <Skeleton height={10} width="20%" />
        <Skeleton
          height={11}
          width="50%"
          style={{ marginTop: "var(--s-2)" }}
        />
        <Skeleton
          height={11}
          width="45%"
          style={{ marginTop: "var(--s-1)" }}
        />
      </section>
    </div>
  );
}
