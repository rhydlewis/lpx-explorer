import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import type { Track } from "../../lib/types";
import { useUIStore } from "../../store/ui-store";

import { TrackList } from "./TrackList";

function track(overrides: Partial<Track> = {}): Track {
  // Default to active because <TrackList /> hides inactive tracks (default
  // channel strips Logic creates but the user never used). Tests asserting
  // visibility need is_active: true; the filter test passes false explicitly.
  return {
    name: "Audio 1",
    user_name: null,
    kind: "audio",
    offset: 100,
    is_active: true,
    instrument: null,
    midi_fx: [],
    audio_fx: [],
    sub_number: null,
    parent_offset: null,
    ...overrides,
  };
}

describe("<TrackList />", () => {
  beforeEach(() => {
    useUIStore.setState({ pluginChainsShowAll: false });
  });
  afterEach(() => {
    useUIStore.setState({ pluginChainsShowAll: false });
  });

  it("exposes the section under aria-label='tracks'", () => {
    render(<TrackList tracks={[]} />);

    expect(
      screen.getByRole("region", { name: "tracks" }),
    ).toBeInTheDocument();
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

  it("hides inactive tracks (Logic's default-but-unused channel strips)", () => {
    render(
      <TrackList
        tracks={[
          track({ name: "Active 1", offset: 1, is_active: true }),
          track({ name: "Phantom Audio", offset: 2, is_active: false }),
          track({
            name: "Phantom Inst",
            kind: "instrument",
            offset: 3,
            is_active: false,
          }),
        ]}
      />,
    );

    expect(screen.getByText("Active 1")).toBeInTheDocument();
    expect(screen.queryByText("Phantom Audio")).not.toBeInTheDocument();
    expect(screen.queryByText("Phantom Inst")).not.toBeInTheDocument();
  });

  it("shows the empty state when only inactive tracks exist", () => {
    render(
      <TrackList
        tracks={[
          track({ name: "Audio 1", offset: 1, is_active: false }),
          track({ name: "Audio 2", offset: 2, is_active: false }),
        ]}
      />,
    );

    expect(screen.getByText(/no tracks detected/i)).toBeInTheDocument();
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

  it("hides routing kinds by default (toggle off)", () => {
    render(
      <TrackList
        tracks={[
          track({ name: "Audio 1", kind: "audio", offset: 1 }),
          track({ name: "Stereo Out", kind: "output", offset: 2 }),
          track({ name: "Bus 1", kind: "bus", offset: 3 }),
          track({ name: "Aux 1", kind: "aux", offset: 4 }),
        ]}
      />,
    );

    expect(screen.getByText("Audio 1")).toBeInTheDocument();
    expect(screen.queryByText("Stereo Out")).not.toBeInTheDocument();
    expect(screen.queryByText("Bus 1")).not.toBeInTheDocument();
    expect(screen.queryByText("Aux 1")).not.toBeInTheDocument();
  });

  it("reveals only routing kinds with at least one insert when 'Show all' is on", () => {
    // Logic emits ~256 default buses, all flagged as is_active because
    // descriptor[4] carries the bus number. Surfacing them all turns
    // 'Show all' into noise; users care about the ones with FX loaded.
    const auFx = {
      type_code: "aufx",
      subtype: "Comp",
      manufacturer: "Yamh",
      offset: 1000,
    };
    render(
      <TrackList
        tracks={[
          track({ name: "Audio 1", kind: "audio", offset: 1 }),
          track({ name: "Stereo Out", kind: "output", offset: 2 }),
          track({ name: "Empty Bus", kind: "bus", offset: 3 }),
          track({
            name: "Mix Bus",
            kind: "bus",
            offset: 4,
            audio_fx: [auFx],
          }),
        ]}
      />,
    );

    fireEvent.click(
      screen.getByRole("checkbox", { name: /show routing kinds/i }),
    );

    expect(screen.getByText("Mix Bus")).toBeInTheDocument();
    expect(screen.queryByText("Empty Bus")).not.toBeInTheDocument();
    expect(screen.queryByText("Stereo Out")).not.toBeInTheDocument();
  });

  it("still hides inactive tracks even when 'Show all' is on", () => {
    render(
      <TrackList
        tracks={[
          track({ name: "Audio 1", offset: 1, is_active: true }),
          track({
            name: "Phantom Bus",
            kind: "bus",
            offset: 2,
            is_active: false,
          }),
        ]}
      />,
    );

    fireEvent.click(
      screen.getByRole("checkbox", { name: /show routing kinds/i }),
    );

    // Show-all surfaces routing kinds but does not unhide inactive tracks
    // (different concern; would still be Logic's "default but unused"
    // channel strips the user has never touched).
    expect(screen.queryByText("Phantom Bus")).not.toBeInTheDocument();
  });

  it("exposes an 'Expand all' button when no tracks are expanded", () => {
    useUIStore.setState({ tracksAllExpanded: false, tracksExpansionNonce: 0 });
    render(<TrackList tracks={[track({ name: "Audio 1", offset: 1 })]} />);

    expect(
      screen.getByRole("button", { name: /expand all/i }),
    ).toBeInTheDocument();
  });

  it("the button label flips to 'Collapse all' once tracks are expanded", () => {
    useUIStore.setState({ tracksAllExpanded: true, tracksExpansionNonce: 1 });
    render(<TrackList tracks={[track({ name: "Audio 1", offset: 1 })]} />);

    expect(
      screen.getByRole("button", { name: /collapse all/i }),
    ).toBeInTheDocument();
  });

  it("clicking the expand/collapse button toggles the store + bumps the nonce", () => {
    useUIStore.setState({ tracksAllExpanded: false, tracksExpansionNonce: 0 });
    render(<TrackList tracks={[track({ name: "Audio 1", offset: 1 })]} />);

    fireEvent.click(screen.getByRole("button", { name: /expand all/i }));

    expect(useUIStore.getState().tracksAllExpanded).toBe(true);
    expect(useUIStore.getState().tracksExpansionNonce).toBe(1);
  });

  // lpx-explorer-1ki — inline name filter

  it("renders a search input for narrowing tracks by name", () => {
    render(<TrackList tracks={[track({ name: "Audio 1", offset: 1 })]} />);

    expect(
      screen.getByRole("searchbox", { name: /search tracks/i }),
    ).toBeInTheDocument();
  });

  it("typing in the search input narrows visible tracks (case-insensitive substring)", () => {
    render(
      <TrackList
        tracks={[
          track({ name: "Audio 1", user_name: "Bass", offset: 1 }),
          track({ name: "Audio 2", user_name: "Drums", offset: 2 }),
          track({ name: "Audio 3", user_name: "Bass DI", offset: 3 }),
        ]}
      />,
    );

    fireEvent.change(
      screen.getByRole("searchbox", { name: /search tracks/i }),
      { target: { value: "bass" } },
    );

    expect(screen.getByText("Bass")).toBeInTheDocument();
    expect(screen.getByText("Bass DI")).toBeInTheDocument();
    expect(screen.queryByText("Drums")).not.toBeInTheDocument();
  });

  it("falls back to track.name when user_name is null", () => {
    render(
      <TrackList
        tracks={[
          track({ name: "Audio 1", user_name: null, offset: 1 }),
          track({ name: "Inst 4", user_name: null, kind: "instrument", offset: 2 }),
        ]}
      />,
    );

    fireEvent.change(
      screen.getByRole("searchbox", { name: /search tracks/i }),
      { target: { value: "inst" } },
    );

    expect(screen.getByText("Inst 4")).toBeInTheDocument();
    expect(screen.queryByText("Audio 1")).not.toBeInTheDocument();
  });

  it("shows an empty-state placeholder when the query has no matches", () => {
    render(
      <TrackList
        tracks={[track({ name: "Audio 1", user_name: "Bass", offset: 1 })]}
      />,
    );

    fireEvent.change(
      screen.getByRole("searchbox", { name: /search tracks/i }),
      { target: { value: "synth" } },
    );

    expect(screen.getByText(/no tracks match\s+["“]synth["”]/i)).toBeInTheDocument();
  });

  it("clearing the query restores the full list", () => {
    render(
      <TrackList
        tracks={[
          track({ name: "Audio 1", user_name: "Bass", offset: 1 }),
          track({ name: "Audio 2", user_name: "Drums", offset: 2 }),
        ]}
      />,
    );

    const search = screen.getByRole("searchbox", { name: /search tracks/i });
    fireEvent.change(search, { target: { value: "bass" } });
    expect(screen.queryByText("Drums")).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: "" } });
    expect(screen.getByText("Bass")).toBeInTheDocument();
    expect(screen.getByText("Drums")).toBeInTheDocument();
  });

  it("ESC clears the active query", () => {
    render(
      <TrackList
        tracks={[
          track({ name: "Audio 1", user_name: "Bass", offset: 1 }),
          track({ name: "Audio 2", user_name: "Drums", offset: 2 }),
        ]}
      />,
    );

    const search = screen.getByRole("searchbox", { name: /search tracks/i });
    fireEvent.change(search, { target: { value: "bass" } });
    fireEvent.keyDown(search, { key: "Escape" });

    expect((search as HTMLInputElement).value).toBe("");
    expect(screen.getByText("Drums")).toBeInTheDocument();
  });

  it("'No tracks detected.' (not the filter empty-state) shows when the project has zero tracks", () => {
    render(<TrackList tracks={[]} />);

    fireEvent.change(
      screen.getByRole("searchbox", { name: /search tracks/i }),
      { target: { value: "anything" } },
    );

    expect(screen.getByText(/no tracks detected/i)).toBeInTheDocument();
    expect(screen.queryByText(/no tracks match/i)).not.toBeInTheDocument();
  });
});
