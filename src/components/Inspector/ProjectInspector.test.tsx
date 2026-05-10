import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import type { ProjectStatus } from "../../store/project-store";
import { makeSummary } from "../../test/fixtures";

import { ProjectInspector } from "./ProjectInspector";

const loaded: ProjectStatus = {
  kind: "loaded",
  path: "/Users/rhyd/Music/Logic/song.logicx",
  summary: makeSummary(),
alternatives: [{ index: 0, display_name: "x", is_active: true, window_image_path: null }],
activeVariantIndex: 0,
};

describe("<ProjectInspector />", () => {
  it("renders the five main-column regions when a project is loaded", () => {
    // Plug-ins moved to the right rail (PluginRail). 'Track Registry' and
    // 'Plug-in Chains' merged into a single 'tracks' region in
    // lpx-explorer-bul — the registry-vs-chains split was an
    // implementation seam, not a user concept. 'project window' added in
    // lpx-explorer-jyw as the recognition hero.
    render(<ProjectInspector status={loaded} />);

    expect(screen.getByRole("region", { name: "project" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "compatibility" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "project window" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "project info" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "tracks" })).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "plug-in chains" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "plug-ins" }),
    ).not.toBeInTheDocument();
  });

  it("renders the alternative strip only when the project has >1 alternative", () => {
    // Single-alt projects: strip is noise. Multi-alt projects: the strip
    // IS the selector. Visibility is decided at the inspector level so
    // the strip component itself stays focused on rendering.
    const single = render(<ProjectInspector status={loaded} />);
    expect(
      single.queryByRole("group", { name: "alternatives" }),
    ).not.toBeInTheDocument();
    single.unmount();

    const multi: ProjectStatus = {
      ...loaded,
      alternatives: [
        { index: 0, display_name: "a", is_active: true, window_image_path: null },
        { index: 1, display_name: "b", is_active: false, window_image_path: null },
      ],
    };
    render(<ProjectInspector status={multi} />);
    expect(
      screen.getByRole("group", { name: "alternatives" }),
    ).toBeInTheDocument();
  });

  it("renders the project-window hero between compatibility and project info", () => {
    // PM placement: the WindowImage is the recognition hero, so it sits
    // immediately under the compatibility band and above the metadata
    // grid. Order check guards against accidental relocation.
    const { container } = render(<ProjectInspector status={loaded} />);

    const regions = Array.from(
      container.querySelectorAll("section[aria-label]"),
    ).map((el) => el.getAttribute("aria-label"));

    const compatIdx = regions.indexOf("compatibility");
    const windowIdx = regions.indexOf("project window");
    const infoIdx = regions.indexOf("project info");
    expect(compatIdx).toBeGreaterThanOrEqual(0);
    expect(windowIdx).toBe(compatIdx + 1);
    expect(windowIdx).toBeLessThan(infoIdx);
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

    // 'Reading project…' is the aria-live announcement (path is not
    // shown — the skeleton blocks already imply where it's coming from).
    expect(screen.getByText(/reading project/i)).toBeInTheDocument();
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
