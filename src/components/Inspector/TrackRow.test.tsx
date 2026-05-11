import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";

import type { AURef, Track } from "../../lib/types";
import { useAuRegistryStore } from "../../store/au-registry-store";
import { useUIStore } from "../../store/ui-store";
import { makeAuRegistry } from "../../test/fixtures";

import { TrackRow } from "./TrackRow";

function track(overrides: Partial<Track> = {}): Track {
  return {
    name: "Audio 1",
    user_name: null,
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
  beforeEach(() => {
    useAuRegistryStore.setState({ status: { kind: "idle" } });
    useUIStore.setState({ tracksAllExpanded: false, tracksExpansionNonce: 0 });
  });
  afterEach(() => {
    useAuRegistryStore.setState({ status: { kind: "idle" } });
    useUIStore.setState({ tracksAllExpanded: false, tracksExpansionNonce: 0 });
  });

  it("renders the track name", () => {
    render(<TrackRow track={track({ name: "Drums" })} depth={0} />);

    expect(screen.getByText("Drums")).toBeInTheDocument();
  });

  it("prefers user_name over name when present", () => {
    render(
      <TrackRow
        track={track({ name: "Inst 1", user_name: "Pocket Strings" })}
        depth={0}
      />,
    );

    expect(screen.getByText("Pocket Strings")).toBeInTheDocument();
  });

  it("appends the channel-strip label as a muted suffix when user_name differs", () => {
    // 'Piano (Inst 1)' — the strip-default name keeps users oriented
    // when the track was renamed away from Logic's default.
    render(
      <TrackRow
        track={track({ name: "Inst 1", user_name: "Piano" })}
        depth={0}
      />,
    );

    expect(screen.getByText("Piano")).toBeInTheDocument();
    expect(screen.getByText("(Inst 1)")).toBeInTheDocument();
  });

  it("omits the strip-label suffix when the displayed name equals the strip default", () => {
    // No rename, no instrument: displayNameOf returns 'Inst 1' so the
    // suffix would read '(Inst 1)' — redundant. Suppress it.
    render(<TrackRow track={track({ name: "Inst 1", user_name: null })} depth={0} />);

    expect(screen.getByText("Inst 1")).toBeInTheDocument();
    expect(screen.queryByText("(Inst 1)")).not.toBeInTheDocument();
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

  it("renders the auval registry name for 3rd-party inserts (not the raw fingerprint)", () => {
    // lpx-explorer-o5k: the previous labelOf() fell straight through to
    // the fingerprint string for any AURef without display_name,
    // ignoring the loaded registry. Verified end-to-end: Scaler 2's
    // ScalerControl 2 plug-in (aumi/S2lc/eMai) is in auval but used to
    // render as 'aumi/S2lc/eMai' inside the Track disclosure.
    useAuRegistryStore.setState({
      status: {
        kind: "loaded",
        registry: {
          scanned_at_unix: 0,
          entries: [
            {
              fingerprint: "aumi/S2lc/eMai",
              type_4cc: "aumi",
              subtype_4cc: "S2lc",
              manufacturer_4cc: "eMai",
              name: "Plugin Boutique: ScalerControl 2",
            },
          ],
        },
      },
    });
    const scalerControl: AURef = {
      type_code: "aumi",
      subtype: "S2lc",
      manufacturer: "eMai",
      offset: 600,
    };
    const t = track({ kind: "instrument", midi_fx: [scalerControl] });

    render(<TrackRow track={t} depth={0} />);

    expect(
      screen.getByText("Plugin Boutique: ScalerControl 2"),
    ).toBeInTheDocument();
    expect(screen.queryByText("aumi/S2lc/eMai")).not.toBeInTheDocument();
  });

  it("falls back to the raw fingerprint when the registry has no entry", () => {
    // No registry hit — render the fingerprint string verbatim. This
    // path was correct before lpx-explorer-o5k; locking it in.
    useAuRegistryStore.setState({
      status: { kind: "loaded", registry: makeAuRegistry([]) },
    });
    const unknown: AURef = {
      type_code: "aufx",
      subtype: "Vrb2",
      manufacturer: "Mfgr",
      offset: 700,
    };
    const t = track({ kind: "audio", audio_fx: [unknown] });

    render(<TrackRow track={t} depth={0} />);

    expect(screen.getByText("aufx/Vrb2/Mfgr")).toBeInTheDocument();
  });

  it("renders display_name instead of fingerprint for stock plug-ins", () => {
    // Apple stock plug-ins arrive with synthesised 4CCs and a real
    // human name in display_name. The synthesised fingerprint is
    // intentionally unhelpful — render the human name instead.
    const stockBassAmp: AURef = {
      type_code: "aufx",
      subtype: "bass",
      manufacturer: "appl",
      offset: 500,
      display_name: "Bass Amp",
    };
    const t = track({ kind: "instrument", audio_fx: [stockBassAmp] });
    render(<TrackRow track={t} depth={0} />);

    expect(screen.getByText("Bass Amp")).toBeInTheDocument();
    expect(screen.queryByText("aufx/bass/appl")).not.toBeInTheDocument();
  });

  it("renders no insert list when track has no inserts", () => {
    const { container } = render(<TrackRow track={track()} depth={0} />);

    // No <ul> for inserts when nothing to render.
    expect(container.querySelector("ul")).toBeNull();
  });

  it("renders no <details> widget when track has no inserts", () => {
    const { container } = render(<TrackRow track={track()} depth={0} />);

    expect(container.querySelector("details")).toBeNull();
  });

  it("collapses inserts inside a <details> closed by default", () => {
    const t = track({ kind: "audio", audio_fx: [aufx("Comp"), aufx("Verb")] });
    const { container } = render(<TrackRow track={t} depth={0} />);

    const details = container.querySelector("details");
    expect(details).not.toBeNull();
    expect(details?.hasAttribute("open")).toBe(false);
  });

  it("renders inserts as a 2-column table (Insert | Type)", () => {
    const t = track({
      kind: "instrument",
      instrument: inst("EZk2"),
      midi_fx: [aumf("FXR ")],
      audio_fx: [aufx("Comp")],
    });
    render(<TrackRow track={t} depth={0} />);

    const table = screen.getByRole("table");
    expect(table).toBeInTheDocument();
    // Column headers are read by SR but visually hidden — assert they
    // exist for accessibility.
    expect(screen.getByRole("columnheader", { name: /insert/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /type/i })).toBeInTheDocument();
  });

  it("renders each insert with a kind-coloured pill (data-kind attribute)", () => {
    const t = track({
      kind: "instrument",
      instrument: inst("EZk2"),
      midi_fx: [aumf("FXR ")],
      audio_fx: [aufx("Comp")],
    });
    const { container } = render(<TrackRow track={t} depth={0} />);

    expect(container.querySelector('[data-kind="instrument"]')).not.toBeNull();
    expect(container.querySelector('[data-kind="midi"]')).not.toBeNull();
    expect(container.querySelector('[data-kind="fx"]')).not.toBeNull();
  });

  it("renders the type label next to each pill ('Instrument' / 'MIDI' / 'FX')", () => {
    const t = track({
      kind: "instrument",
      instrument: inst("EZk2"),
      midi_fx: [aumf("FXR ")],
      audio_fx: [aufx("Comp")],
    });
    render(<TrackRow track={t} depth={0} />);

    expect(screen.getByText("Instrument")).toBeInTheDocument();
    expect(screen.getByText("MIDI")).toBeInTheDocument();
    expect(screen.getByText("FX")).toBeInTheDocument();
  });

  it("opens its <details> when the project-level expand-all signal fires", () => {
    const t = track({ kind: "audio", audio_fx: [aufx("Comp")] });
    const { container } = render(<TrackRow track={t} depth={0} />);
    const details = container.querySelector("details");
    expect(details?.hasAttribute("open")).toBe(false);

    act(() => {
      useUIStore.getState().expandAllTracks();
    });

    expect(details?.hasAttribute("open")).toBe(true);
  });

  it("closes its <details> when the project-level collapse-all signal fires", () => {
    const t = track({ kind: "audio", audio_fx: [aufx("Comp")] });
    const { container } = render(<TrackRow track={t} depth={0} />);

    act(() => {
      useUIStore.getState().expandAllTracks();
    });
    const details = container.querySelector("details");
    expect(details?.hasAttribute("open")).toBe(true);

    act(() => {
      useUIStore.getState().collapseAllTracks();
    });

    expect(details?.hasAttribute("open")).toBe(false);
  });
});
