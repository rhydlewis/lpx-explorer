import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import type { ProjectSummary } from "../../lib/types";
import { useAuRegistryStore } from "../../store/au-registry-store";
import { makeAuRegistry, makeSummary } from "../../test/fixtures";

import { PluginList } from "./PluginList";

vi.mock("../../lib/au-registry", () => ({
  loadAuRegistry: vi.fn(),
  runAuScan: vi.fn(),
}));

function summaryWith(...fingerprints: ProjectSummary["fingerprints"]): ProjectSummary {
  return makeSummary({ fingerprints });
}

describe("<PluginList />", () => {
  beforeEach(() => {
    useAuRegistryStore.getState().reset();
  });
  afterEach(() => {
    useAuRegistryStore.getState().reset();
  });

  it("exposes the section under aria-label='plug-ins'", () => {
    render(<PluginList summary={summaryWith()} />);

    expect(screen.getByRole("region", { name: "plug-ins" })).toBeInTheDocument();
  });

  it("renders the empty-state copy when no plug-ins are detected", () => {
    render(<PluginList summary={summaryWith()} />);

    expect(screen.getByText(/no plug-ins detected/i)).toBeInTheDocument();
  });

  it("renders the small-caps section heading", () => {
    render(<PluginList summary={summaryWith()} />);

    expect(screen.getByRole("heading", { name: /plug-ins/i })).toBeInTheDocument();
  });

  it("renders the count with Logic-terminology wording", () => {
    const summary = summaryWith(
      { type_code: "aumu", subtype: "EZk2", manufacturer: "Toon", offset: 12 },
      { type_code: "aufx", subtype: "Comp", manufacturer: "Yamh", offset: 248 },
    );

    render(<PluginList summary={summary} />);

    expect(screen.getByText(/2 plug-ins/i)).toBeInTheDocument();
  });

  it("uses singular wording for one plug-in", () => {
    render(
      <PluginList
        summary={summaryWith({
          type_code: "aumu",
          subtype: "EZk2",
          manufacturer: "Toon",
          offset: 12,
        })}
      />,
    );

    expect(screen.getByText(/^1 plug-in$/i)).toBeInTheDocument();
  });

  it("collapses identical fingerprints with a ×N badge (phantom plug-ins)", () => {
    const summary = summaryWith(
      { type_code: "aumf", subtype: "FXR ", manufacturer: "SToy", offset: 100 },
      { type_code: "aumf", subtype: "FXR ", manufacturer: "SToy", offset: 200 },
      { type_code: "aumf", subtype: "FXR ", manufacturer: "SToy", offset: 300 },
    );

    render(<PluginList summary={summary} />);

    expect(screen.getAllByText(/aumf\/FXR \/SToy/)).toHaveLength(1);
    expect(screen.getByText("×3")).toBeInTheDocument();
  });

  it("renders the resolved name when the registry has a match", () => {
    useAuRegistryStore.setState({
      status: {
        kind: "loaded",
        registry: {
          entries: [
            {
              fingerprint: "aumu/EZk2/Toon",
              type_4cc: "aumu",
              subtype_4cc: "EZk2",
              manufacturer_4cc: "Toon",
              name: "EZdrummer 2",
            },
          ],
          scanned_at_unix: 0,
        },
      },
    });

    render(
      <PluginList
        summary={summaryWith({
          type_code: "aumu",
          subtype: "EZk2",
          manufacturer: "Toon",
          offset: 12,
        })}
      />,
    );

    expect(screen.getByText("EZdrummer 2")).toBeInTheDocument();
  });

  it("falls back to the raw fingerprint when registry has no match", () => {
    useAuRegistryStore.setState({
      status: { kind: "loaded", registry: makeAuRegistry([]) },
    });

    render(
      <PluginList
        summary={summaryWith({
          type_code: "aumu",
          subtype: "EZk2",
          manufacturer: "Toon",
          offset: 12,
        })}
      />,
    );

    expect(screen.getByText("aumu/EZk2/Toon")).toBeInTheDocument();
  });

  it("shows 'Installed' badge when registry says installed", () => {
    useAuRegistryStore.setState({
      status: {
        kind: "loaded",
        registry: makeAuRegistry(["aumu/EZk2/Toon"]),
      },
    });

    render(
      <PluginList
        summary={summaryWith({
          type_code: "aumu",
          subtype: "EZk2",
          manufacturer: "Toon",
          offset: 12,
        })}
      />,
    );

    expect(screen.getByText(/^installed$/i)).toBeInTheDocument();
  });

  it("shows 'Missing on this Mac' badge when registry has no match", () => {
    useAuRegistryStore.setState({
      status: { kind: "loaded", registry: makeAuRegistry([]) },
    });

    render(
      <PluginList
        summary={summaryWith({
          type_code: "aumu",
          subtype: "EZk2",
          manufacturer: "Toon",
          offset: 12,
        })}
      />,
    );

    expect(screen.getByText(/missing on this mac/i)).toBeInTheDocument();
  });

  it("shows no install-status badge when the registry isn't loaded", () => {
    // status defaults to idle from beforeEach reset()
    render(
      <PluginList
        summary={summaryWith({
          type_code: "aumu",
          subtype: "EZk2",
          manufacturer: "Toon",
          offset: 12,
        })}
      />,
    );

    expect(screen.queryByText(/^installed$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/missing on this mac/i)).not.toBeInTheDocument();
  });
});
