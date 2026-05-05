import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { EmptyState } from "./EmptyState";

describe("<EmptyState />", () => {
  it("renders the tagline and reassurance copy", () => {
    render(<EmptyState onPickProject={vi.fn()} />);

    expect(
      screen.getByText(/Inspect Logic Pro projects without opening Logic\./i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Read-only\. We never write to your projects\./i),
    ).toBeInTheDocument();
  });

  it("renders Pick project and Open folder buttons", () => {
    render(<EmptyState onPickProject={vi.fn()} />);

    expect(
      screen.getByRole("button", { name: /pick project/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /open folder/i }),
    ).toBeInTheDocument();
  });

  it("invokes onPickProject when the Pick project button is clicked", () => {
    const handler = vi.fn();
    render(<EmptyState onPickProject={handler} />);

    fireEvent.click(screen.getByRole("button", { name: /pick project/i }));

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("renders Open folder as disabled until folder scanning lands", () => {
    render(<EmptyState onPickProject={vi.fn()} />);

    const openFolder = screen.getByRole("button", { name: /open folder/i });
    expect(openFolder).toHaveAttribute("aria-disabled", "true");
  });
});
