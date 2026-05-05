import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { ProjectRow } from "./ProjectRow";

describe("<ProjectRow />", () => {
  it("renders the project name and path hint", () => {
    render(
      <ProjectRow
        name="arp strings"
        path="/Users/rhyd/Music/Logic/arp strings.logicx"
        status="neutral"
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText("arp strings")).toBeInTheDocument();
    expect(
      screen.getByText("/Users/rhyd/Music/Logic/arp strings.logicx"),
    ).toBeInTheDocument();
  });

  it("renders a status dot reflecting the supplied status", () => {
    const { container } = render(
      <ProjectRow
        name="x"
        path="/x.logicx"
        status="warn"
        onSelect={vi.fn()}
      />,
    );

    expect(container.querySelector("[data-status='warn']")).not.toBeNull();
  });

  it("invokes onSelect when clicked", () => {
    const handler = vi.fn();
    render(
      <ProjectRow
        name="x"
        path="/x.logicx"
        status="neutral"
        onSelect={handler}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /x/i }));

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("exposes aria-current when selected", () => {
    render(
      <ProjectRow
        name="x"
        path="/x.logicx"
        status="neutral"
        selected
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /x/i })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("does not set aria-current when not selected", () => {
    render(
      <ProjectRow
        name="x"
        path="/x.logicx"
        status="neutral"
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /x/i })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("exposes the full path via the button's title attribute (long-name truncation)", () => {
    const longPath = `/Users/rhyd/Music/Logic/${"a".repeat(200)}.logicx`;
    render(
      <ProjectRow
        name="long"
        path={longPath}
        status="neutral"
        onSelect={vi.fn()}
      />,
    );

    const button = screen.getByRole("button", { name: /long/i });
    // Visible text is CSS-truncated; full string lives on title for hover.
    expect(button).toHaveAttribute("title", longPath);
  });
});
