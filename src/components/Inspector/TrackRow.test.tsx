import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import type { AURef, Track } from "../../lib/types";

import { TrackRow } from "./TrackRow";

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

const inst = (subtype: string): AURef => ({
  type_code: "aumu",
  subtype,
  manufacturer: "Toon",
  offset: 200,
});
const aufx = (subtype: string): AURef => ({
  type_code: "aufx",
  subtype,
  manufacturer: "Yamh",
  offset: 300,
});
const aumf = (subtype: string): AURef => ({
  type_code: "aumf",
  subtype,
  manufacturer: "SToy",
  offset: 400,
});

describe("<TrackRow />", () => {
  it("renders the track name", () => {
    render(<TrackRow track={track({ name: "Drums" })} depth={0} />);

    expect(screen.getByText("Drums")).toBeInTheDocument();
  });

  it("encodes the kind in a data attribute for icon CSS", () => {
    const { container } = render(
      <TrackRow track={track({ kind: "instrument" })} depth={0} />,
    );

    expect(
      container.querySelector("[data-track-kind='instrument']"),
    ).not.toBeNull();
  });

  it("encodes the depth in a data attribute (used by CSS for indent)", () => {
    const { container } = render(<TrackRow track={track()} depth={2} />);

    expect(container.querySelector("[data-track-depth='2']")).not.toBeNull();
  });

  it("renders an active StatusDot when the track is active", () => {
    const { container } = render(
      <TrackRow track={track({ is_active: true })} depth={0} />,
    );

    expect(container.querySelector("[data-status='clean']")).not.toBeNull();
  });

  it("renders a neutral StatusDot when the track is inactive", () => {
    const { container } = render(<TrackRow track={track()} depth={0} />);

    expect(container.querySelector("[data-status='neutral']")).not.toBeNull();
  });

  it("renders the instrument first, then MIDI FX, then audio FX (Logic signal flow)", () => {
    const t = track({
      kind: "instrument",
      instrument: inst("EZk2"),
      midi_fx: [aumf("FXR ")],
      audio_fx: [aufx("Comp"), aufx("Verb")],
    });
    render(<TrackRow track={t} depth={0} />);

    const rendered = screen
      .getAllByText(/aumu|aumf|aufx/)
      .map((el) => el.textContent ?? "");
    expect(rendered).toEqual([
      "aumu/EZk2/Toon",
      "aumf/FXR /SToy",
      "aufx/Comp/Yamh",
      "aufx/Verb/Yamh",
    ]);
  });

  it("renders no insert list when track has no inserts", () => {
    const { container } = render(<TrackRow track={track()} depth={0} />);

    // No <ul> for inserts when nothing to render.
    expect(container.querySelector("ul")).toBeNull();
  });
});
