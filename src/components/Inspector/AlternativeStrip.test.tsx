import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import type { Alternative } from "../../lib/types";

import { AlternativeStrip } from "./AlternativeStrip";

const twoAlts: ReadonlyArray<Alternative> = [
  {
    index: 0,
    display_name: "new idea",
    is_active: false,
    window_image_path:
      "/Users/r/Music/Logic/new idea.logicx/Alternatives/000/WindowImage.jpg",
    last_saved_unix: 0,
  },
  {
    index: 1,
    display_name: "new idea - alt 1",
    is_active: true,
    window_image_path:
      "/Users/r/Music/Logic/new idea.logicx/Alternatives/001/WindowImage.jpg",
    last_saved_unix: 0,
  },
];

describe("<AlternativeStrip />", () => {
  it("renders one thumbnail button per alternative", () => {
    render(
      <AlternativeStrip
        alternatives={twoAlts}
        activeVariantIndex={1}
        onSelectAlternative={() => {}}
      />,
    );

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(2);
    // Each button label includes the alternative display_name so screen
    // reader users can distinguish them.
    expect(
      screen.getByRole("button", { name: /new idea(?! - alt 1)/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /new idea - alt 1/i }),
    ).toBeInTheDocument();
  });

  it("calls onSelectAlternative with the clicked alternative's index", () => {
    // Strip IS the selector — clicking swaps the active alt. Parent
    // owns the state, so we just assert the callback fires.
    const onSelect = vi.fn();
    render(
      <AlternativeStrip
        alternatives={twoAlts}
        activeVariantIndex={1}
        onSelectAlternative={onSelect}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /new idea(?! - alt)/i }));

    expect(onSelect).toHaveBeenCalledWith(0);
  });

  it("marks the active alternative with aria-current=true", () => {
    // Screen-reader semantics: aria-current="true" tells AT users which
    // thumbnail is the currently-loaded alternative. CSS uses
    // data-active for the visual highlight.
    render(
      <AlternativeStrip
        alternatives={twoAlts}
        activeVariantIndex={1}
        onSelectAlternative={() => {}}
      />,
    );

    const active = screen.getByRole("button", { name: /new idea - alt 1/i });
    const inactive = screen.getByRole("button", {
      name: /new idea(?! - alt)/i,
    });
    expect(active).toHaveAttribute("aria-current", "true");
    expect(inactive).not.toHaveAttribute("aria-current");
  });

  it("ArrowRight/ArrowLeft on a focused thumbnail moves to the next/prev alternative", () => {
    // Keyboard parity with the dropdown. Arrow keys select AND move
    // focus so the user can scrub through alternatives quickly.
    const onSelect = vi.fn();
    render(
      <AlternativeStrip
        alternatives={twoAlts}
        activeVariantIndex={0}
        onSelectAlternative={onSelect}
      />,
    );

    const first = screen.getByRole("button", { name: /new idea(?! - alt)/i });
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });

    expect(onSelect).toHaveBeenLastCalledWith(1);

    // Wraps at the end: ArrowRight on the last alt stays put (no wrap).
    const last = screen.getByRole("button", { name: /new idea - alt 1/i });
    last.focus();
    fireEvent.keyDown(last, { key: "ArrowRight" });
    // Still only one prior call — no extra invocation.
    expect(onSelect).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(last, { key: "ArrowLeft" });
    expect(onSelect).toHaveBeenLastCalledWith(0);
  });

  it("renders a relative-time caption under each thumbnail when last_saved_unix is known", () => {
    // Helps users tell apart alternatives by recency — useful when the
    // display names are similar ('intro v1' / 'intro v2'). 10-day delta
    // → formatRelative lands in 'last week'.
    const tenDays = 10 * 86400;
    const base = 1715000000;
    const withTimes: ReadonlyArray<Alternative> = [
      { ...twoAlts[0], last_saved_unix: base },
      { ...twoAlts[1], last_saved_unix: base },
    ];

    render(
      <AlternativeStrip
        alternatives={withTimes}
        activeVariantIndex={1}
        onSelectAlternative={() => {}}
        now={new Date((base + tenDays) * 1000)}
      />,
    );

    // Both thumbs share the same saved-time, so the caption appears twice.
    const captions = screen.getAllByText(/last week/i);
    expect(captions).toHaveLength(2);
  });

  it("omits the caption when last_saved_unix is 0 (unknown)", () => {
    // 0 = mtime unreadable / file missing. Don't render "53 years ago".
    render(
      <AlternativeStrip
        alternatives={twoAlts}
        activeVariantIndex={1}
        onSelectAlternative={() => {}}
      />,
    );

    // No timestamp text rendered; only the display names + thumbs.
    expect(screen.queryByText(/ago|last/i)).not.toBeInTheDocument();
  });
});
