import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import type { ProjectStatus } from "../../store/project-store";
import { makeSummary } from "../../test/fixtures";

import { ProjectInspector } from "./ProjectInspector";

const loaded: ProjectStatus = {
  kind: "loaded",
  path: "/Users/rhyd/Music/Logic/song.logicx",
  summary: makeSummary(),
};

describe("<ProjectInspector />", () => {
  it("renders the five main-column regions when a project is loaded", () => {
    // Plug-ins moved to the right rail (PluginRail) — App.tsx wires that
    // up alongside the Inspector. ProjectInspector itself no longer
    // renders the 'plug-ins' region.
    render(<ProjectInspector status={loaded} />);

    expect(screen.getByRole("region", { name: "project" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "compatibility" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "project info" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "tracks" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "plug-in chains" })).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "plug-ins" }),
    ).not.toBeInTheDocument();
  });

  it("renders the bundle path inside the project header", () => {
    render(<ProjectInspector status={loaded} />);

    expect(
      screen.getByRole("heading", { name: "song" }),
    ).toBeInTheDocument();
  });

  it("renders nothing when status is idle", () => {
    const { container } = render(
      <ProjectInspector status={{ kind: "idle" }} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("renders the loading skeleton during parse", () => {
    render(
      <ProjectInspector
        status={{ kind: "loading", path: "/x.logicx" }}
      />,
    );

    // 'Parsing /x.logicx…' is the aria-live announcement.
    expect(screen.getByText(/parsing/i)).toBeInTheDocument();
    // No section regions yet during loading — the verdict-and-tracks shape is
    // for the loaded state. (Skeleton sections are aria-hidden.)
    expect(screen.queryByRole("region", { name: "plug-in chains" })).not.toBeInTheDocument();
  });

  it("replaces the sections with an error card when parse fails", () => {
    render(
      <ProjectInspector
        status={{
          kind: "error",
          path: "/broken.logicx",
          message: "ProjectData not found",
        }}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(/projectdata not found/i);
    expect(screen.queryByRole("region", { name: "plug-in chains" })).not.toBeInTheDocument();
  });
});
