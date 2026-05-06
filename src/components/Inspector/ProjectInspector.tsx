import { useProjectStore, type ProjectStatus } from "../../store/project-store";
import { ErrorCard } from "../ErrorCard";

import { CompatibilityVerdict } from "./CompatibilityVerdict";
import { InspectorSkeleton } from "./InspectorSkeleton";
import { ProjectHeader } from "./ProjectHeader";
import { ProjectInfo } from "./ProjectInfo";
import { TrackList } from "./TrackList";
import { TrackRegistry } from "./TrackRegistry";

interface Props {
  readonly status: ProjectStatus;
}

export function ProjectInspector({ status }: Props) {
  if (status.kind === "idle") {
    return null;
  }

  if (status.kind === "loading") {
    return <InspectorSkeleton path={status.path} />;
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

  return (
    <>
      <ProjectHeader path={status.path} />
      <CompatibilityVerdict />
      <ProjectInfo
        metadata={status.summary.metadata}
        stats={status.summary.stats}
        tracksRegistryCount={status.summary.tracks_registry.length}
      />
      <TrackRegistry
        entries={status.summary.tracks_registry}
        trackCount={status.summary.metadata.track_count}
      />
      <TrackList tracks={status.summary.tracks} />
    </>
  );
}
