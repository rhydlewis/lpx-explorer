import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { ProjectHeader } from "./ProjectHeader";

describe("<ProjectHeader />", () => {
  it("renders the project name extracted from a .logicx path", () => {
    render(
      <ProjectHeader path="/Users/rhyd/Music/Logic/arp strings.logicx" />,
    );

    expect(screen.getByRole("heading", { name: "arp strings" })).toBeInTheDocument();
  });

  it("renders the full bundle path as secondary text", () => {
    const path = "/Users/rhyd/Music/Logic/Demo song.logicx";
    render(<ProjectHeader path={path} />);

    expect(screen.getByText(path)).toBeInTheDocument();
  });

  it("strips a trailing slash before extracting the name", () => {
    render(<ProjectHeader path="/path/to/Mix.logicx/" />);

    expect(screen.getByRole("heading", { name: "Mix" })).toBeInTheDocument();
  });

  it("exposes the section under aria-label='project' (Logic terminology)", () => {
    render(<ProjectHeader path="/x.logicx" />);

    expect(screen.getByRole("region", { name: "project" })).toBeInTheDocument();
  });
});
