import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PluginName } from "./PluginName";

const LONG =
  "Universal Audio (UADx): UADx Century Tube Channel Strip Collection";

describe("PluginName", () => {
  it("renders the full name in the DOM so it is never lost to the ellipsis", () => {
    render(<PluginName displayName={LONG} expanded={false} onToggle={() => {}} />);

    expect(screen.getByText(LONG)).toBeInTheDocument();
  });

  it("carries the full name as a title for pointer users", () => {
    render(<PluginName displayName={LONG} expanded={false} onToggle={() => {}} />);

    expect(screen.getByRole("button", { name: LONG })).toHaveAttribute(
      "title",
      LONG,
    );
  });

  it("marks itself collapsed so CSS can clip it to one line", () => {
    render(<PluginName displayName={LONG} expanded={false} onToggle={() => {}} />);

    const name = screen.getByRole("button", { name: LONG });
    expect(name).toHaveAttribute("data-expanded", "false");
    expect(name).toHaveAttribute("aria-expanded", "false");
  });

  it("marks itself expanded so CSS can unclamp it to full wrap", () => {
    render(<PluginName displayName={LONG} expanded onToggle={() => {}} />);

    const name = screen.getByRole("button", { name: LONG });
    expect(name).toHaveAttribute("data-expanded", "true");
    expect(name).toHaveAttribute("aria-expanded", "true");
  });

  it("asks the row to toggle when activated", () => {
    const onToggle = vi.fn();
    render(<PluginName displayName={LONG} expanded={false} onToggle={onToggle} />);

    fireEvent.click(screen.getByRole("button", { name: LONG }));

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("stops the click from reaching an enclosing control", () => {
    // Library rows nest the name inside a row that has its own click
    // behaviour — expanding a name must not also toggle the row.
    let outerClicks = 0;
    render(
      <div onClick={() => (outerClicks += 1)}>
        <PluginName displayName={LONG} expanded={false} onToggle={() => {}} />
      </div>,
    );

    fireEvent.click(screen.getByRole("button", { name: LONG }));

    expect(outerClicks).toBe(0);
  });
});
