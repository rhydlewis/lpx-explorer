import type { ProjectStatus } from "../../store/project-store";

import { CompatibilityVerdict } from "./CompatibilityVerdict";
import { InspectorSkeleton } from "./InspectorSkeleton";
import { PluginList } from "./PluginList";
import { ProjectHeader } from "./ProjectHeader";
import { ProjectInfo } from "./ProjectInfo";
import { TrackList } from "./TrackList";

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
      <div role="alert">
        Error parsing <code>{status.path}</code>: {status.message}
      </div>
    );
  }

  return (
    <>
      <ProjectHeader path={status.path} />
      <CompatibilityVerdict />
      <ProjectInfo
        metadata={status.summary.metadata}
        stats={status.summary.stats}
      />
      <TrackList tracks={status.summary.tracks} />
      <PluginList summary={status.summary} />
    </>
  );
}
