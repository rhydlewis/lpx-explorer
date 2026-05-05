import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { useAuRegistryStore } from "../../store/au-registry-store";
import { useProjectStore } from "../../store/project-store";
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
      },
    });

    const { container } = render(<CompatibilityVerdict />);

    expect(screen.getByText(/2 plug-ins missing/i)).toBeInTheDocument();
    expect(container.querySelector("[data-status='warnings']")).not.toBeNull();
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
      },
    });

    const { container } = render(<CompatibilityVerdict />);

    expect(screen.getByText(/opens cleanly/i)).toBeInTheDocument();
    expect(screen.getByText(/no plug-ins to check/i)).toBeInTheDocument();
    expect(container.querySelector("[data-status='clean']")).not.toBeNull();
  });

  it("renders 'AU registry not yet scanned' + Run AU scan button when status is 'absent'", () => {
    useAuRegistryStore.setState({ status: { kind: "absent" } });

    render(<CompatibilityVerdict />);

    expect(screen.getByText(/au registry not yet scanned/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /run au scan/i }),
    ).toBeInTheDocument();
  });

  it("renders the live count 'Scanning installed AUs… (47)' while scanning", () => {
    useAuRegistryStore.setState({ status: { kind: "scanning", found: 47 } });

    render(<CompatibilityVerdict />);

    expect(screen.getByText(/scanning installed aus/i)).toBeInTheDocument();
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
});
