import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import type { Track } from "../../lib/types";

import { TrackList } from "./TrackList";

function track(overrides: Partial<Track> = {}): Track {
  return {
    name: "Audio 1",
    kind: "audio",
    offset: 100,
    is_active: false,
    instrument: null,
    midi_fx: [],
    audio_fx: [],
    sub_number: null,
    parent_offset: null,
    ...overrides,
  };
}

describe("<TrackList />", () => {
  it("exposes the section under aria-label='tracks'", () => {
    render(<TrackList tracks={[]} />);

    expect(screen.getByRole("region", { name: "tracks" })).toBeInTheDocument();
  });

  it("renders 'No tracks detected.' when the list is empty", () => {
    render(<TrackList tracks={[]} />);

    expect(screen.getByText(/no tracks detected/i)).toBeInTheDocument();
  });

  it("renders 'No tracks detected.' when only routing kinds are present", () => {
    render(
      <TrackList
        tracks={[
          track({ name: "Master", kind: "master", offset: 1 }),
          track({ name: "Bus 1", kind: "bus", offset: 2 }),
          track({ name: "Aux 1", kind: "aux", offset: 3 }),
        ]}
      />,
    );

    expect(screen.getByText(/no tracks detected/i)).toBeInTheDocument();
  });

  it("renders user-visible kinds and hides routing kinds", () => {
    render(
      <TrackList
        tracks={[
          track({ name: "Audio 1", kind: "audio", offset: 1 }),
          track({ name: "Master", kind: "master", offset: 2 }),
          track({ name: "Inst 1", kind: "instrument", offset: 3 }),
          track({ name: "Bus 1", kind: "bus", offset: 4 }),
        ]}
      />,
    );

    expect(screen.getByText("Audio 1")).toBeInTheDocument();
    expect(screen.getByText("Inst 1")).toBeInTheDocument();
    expect(screen.queryByText("Master")).not.toBeInTheDocument();
    expect(screen.queryByText("Bus 1")).not.toBeInTheDocument();
  });

  it("renders rows in byte-offset order", () => {
    const { container } = render(
      <TrackList
        tracks={[
          track({ name: "C", offset: 300 }),
          track({ name: "A", offset: 100 }),
          track({ name: "B", offset: 200 }),
        ]}
      />,
    );

    const rendered = Array.from(container.querySelectorAll("[data-track-kind]"))
      .map((el) => el.querySelector("[title]")?.textContent ?? "");
    expect(rendered).toEqual(["A", "B", "C"]);
  });

  it("indents summing-stack children one level under the parent", () => {
    const parent = track({
      name: "Sub 1",
      kind: "summing-stack",
      offset: 100,
    });
    const child = track({
      name: "Kick",
      kind: "instrument",
      offset: 200,
      parent_offset: 100,
    });
    const { container } = render(<TrackList tracks={[parent, child]} />);

    const childRow = container.querySelector('[data-track-depth="1"]');
    expect(childRow).not.toBeNull();
    expect(childRow?.textContent).toContain("Kick");
  });

  it("renders folders flat — children do NOT nest under folders", () => {
    const folder = track({ name: "GTRs", kind: "folder", offset: 100 });
    const child = track({
      name: "GTR 1",
      kind: "audio",
      offset: 200,
      parent_offset: 100,
    });
    const { container } = render(<TrackList tracks={[folder, child]} />);

    const childRow = container.querySelector('[data-track-depth="1"]');
    // child has parent_offset matching the folder, but folders don't nest.
    expect(childRow).toBeNull();
  });
});
