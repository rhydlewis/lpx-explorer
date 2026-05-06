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
  it("renders the four main-column regions when a project is loaded", () => {
    // Plug-ins moved to the right rail (PluginRail). 'Track Registry' and
    // 'Plug-in Chains' merged into a single 'tracks' region in
    // lpx-explorer-bul — the registry-vs-chains split was an
    // implementation seam, not a user concept.
    render(<ProjectInspector status={loaded} />);

    expect(screen.getByRole("region", { name: "project" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "compatibility" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "project info" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "tracks" })).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "plug-in chains" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "plug-ins" }),
    ).not.toBeInTheDocument();
  });

  it("renders the compatibility band immediately after the project header, before project info", () => {
    // The verdict is the JTBD payload — it sits as a hero band directly
    // under the project name, above all metadata sections. Locked in by
    // the 2026-05-06 PM/Whimsy review.
    const { container } = render(<ProjectInspector status={loaded} />);

    const regions = Array.from(
      container.querySelectorAll("section[aria-label]"),
    ).map((el) => el.getAttribute("aria-label"));

    const projectIdx = regions.indexOf("project");
    const compatIdx = regions.indexOf("compatibility");
    const infoIdx = regions.indexOf("project info");
    expect(projectIdx).toBeGreaterThanOrEqual(0);
    expect(compatIdx).toBe(projectIdx + 1);
    expect(compatIdx).toBeLessThan(infoIdx);
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
    expect(screen.queryByRole("region", { name: "tracks" })).not.toBeInTheDocument();
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
    expect(screen.queryByRole("region", { name: "tracks" })).not.toBeInTheDocument();
  });
});
