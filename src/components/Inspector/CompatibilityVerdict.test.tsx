import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { CompatibilityVerdict } from "./CompatibilityVerdict";

describe("<CompatibilityVerdict />", () => {
  it("exposes the section under aria-label='compatibility'", () => {
    render(<CompatibilityVerdict />);

    expect(
      screen.getByRole("region", { name: "compatibility" }),
    ).toBeInTheDocument();
  });

  it("defaults to the unknown variant when no status is supplied", () => {
    render(<CompatibilityVerdict />);

    expect(
      screen.getByText(/au registry not yet scanned/i),
    ).toBeInTheDocument();
  });

  it("renders the clean variant with green status + 'Opens cleanly'", () => {
    render(<CompatibilityVerdict status="clean" />);

    expect(screen.getByText(/opens cleanly/i)).toBeInTheDocument();
  });

  it("renders the warnings variant with amber status + 'Has warnings'", () => {
    render(<CompatibilityVerdict status="warnings" />);

    expect(screen.getByText(/has warnings/i)).toBeInTheDocument();
  });

  it("renders the will-not-open variant with red status", () => {
    render(<CompatibilityVerdict status="will-not-open" />);

    expect(screen.getByText(/will not open/i)).toBeInTheDocument();
  });

  it("forwards an optional summary line under the pill", () => {
    render(
      <CompatibilityVerdict
        status="warnings"
        summary="3 plug-ins missing on this Mac"
      />,
    );

    expect(
      screen.getByText("3 plug-ins missing on this Mac"),
    ).toBeInTheDocument();
  });

  it("encodes the status as a data-status attribute on the pill (for CSS)", () => {
    const { container } = render(<CompatibilityVerdict status="clean" />);

    expect(container.querySelector("[data-status='clean']")).not.toBeNull();
  });
});
