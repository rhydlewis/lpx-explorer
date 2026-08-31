import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/plugin-actions", () => ({
  copyFingerprint: vi.fn().mockResolvedValue(undefined),
  copyText: vi.fn().mockResolvedValue(undefined),
  searchPluginOnWeb: vi.fn().mockResolvedValue(undefined),
}));

import {
  copyFingerprint,
  copyText,
  searchPluginOnWeb,
} from "../../lib/plugin-actions";
import { useUIStore } from "../../store/ui-store";

import { PluginRowActions } from "./PluginRowActions";

const mockedCopyFingerprint = vi.mocked(copyFingerprint);
const mockedCopyText = vi.mocked(copyText);
const mockedSearch = vi.mocked(searchPluginOnWeb);

const FINGERPRINT = "aufx/EB  /SToy";

describe("PluginRowActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUIStore.setState({ searchEngine: "google" });
  });

  it("copies the fingerprint verbatim, preserving significant spaces", () => {
    // 'EB  ' — a trim here silently breaks round-trip lookup in auval -l.
    render(
      <PluginRowActions fingerprint={FINGERPRINT} displayName="EchoBoy" />,
    );

    fireEvent.click(screen.getByRole("button", { name: /copy fingerprint/i }));

    expect(mockedCopyFingerprint).toHaveBeenCalledWith("aufx/EB  /SToy");
  });

  it("copies the display name", () => {
    // lpx-explorer-9ll: previously only the fingerprint was copyable.
    render(
      <PluginRowActions fingerprint={FINGERPRINT} displayName="EchoBoy" />,
    );

    fireEvent.click(screen.getByRole("button", { name: /copy name/i }));

    expect(mockedCopyText).toHaveBeenCalledWith("EchoBoy");
  });

  it("omits 'Copy name' when the name is just the fingerprint", () => {
    // Nothing to copy that 'Copy fingerprint' doesn't already give.
    render(
      <PluginRowActions fingerprint={FINGERPRINT} displayName={FINGERPRINT} />,
    );

    expect(
      screen.queryByRole("button", { name: /copy name/i }),
    ).not.toBeInTheDocument();
  });

  it("searches using the user's configured engine", () => {
    // lpx-explorer-tmo: was hard-coded to Google.
    useUIStore.setState({ searchEngine: "duckduckgo" });
    render(
      <PluginRowActions fingerprint={FINGERPRINT} displayName="EchoBoy" />,
    );

    fireEvent.click(screen.getByRole("button", { name: /search the web/i }));

    expect(mockedSearch).toHaveBeenCalledWith("EchoBoy", "duckduckgo");
  });

  it("stops clicks from reaching an enclosing control", () => {
    // Library rows wrap actions in a row that toggles a disclosure.
    let outerClicks = 0;
    render(
      <div onClick={() => (outerClicks += 1)}>
        <PluginRowActions fingerprint={FINGERPRINT} displayName="EchoBoy" />
      </div>,
    );

    fireEvent.click(screen.getByRole("button", { name: /search the web/i }));

    expect(outerClicks).toBe(0);
  });
});
