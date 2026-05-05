import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { TopBar } from "./TopBar";

describe("<TopBar />", () => {
  it("renders the app name when no project is selected", () => {
    render(<TopBar />);

    expect(screen.getByText(/lpx explorer/i)).toBeInTheDocument();
  });

  it("renders the project name when one is selected", () => {
    render(<TopBar projectName="arp strings" />);

    expect(screen.getByText("arp strings")).toBeInTheDocument();
  });

  it("does not render the app name when a project is selected", () => {
    render(<TopBar projectName="some project" />);

    expect(screen.queryByText(/^lpx explorer$/i)).not.toBeInTheDocument();
  });
});
