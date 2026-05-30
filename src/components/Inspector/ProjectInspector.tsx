import { useProjectStore, type ProjectStatus } from "../../store/project-store";
import { ErrorCard } from "../ErrorCard";

import { AudioPreview } from "./AudioPreview";
import { CompatibilityVerdict } from "./CompatibilityVerdict";
import sectionStyles from "./Inspector.module.css";
import { InspectorSkeleton } from "./InspectorSkeleton";
import { MissingManifestBanner } from "./MissingManifestBanner";
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

  const setActiveVariant = useProjectStore.getState().setActiveVariant;

  return (
    <>
      <MissingManifestBanner missing={status.projectInformationMissing} />
      <ProjectHeader path={status.path}>
        <CompatibilityVerdict />
      </ProjectHeader>
      <ProjectWindow
        alternatives={status.alternatives}
        activeVariantIndex={status.activeVariantIndex}
        onSelectAlternative={(index) => void setActiveVariant(index)}
        lastSavedUnix={status.summary.stats.modified_at_unix}
      />
      <AudioPreview path={status.path} />
      <div className={sectionStyles.metaTracksGrid}>
        <ProjectInfo
          metadata={status.summary.metadata}
          stats={status.summary.stats}
        />
        <TrackList tracks={status.summary.tracks} />
      </div>
    </>
  );
}
