import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import type { AURef } from "../../lib/types";
import { useAuRegistryStore } from "../../store/au-registry-store";
import { useUIStore } from "../../store/ui-store";
import { makeAuRegistry, makeSummary } from "../../test/fixtures";

vi.mock("../../lib/plugin-actions", () => ({
  copyFingerprint: vi.fn().mockResolvedValue(undefined),
  searchPluginOnWeb: vi.fn().mockResolvedValue(undefined),
}));

import { copyFingerprint, searchPluginOnWeb } from "../../lib/plugin-actions";

import { PluginRail } from "./PluginRail";

const mockedCopy = vi.mocked(copyFingerprint);
const mockedSearch = vi.mocked(searchPluginOnWeb);

function ref(
  type: string,
  subtype: string,
  manufacturer: string,
  offset = 0,
): AURef {
  return { type_code: type, subtype, manufacturer, offset };
}

describe("<PluginRail />", () => {
  beforeEach(() => {
    useUIStore.setState({ pluginRailFilter: "", pluginRailChip: "all" });
    useAuRegistryStore.setState({ status: { kind: "idle" } });
    mockedCopy.mockClear();
    mockedSearch.mockClear();
  });
  afterEach(() => {
    useUIStore.setState({ pluginRailFilter: "", pluginRailChip: "all" });
    useAuRegistryStore.setState({ status: { kind: "idle" } });
  });

  it("renders the section under aria-label='plug-ins'", () => {
    render(<PluginRail summary={makeSummary()} />);

    expect(
      screen.getByRole("region", { name: "plug-ins" }),
    ).toBeInTheDocument();
  });

  it("shows the empty state when no fingerprints are present", () => {
    render(<PluginRail summary={makeSummary()} />);

    expect(screen.getByText(/no plug-ins detected/i)).toBeInTheDocument();
  });

  it("renders one row per unique fingerprint", () => {
    render(
      <PluginRail
        summary={makeSummary({
          fingerprints: [
            ref("aufx", "Comp", "Yamh", 1),
            ref("aufx", "Comp", "Yamh", 2), // duplicate -> ×2 badge
            ref("aumu", "EZk2", "Toon", 3),
          ],
        })}
      />,
    );

    expect(screen.getByText("aufx/Comp/Yamh")).toBeInTheDocument();
    expect(screen.getByText("aumu/EZk2/Toon")).toBeInTheDocument();
    expect(screen.getByText("×2")).toBeInTheDocument();
  });

  it("filter input narrows the visible list", () => {
    render(
      <PluginRail
        summary={makeSummary({
          fingerprints: [
            ref("aufx", "Comp", "Yamh", 1),
            ref("aumu", "EZk2", "Toon", 2),
          ],
        })}
      />,
    );

    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "Comp" },
    });

    expect(screen.getByText("aufx/Comp/Yamh")).toBeInTheDocument();
    expect(screen.queryByText("aumu/EZk2/Toon")).not.toBeInTheDocument();
  });

  it("filter is case-insensitive", () => {
    render(
      <PluginRail
        summary={makeSummary({
          fingerprints: [ref("aufx", "Comp", "Yamh", 1)],
        })}
      />,
    );

    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "yamh" },
    });

    expect(screen.getByText("aufx/Comp/Yamh")).toBeInTheDocument();
  });

  it("Escape clears the filter input", () => {
    render(<PluginRail summary={makeSummary()} />);

    const search = screen.getByRole("searchbox");
    fireEvent.change(search, { target: { value: "anything" } });
    fireEvent.keyDown(search, { key: "Escape" });

    expect(useUIStore.getState().pluginRailFilter).toBe("");
  });

  it("'No matches' placeholder shows when filter empties the list", () => {
    render(
      <PluginRail
        summary={makeSummary({
          fingerprints: [ref("aufx", "Comp", "Yamh", 1)],
        })}
      />,
    );

    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "qzqz" },
    });

    expect(screen.getByText(/no matches/i)).toBeInTheDocument();
  });

  it("renders fingerprinted plug-ins as a 2-line row (name + status / fingerprint + count)", () => {
    // Layout contract: line 1 carries the user-visible name and the
    // install-status badge (right-aligned). Line 2 carries the
    // fingerprint and — when count > 1 — the duplicate badge. This
    // pairing keeps the status badge column-aligned across rows.
    useAuRegistryStore.setState({
      status: { kind: "loaded", registry: makeAuRegistry(["aufx/Comp/Yamh"]) },
    });
    const { container } = render(
      <PluginRail
        summary={makeSummary({
          fingerprints: [
            ref("aufx", "Comp", "Yamh", 1),
            ref("aufx", "Comp", "Yamh", 2), // duplicate -> ×2
          ],
        })}
      />,
    );

    const row = container.querySelector("li");
    expect(row).not.toBeNull();
    const lines = row?.querySelectorAll(":scope > div") ?? [];
    expect(lines.length).toBe(2);
    // Line 1: name + status badge.
    expect(lines[0].textContent).toContain("aufx/Comp/Yamh");
    expect(lines[0].textContent).toContain("Installed");
    // Line 2: fingerprint + count.
    expect(lines[1].textContent).toContain("aufx/Comp/Yamh");
    expect(lines[1].textContent).toContain("×2");
  });

  it("renders Apple stock plug-ins as a 1-line row (no second line, no synthesised fingerprint)", () => {
    // No fingerprint to show on line 2 → the row collapses to one line.
    useAuRegistryStore.setState({
      status: { kind: "loaded", registry: makeAuRegistry([]) },
    });
    const stockBassAmp: AURef = {
      type_code: "aufx",
      subtype: "bass",
      manufacturer: "appl",
      offset: 1,
      display_name: "Bass Amp",
    };
    const { container } = render(
      <PluginRail summary={makeSummary({ fingerprints: [stockBassAmp] })} />,
    );

    const row = container.querySelector("li");
    expect(row).not.toBeNull();
    const lines = row?.querySelectorAll(":scope > div") ?? [];
    expect(lines.length).toBe(1);
    expect(lines[0].textContent).toContain("Bass Amp");
    expect(lines[0].textContent).toContain("Installed");
  });

  it("renders Apple stock plug-ins by display_name (not synthesised fingerprint) and treats them as installed", () => {
    // The parser surfaces Apple stock plug-ins (Compressor, Bass Amp,
    // Alchemy, ...) with a synthesised fingerprint and the real name in
    // `display_name`. The synthesised fingerprint won't match auval.
    // Render the human name and skip the missing-from-registry verdict.
    useAuRegistryStore.setState({
      status: { kind: "loaded", registry: makeAuRegistry(["aumu/EZk2/Toon"]) },
    });
    const stockBassAmp: AURef = {
      type_code: "aufx",
      subtype: "bass",
      manufacturer: "appl",
      offset: 1,
      display_name: "Bass Amp",
    };
    render(
      <PluginRail
        summary={makeSummary({
          fingerprints: [stockBassAmp, ref("aumu", "EZk2", "Toon", 2)],
        })}
      />,
    );

    expect(screen.getByText("Bass Amp")).toBeInTheDocument();
    // Synthesised fingerprint should NOT be rendered for stock plug-ins.
    expect(screen.queryByText("aufx/bass/appl")).not.toBeInTheDocument();
    // The Bass Amp row should be marked installed, not missing.
    const bassAmpRow = screen
      .getByText("Bass Amp")
      .closest("li") as HTMLElement | null;
    expect(bassAmpRow?.getAttribute("data-status")).toBe("installed");
  });

  it("'Missing' chip narrows to plug-ins not in the AU registry", () => {
    useAuRegistryStore.setState({
      status: { kind: "loaded", registry: makeAuRegistry(["aufx/Comp/Yamh"]) },
    });
    render(
      <PluginRail
        summary={makeSummary({
          fingerprints: [
            ref("aufx", "Comp", "Yamh", 1), // installed
            ref("aumu", "EZk2", "Toon", 2), // missing
          ],
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Missing" }));

    expect(screen.getByText("aumu/EZk2/Toon")).toBeInTheDocument();
    expect(screen.queryByText("aufx/Comp/Yamh")).not.toBeInTheDocument();
  });

  it("'Duplicated' chip narrows to fingerprints with count >= 2", () => {
    render(
      <PluginRail
        summary={makeSummary({
          fingerprints: [
            ref("aufx", "Comp", "Yamh", 1),
            ref("aufx", "Comp", "Yamh", 2), // dup
            ref("aumu", "EZk2", "Toon", 3), // unique
          ],
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Duplicated" }));

    expect(screen.getByText("aufx/Comp/Yamh")).toBeInTheDocument();
    expect(screen.queryByText("aumu/EZk2/Toon")).not.toBeInTheDocument();
  });

  it("header count shows 'visible / total' when filtered", () => {
    render(
      <PluginRail
        summary={makeSummary({
          fingerprints: [
            ref("aufx", "Comp", "Yamh", 1),
            ref("aumu", "EZk2", "Toon", 2),
            ref("aumf", "FXR ", "SToy", 3),
          ],
        })}
      />,
    );

    // Unfiltered: just the total
    expect(screen.getByText("3")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "Comp" },
    });

    // Filtered: shows visible / total
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
  });

  it("missing rows expose 'Copy fingerprint' and 'Search the web' action buttons", () => {
    // Per the 2026-05-06 PM/Whimsy review: the JTBD hole is 'what do I do
    // about a missing plug-in'. Each missing row carries phase-1 actions —
    // copy the fingerprint, search the web for the plug-in name.
    useAuRegistryStore.setState({
      status: { kind: "loaded", registry: makeAuRegistry([]) },
    });
    render(
      <PluginRail
        summary={makeSummary({
          fingerprints: [ref("aufx", "Miss", "Mfgr", 1)],
        })}
      />,
    );

    expect(
      screen.getByRole("button", { name: /copy fingerprint/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /search the web/i }),
    ).toBeInTheDocument();
  });

  it("installed rows do NOT expose the missing-plug-in action buttons", () => {
    useAuRegistryStore.setState({
      status: {
        kind: "loaded",
        registry: makeAuRegistry(["aufx/Comp/Yamh"]),
      },
    });
    render(
      <PluginRail
        summary={makeSummary({
          fingerprints: [ref("aufx", "Comp", "Yamh", 1)],
        })}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /copy fingerprint/i }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: /search the web/i })).toBeNull();
  });

  it("clicking 'Copy fingerprint' on a missing row copies the canonical fingerprint", () => {
    useAuRegistryStore.setState({
      status: { kind: "loaded", registry: makeAuRegistry([]) },
    });
    render(
      <PluginRail
        summary={makeSummary({
          // Soundtoys-style fingerprint to lock in trailing-space preservation.
          fingerprints: [ref("aufx", "EB  ", "SToy", 1)],
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /copy fingerprint/i }));

    expect(mockedCopy).toHaveBeenCalledTimes(1);
    expect(mockedCopy).toHaveBeenCalledWith("aufx/EB  /SToy");
  });

  it("clicking 'Search the web' on a missing row searches by the row's display name", () => {
    // When the fingerprint is in auval-registry-but-display-name-only world
    // (we don't have a registry hit because it's missing), the row's
    // displayName falls back to the fingerprint. Search runs on whatever
    // the user sees — so the displayed name is what we hand to the helper.
    useAuRegistryStore.setState({
      status: { kind: "loaded", registry: makeAuRegistry([]) },
    });
    render(
      <PluginRail
        summary={makeSummary({
          fingerprints: [ref("aumu", "EZk2", "Toon", 1)],
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /search the web/i }));

    expect(mockedSearch).toHaveBeenCalledTimes(1);
    expect(mockedSearch).toHaveBeenCalledWith("aumu/EZk2/Toon");
  });

  it("renders a quiet ghost mark next to a Klopfgeist row (Logic's stock metronome)", () => {
    // Easter egg per the 2026-05-06 Whimsy review — Klopfgeist is German
    // for poltergeist; Apple's silent in-joke as the metronome plug-in
    // name. Fires on the canonical fingerprint, never as decoration.
    useAuRegistryStore.setState({
      status: {
        kind: "loaded",
        registry: makeAuRegistry(["aumu/klop/appl"]),
      },
    });
    render(
      <PluginRail
        summary={makeSummary({
          fingerprints: [ref("aumu", "klop", "appl", 1)],
        })}
      />,
    );

    expect(screen.getByLabelText(/klopfgeist/i)).toBeInTheDocument();
  });

  it("does NOT render the ghost mark on rows that aren't Klopfgeist", () => {
    useAuRegistryStore.setState({
      status: {
        kind: "loaded",
        registry: makeAuRegistry(["aumu/EZk2/Toon"]),
      },
    });
    render(
      <PluginRail
        summary={makeSummary({
          fingerprints: [ref("aumu", "EZk2", "Toon", 1)],
        })}
      />,
    );

    expect(screen.queryByLabelText(/klopfgeist/i)).toBeNull();
  });
});
