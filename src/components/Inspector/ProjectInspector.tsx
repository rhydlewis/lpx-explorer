import { useProjectStore, type ProjectStatus } from "../../store/project-store";
import { ErrorCard } from "../ErrorCard";

import { AlternativeStrip } from "./AlternativeStrip";
import { CompatibilityVerdict } from "./CompatibilityVerdict";
import { InspectorSkeleton } from "./InspectorSkeleton";
import { ProjectHeader } from "./ProjectHeader";
import { ProjectInfo } from "./ProjectInfo";
import { ProjectWindow } from "./ProjectWindow";
import { TrackList } from "./TrackList";

interface Props {
  readonly status: ProjectStatus;
}

export function ProjectInspector({ status }: Props) {
  if (status.kind === "idle") {
    return null;
  }

  if (status.kind === "loading") {
    return <InspectorSkeleton />;
  }

  if (status.kind === "error") {
    return (
      <ErrorCard
        headline="Couldn't open project"
        subhead={<code>{status.path}</code>}
        detail={status.message}
        onRetry={() => {
          void useProjectStore.getState().select(status.path);
        }}
      />
    );
  }

  const activeAlternative = status.alternatives.find(
    (a) => a.index === status.activeVariantIndex,
  );
  const setActiveVariant = useProjectStore.getState().setActiveVariant;

  return (
    <>
      <ProjectHeader path={status.path} />
      <CompatibilityVerdict />
      <ProjectWindow
        windowImagePath={activeAlternative?.window_image_path ?? null}
        lastSavedUnix={status.summary.stats.modified_at_unix}
      />
      {status.alternatives.length > 1 && (
        <AlternativeStrip
          alternatives={status.alternatives}
          activeVariantIndex={status.activeVariantIndex}
          onSelectAlternative={(index) => void setActiveVariant(index)}
        />
      )}
      <ProjectInfo
        metadata={status.summary.metadata}
        stats={status.summary.stats}
      />
      <TrackList tracks={status.summary.tracks} />
    </>
  );
}
