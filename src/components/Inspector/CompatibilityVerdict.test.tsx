import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { useAuRegistryStore } from "../../store/au-registry-store";
import { useProjectStore } from "../../store/project-store";
import { useUIStore } from "../../store/ui-store";
import { makeAuRegistry, makeSummary } from "../../test/fixtures";

import { CompatibilityVerdict } from "./CompatibilityVerdict";

vi.mock("../../lib/parse", () => ({
  parseProject: vi.fn(),
}));
vi.mock("../../lib/au-registry", () => ({
  loadAuRegistry: vi.fn(),
  runAuScan: vi.fn(),
}));

describe("<CompatibilityVerdict />", () => {
  beforeEach(() => {
    useProjectStore.getState().clear();
    useAuRegistryStore.getState().reset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    useProjectStore.getState().clear();
    useAuRegistryStore.getState().reset();
    vi.restoreAllMocks();
  });

  it("exposes the section under aria-label='compatibility'", () => {
    render(<CompatibilityVerdict />);

    expect(
      screen.getByRole("region", { name: "compatibility" }),
    ).toBeInTheDocument();
  });

  it("renders 'Opens cleanly' (green) when every fingerprint is installed, plus a summary line", () => {
    useAuRegistryStore.setState({
      status: {
        kind: "loaded",
        registry: makeAuRegistry(["aumu/EZk2/Toon", "aufx/Cmpr/appl"]),
      },
    });
    useProjectStore.setState({
      current: {
        kind: "loaded",
        path: "/x.logicx",
        summary: makeSummary({
          fingerprints: [
            { type_code: "aumu", subtype: "EZk2", manufacturer: "Toon", offset: 1 },
            { type_code: "aufx", subtype: "Cmpr", manufacturer: "appl", offset: 2 },
          ],
        }),
      alternatives: [{ index: 0, display_name: "x", is_active: true, window_image_path: null, last_saved_unix: 0 }],
      activeVariantIndex: 0,
      },
    });

    const { container } = render(<CompatibilityVerdict />);

    expect(screen.getByText(/opens cleanly/i)).toBeInTheDocument();
    expect(
      screen.getByText(/all 2 plug-ins installed on this mac/i),
    ).toBeInTheDocument();
    expect(container.querySelector("[data-status='clean']")).not.toBeNull();
  });

  it("renders 'N plug-ins missing' (amber) when some fingerprints are missing", () => {
    useAuRegistryStore.setState({
      status: {
        kind: "loaded",
        registry: makeAuRegistry(["aumu/EZk2/Toon"]),
      },
    });
    useProjectStore.setState({
      current: {
        kind: "loaded",
        path: "/x.logicx",
        summary: makeSummary({
          fingerprints: [
            { type_code: "aumu", subtype: "EZk2", manufacturer: "Toon", offset: 1 },
            { type_code: "aufx", subtype: "Miss", manufacturer: "Mfgr", offset: 2 },
            { type_code: "aufx", subtype: "Also", manufacturer: "Gone", offset: 3 },
          ],
        }),
      alternatives: [{ index: 0, display_name: "x", is_active: true, window_image_path: null, last_saved_unix: 0 }],
      activeVariantIndex: 0,
      },
    });

    const { container } = render(<CompatibilityVerdict />);

    expect(screen.getByText(/2 plug-ins missing/i)).toBeInTheDocument();
    expect(container.querySelector("[data-status='warnings']")).not.toBeNull();
  });

  it("treats Apple stock plug-ins (display_name set) as installed even when not in auval", () => {
    // Apple stock plug-ins ship with Logic — guaranteed installed on
    // any Mac that has Logic. Their parser-synthesised fingerprint
    // (e.g. `aufx/comp/appl` for Compressor) won't match auval's real
    // fingerprint (`aufx/cmpr/appl`), but `display_name` flags them so
    // we skip the registry lookup entirely.
    useAuRegistryStore.setState({
      status: {
        kind: "loaded",
        registry: makeAuRegistry(["aumu/EZk2/Toon"]),
      },
    });
    useProjectStore.setState({
      current: {
        kind: "loaded",
        path: "/x.logicx",
        summary: makeSummary({
          fingerprints: [
            { type_code: "aumu", subtype: "EZk2", manufacturer: "Toon", offset: 1 },
            {
              type_code: "aufx",
              subtype: "comp",
              manufacturer: "appl",
              offset: 2,
              display_name: "Compressor",
            },
          ],
        }),
      alternatives: [{ index: 0, display_name: "x", is_active: true, window_image_path: null, last_saved_unix: 0 }],
      activeVariantIndex: 0,
      },
    });

    const { container } = render(<CompatibilityVerdict />);

    expect(screen.getByText(/opens cleanly/i)).toBeInTheDocument();
    expect(container.querySelector("[data-status='clean']")).not.toBeNull();
  });

  it("renders 'Will not open' (red) when ALL fingerprints are missing", () => {
    useAuRegistryStore.setState({
      status: { kind: "loaded", registry: makeAuRegistry([]) },
    });
    useProjectStore.setState({
      current: {
        kind: "loaded",
        path: "/x.logicx",
        summary: makeSummary({
          fingerprints: [
            { type_code: "aumu", subtype: "EZk2", manufacturer: "Toon", offset: 1 },
          ],
        }),
      alternatives: [{ index: 0, display_name: "x", is_active: true, window_image_path: null, last_saved_unix: 0 }],
      activeVariantIndex: 0,
      },
    });

    const { container } = render(<CompatibilityVerdict />);

    expect(screen.getByText(/will not open/i)).toBeInTheDocument();
    expect(container.querySelector("[data-status='will-not-open']")).not.toBeNull();
  });

  it("renders 'Opens cleanly — no plug-ins to check' when project has zero fingerprints", () => {
    useAuRegistryStore.setState({
      status: { kind: "loaded", registry: makeAuRegistry([]) },
    });
    useProjectStore.setState({
      current: {
        kind: "loaded",
        path: "/x.logicx",
        summary: makeSummary({ fingerprints: [] }),
      alternatives: [{ index: 0, display_name: "x", is_active: true, window_image_path: null, last_saved_unix: 0 }],
      activeVariantIndex: 0,
      },
    });

    const { container } = render(<CompatibilityVerdict />);

    expect(screen.getByText(/opens cleanly/i)).toBeInTheDocument();
    expect(screen.getByText(/no plug-ins to check/i)).toBeInTheDocument();
    expect(container.querySelector("[data-status='clean']")).not.toBeNull();
  });

  it("renders 'Haven't checked your AUs yet' + Run AU scan button when status is 'absent'", () => {
    useAuRegistryStore.setState({ status: { kind: "absent" } });

    render(<CompatibilityVerdict />);

    expect(
      screen.getByText(/haven'?t checked your AUs yet/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /run au scan/i }),
    ).toBeInTheDocument();
  });

  it("renders the live count 'Reading your AU library… (47)' while scanning", () => {
    useAuRegistryStore.setState({ status: { kind: "scanning", found: 47 } });

    render(<CompatibilityVerdict />);

    expect(screen.getByText(/reading your au library/i)).toBeInTheDocument();
    expect(screen.getByText(/47/)).toBeInTheDocument();
  });

  it("disables the Run AU scan button while scanning", () => {
    useAuRegistryStore.setState({ status: { kind: "scanning", found: 0 } });

    render(<CompatibilityVerdict />);

    // No CTA shown during scanning — the live count replaces it.
    expect(
      screen.queryByRole("button", { name: /run au scan/i }),
    ).not.toBeInTheDocument();
  });

  it("renders error + Try again when the scan fails", () => {
    useAuRegistryStore.setState({
      status: { kind: "error", message: "auval exited with signal: 11" },
    });

    render(<CompatibilityVerdict />);

    expect(screen.getByText(/au scan failed/i)).toBeInTheDocument();
    expect(screen.getByText(/signal: 11/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /try again/i }),
    ).toBeInTheDocument();
  });

  it("Run AU scan button calls useAuRegistryStore.runScan", () => {
    useAuRegistryStore.setState({ status: { kind: "absent" } });
    const runScan = vi.spyOn(useAuRegistryStore.getState(), "runScan");

    render(<CompatibilityVerdict />);
    fireEvent.click(screen.getByRole("button", { name: /run au scan/i }));

    expect(runScan).toHaveBeenCalled();
  });

  it("exposes a primary 'Show what's missing' CTA when missing plug-ins exist", () => {
    // Per the 2026-05-06 PM/Whimsy review: the action must be the loudest
    // element on the band, not the verdict word. The clickable affordance
    // is now an explicit CTA button — not the status badge itself.
    useAuRegistryStore.setState({
      status: { kind: "loaded", registry: makeAuRegistry([]) },
    });
    useProjectStore.setState({
      current: {
        kind: "loaded",
        path: "/x.logicx",
        summary: makeSummary({
          fingerprints: [
            { type_code: "aumu", subtype: "Miss", manufacturer: "Mfgr", offset: 1 },
          ],
        }),
      alternatives: [{ index: 0, display_name: "x", is_active: true, window_image_path: null, last_saved_unix: 0 }],
      activeVariantIndex: 0,
      },
    });

    render(<CompatibilityVerdict />);

    expect(
      screen.getByRole("button", { name: /show what'?s missing/i }),
    ).toBeInTheDocument();
  });

  it("clicking the missing-CTA bumps the rail's jump-to-missing nonce", () => {
    useAuRegistryStore.setState({
      status: {
        kind: "loaded",
        registry: makeAuRegistry(["aumu/EZk2/Toon"]),
      },
    });
    useProjectStore.setState({
      current: {
        kind: "loaded",
        path: "/x.logicx",
        summary: makeSummary({
          fingerprints: [
            { type_code: "aumu", subtype: "EZk2", manufacturer: "Toon", offset: 1 },
            { type_code: "aufx", subtype: "Miss", manufacturer: "Mfgr", offset: 2 },
          ],
        }),
      alternatives: [{ index: 0, display_name: "x", is_active: true, window_image_path: null, last_saved_unix: 0 }],
      activeVariantIndex: 0,
      },
    });
    const before = useUIStore.getState().pluginRailJumpToMissingNonce;

    render(<CompatibilityVerdict />);
    fireEvent.click(
      screen.getByRole("button", { name: /show what'?s missing/i }),
    );

    expect(useUIStore.getState().pluginRailJumpToMissingNonce).toBe(before + 1);
    expect(useUIStore.getState().pluginRailChip).toBe("missing");
    expect(useUIStore.getState().pluginRailFilter).toBe("");
  });

  it("renders as a band — no 'Compatibility' section heading", () => {
    // Per the 2026-05-06 review the verdict is promoted from a labelled
    // section to a hero band directly under the project header. The
    // 'Compatibility' h3 is gone; the section is still aria-labelled for
    // screen readers.
    useAuRegistryStore.setState({
      status: {
        kind: "loaded",
        registry: makeAuRegistry(["aumu/EZk2/Toon"]),
      },
    });
    useProjectStore.setState({
      current: {
        kind: "loaded",
        path: "/x.logicx",
        summary: makeSummary({
          fingerprints: [
            { type_code: "aumu", subtype: "EZk2", manufacturer: "Toon", offset: 1 },
          ],
        }),
      alternatives: [{ index: 0, display_name: "x", is_active: true, window_image_path: null, last_saved_unix: 0 }],
      activeVariantIndex: 0,
      },
    });

    render(<CompatibilityVerdict />);

    expect(
      screen.queryByRole("heading", { name: /^compatibility$/i }),
    ).toBeNull();
    expect(screen.getByRole("region", { name: "compatibility" })).toBeInTheDocument();
  });

  it("renders the clean status as a non-button span (no jump affordance needed)", () => {
    useAuRegistryStore.setState({
      status: {
        kind: "loaded",
        registry: makeAuRegistry(["aumu/EZk2/Toon"]),
      },
    });
    useProjectStore.setState({
      current: {
        kind: "loaded",
        path: "/x.logicx",
        summary: makeSummary({
          fingerprints: [
            { type_code: "aumu", subtype: "EZk2", manufacturer: "Toon", offset: 1 },
          ],
        }),
      alternatives: [{ index: 0, display_name: "x", is_active: true, window_image_path: null, last_saved_unix: 0 }],
      activeVariantIndex: 0,
      },
    });

    render(<CompatibilityVerdict />);

    expect(screen.queryByRole("button", { name: /opens cleanly/i })).not.toBeInTheDocument();
    expect(screen.getByText(/opens cleanly/i)).toBeInTheDocument();
  });
});
