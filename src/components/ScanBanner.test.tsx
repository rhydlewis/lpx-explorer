import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { useLibraryStore } from "../store/library-store";
import { useLibrarySummariesStore } from "../store/library-summaries-store";
import { makeSummary } from "../test/fixtures";

import { ScanBanner } from "./ScanBanner";

vi.mock("../lib/parse", () => ({
  parseProject: vi.fn(),
  projectDataStat: vi.fn(),
}));

vi.mock("../lib/persistence", () => ({
  parseCacheKeyToParts: (key: string) => {
    const i = key.lastIndexOf("#variant=");
    if (i < 0) return { path: key, variant: 0 };
    return { path: key.slice(0, i), variant: Number.parseInt(key.slice(i + 9), 10) };
  },
  persistParseCacheEntry: vi.fn().mockResolvedValue(undefined),
  deleteParseCacheEntry: vi.fn().mockResolvedValue(undefined),
}));

function seedFolders(paths: ReadonlyArray<string>) {
  useLibraryStore.setState({
    folders: [
      {
        path: "/library",
        status: { kind: "done" },
        projects: paths,
      },
    ],
  });
}

describe("<ScanBanner />", () => {
  beforeEach(() => {
    useLibrarySummariesStore.getState().clear();
    useLibraryStore.getState().clear();
  });
  afterEach(() => {
    useLibrarySummariesStore.getState().clear();
    useLibraryStore.getState().clear();
  });

  it("renders nothing when no library folders are registered", () => {
    const { container } = render(<ScanBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when every project has been parsed", () => {
    seedFolders(["/a.logicx", "/b.logicx"]);
    useLibrarySummariesStore.getState().hydrateCache(
      new Map([
        ["/a.logicx", { parser_version: 3, mtime_unix: 1, size_bytes: 1, summary: makeSummary({}) }],
        ["/b.logicx", { parser_version: 3, mtime_unix: 1, size_bytes: 1, summary: makeSummary({}) }],
      ]),
    );

    const { container } = render(<ScanBanner />);

    expect(container).toBeEmptyDOMElement();
  });

  it("shows progress when parses are pending", () => {
    seedFolders(["/a.logicx", "/b.logicx", "/c.logicx"]);
    useLibrarySummariesStore.getState().hydrateCache(
      new Map([
        ["/a.logicx", { parser_version: 3, mtime_unix: 1, size_bytes: 1, summary: makeSummary({}) }],
      ]),
    );

    render(<ScanBanner />);

    expect(screen.getByRole("status")).toHaveTextContent(/1 of 3/);
  });

  it("'waiting' label while the idle gate keeps the scan paused", () => {
    seedFolders(["/a.logicx", "/b.logicx"]);
    useLibrarySummariesStore.setState({ scanPaused: true, userPaused: false });

    render(<ScanBanner />);

    expect(screen.getByRole("status")).toHaveTextContent(/waiting/i);
  });

  it("'paused' label and a Resume button when the user has hard-paused", () => {
    seedFolders(["/a.logicx", "/b.logicx"]);
    useLibrarySummariesStore.setState({ scanPaused: true, userPaused: true });

    render(<ScanBanner />);

    expect(screen.getByRole("status")).toHaveTextContent(/paused/i);
    expect(screen.getByRole("button", { name: /resume/i })).toBeInTheDocument();
  });

  it("'reading' label when the scan is actively running", () => {
    seedFolders(["/a.logicx", "/b.logicx"]);
    useLibrarySummariesStore.setState({ scanPaused: false, userPaused: false });

    render(<ScanBanner />);

    expect(screen.getByRole("status")).toHaveTextContent(/reading/i);
  });

  it("clicking Pause flips userPaused to true (and freezes the scan)", () => {
    seedFolders(["/a.logicx"]);
    useLibrarySummariesStore.setState({ scanPaused: false, userPaused: false });

    render(<ScanBanner />);
    fireEvent.click(screen.getByRole("button", { name: /pause/i }));

    expect(useLibrarySummariesStore.getState().userPaused).toBe(true);
  });

  it("clicking Resume flips userPaused to false", () => {
    seedFolders(["/a.logicx"]);
    useLibrarySummariesStore.setState({ scanPaused: true, userPaused: true });

    render(<ScanBanner />);
    fireEvent.click(screen.getByRole("button", { name: /resume/i }));

    expect(useLibrarySummariesStore.getState().userPaused).toBe(false);
  });
});
