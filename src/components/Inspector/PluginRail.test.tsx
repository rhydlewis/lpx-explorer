import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import type { AURef } from "../../lib/types";
import { useAuRegistryStore } from "../../store/au-registry-store";
import { useUIStore } from "../../store/ui-store";
import { makeAuRegistry, makeSummary } from "../../test/fixtures";

import { PluginRail } from "./PluginRail";

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
});
