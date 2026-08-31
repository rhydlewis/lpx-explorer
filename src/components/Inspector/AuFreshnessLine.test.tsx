import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { AuRegistry } from "../../lib/types";
import {
  useAuRegistryStore,
  type RegistryStatus,
} from "../../store/au-registry-store";

import { AuFreshness, AuFreshnessLine } from "./AuFreshnessLine";

const registry = (scannedAtUnix: number): AuRegistry => ({
  entries: [],
  scanned_at_unix: scannedAtUnix,
});

const loaded = (scannedAtUnix: number): RegistryStatus => ({
  kind: "loaded",
  registry: registry(scannedAtUnix),
});

const nowUnix = () => Math.floor(Date.now() / 1000);

function renderLine(overrides: {
  status?: RegistryStatus;
  rescanning?: boolean;
  rescanError?: string | null;
  onRescan?: () => void;
} = {}) {
  return render(
    <AuFreshnessLine
      status={overrides.status ?? loaded(nowUnix() - 3600)}
      rescanning={overrides.rescanning ?? false}
      rescanError={overrides.rescanError ?? null}
      onRescan={overrides.onRescan ?? (() => {})}
    />,
  );
}

describe("AuFreshnessLine", () => {
  it("shows when the AU registry was last checked", () => {
    renderLine({ status: loaded(nowUnix() - 3600) });

    expect(screen.getByText(/checked 1 hour ago/i)).toBeInTheDocument();
  });

  it("offers a rescan action while a registry is loaded", () => {
    // The lpx-explorer-kw0 dead end: with a cache on disk the only
    // escape from a wrong 'missing' verdict was deleting the file by
    // hand. There must always be a way out from the UI.
    const onRescan = vi.fn();
    renderLine({ onRescan });

    fireEvent.click(screen.getByRole("button", { name: /rescan/i }));

    expect(onRescan).toHaveBeenCalledTimes(1);
  });

  it("reports progress and disables the action while rescanning", () => {
    renderLine({ rescanning: true });

    expect(screen.getByText(/rechecking/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /rescan/i })).toBeDisabled();
  });

  it("surfaces a failed rescan without hiding the last-checked time", () => {
    // auval segfaults on broken installs. The user needs to know the
    // refresh failed AND that the verdict they're reading is the old one.
    renderLine({
      status: loaded(nowUnix() - 3600),
      rescanError: "auval exited with signal 11",
    });

    expect(screen.getByText(/couldn't recheck/i)).toBeInTheDocument();
    expect(screen.getByText(/checked 1 hour ago/i)).toBeInTheDocument();
  });

  it("renders nothing when no registry is loaded", () => {
    // 'absent' / 'scanning' / 'error' are the verdict band's job — two
    // components shouting the same thing is noise.
    const { container } = renderLine({ status: { kind: "absent" } });

    expect(container).toBeEmptyDOMElement();
  });
});

describe("AuFreshness (store-connected)", () => {
  it("hands the store's rescan action to the button", () => {
    useAuRegistryStore.setState({
      status: loaded(nowUnix() - 3600),
      rescanning: false,
      rescanError: null,
    });
    const rescan = vi.spyOn(useAuRegistryStore.getState(), "rescan");
    render(<AuFreshness />);

    fireEvent.click(screen.getByRole("button", { name: /rescan/i }));

    expect(rescan).toHaveBeenCalled();
  });
});
