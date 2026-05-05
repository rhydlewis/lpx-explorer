import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import type { TrackRegistryEntry } from "../../lib/types";

import { TrackRegistry } from "./TrackRegistry";

function entry(overrides: Partial<TrackRegistryEntry> = {}): TrackRegistryEntry {
  return {
    offset: 100,
    name: "Piano",
    kind: "instrument",
    track_id: 1,
    strip_id: 0,
    ...overrides,
  };
}

describe("<TrackRegistry />", () => {
  it("exposes the section under aria-label='tracks'", () => {
    render(<TrackRegistry entries={[]} />);

    expect(
      screen.getByRole("region", { name: "tracks" }),
    ).toBeInTheDocument();
  });

  it("renders the empty state when no entries are provided", () => {
    render(<TrackRegistry entries={[]} />);

    expect(screen.getByText(/no tracks identified/i)).toBeInTheDocument();
  });

  it("renders one row per entry, sorted by byte offset", () => {
    const { container } = render(
      <TrackRegistry
        entries={[
          entry({ name: "C", offset: 300 }),
          entry({ name: "A", offset: 100 }),
          entry({ name: "B", offset: 200 }),
        ]}
      />,
    );

    const rows = Array.from(container.querySelectorAll("[data-track-kind]"));
    const names = rows.map((row) => row.querySelector("[title]")?.textContent ?? "");
    expect(names).toEqual(["A", "B", "C"]);
  });

  it("does not show a coverage note when registry count matches track_count", () => {
    render(
      <TrackRegistry
        entries={[entry({ name: "Piano" }), entry({ name: "Drums", offset: 200 })]}
        trackCount={2}
      />,
    );

    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("surfaces a coverage note when the registry undercounts MetaData track_count", () => {
    render(
      <TrackRegistry
        entries={[entry({ name: "Piano" }), entry({ name: "Drums", offset: 200 })]}
        trackCount={6}
      />,
    );

    const note = screen.getByRole("note");
    expect(note).toHaveTextContent(/2 of 6 tracks identified/);
    expect(note).toHaveTextContent(/NSKeyedArchive/i);
  });

  it("does not show a coverage note when no track_count is supplied", () => {
    render(<TrackRegistry entries={[entry()]} />);

    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });
});
