import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { ProjectInfo } from "./ProjectInfo";

describe("<ProjectInfo />", () => {
  it("exposes the section under aria-label='project info' (Logic terminology)", () => {
    render(<ProjectInfo />);

    expect(
      screen.getByRole("region", { name: "project info" }),
    ).toBeInTheDocument();
  });

  it("explains that metadata extraction lands later", () => {
    render(<ProjectInfo />);

    expect(
      screen.getByText(/metadata extraction/i),
    ).toBeInTheDocument();
  });
});
