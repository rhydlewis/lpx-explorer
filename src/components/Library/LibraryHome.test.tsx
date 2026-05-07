import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { useLibraryStore } from "../../store/library-store";
import { useLibrarySummariesStore } from "../../store/library-summaries-store";
import type { FolderEntry } from "../../lib/types";
import { makeSummary } from "../../test/fixtures";

vi.mock("../../lib/parse", () => ({
  parseProject: vi.fn(),
}));

vi.mock("../../lib/open-project", () => ({
  openProject: vi.fn().mockResolvedValue(undefined),
}));

import { parseProject } from "../../lib/parse";
import { LibraryHome } from "./LibraryHome";

const mockedParse = vi.mocked(parseProject);

function folder(overrides: Partial<FolderEntry> = {}): FolderEntry {
  return {
    path: "/Users/rhyd/Music/Logic",
    status: { kind: "done" },
    projects: [],
    ...overrides,
  };
}

describe("<LibraryHome />", () => {
  beforeEach(() => {
    useLibraryStore.setState({
      recent: [],
      folders: [],
      recentFolders: [],
      query: "",
    });
    useLibrarySummariesStore.getState().clear();
    mockedParse.mockReset();
    // Default: never resolves so tiles stay in loading state and don't
    // dominate the test output.
    mockedParse.mockImplementation(() => new Promise(() => {}));
  });
  afterEach(() => {
    useLibraryStore.setState({
      recent: [],
      folders: [],
      recentFolders: [],
      query: "",
    });
    useLibrarySummariesStore.getState().clear();
  });

  it("renders the section under aria-label='library home'", () => {
    render(<LibraryHome folder={folder()} />);

    expect(
      screen.getByRole("region", { name: /library home/i }),
    ).toBeInTheDocument();
  });

  it("renders a tile per project in the folder", () => {
    const f = folder({
      projects: [
        "/Users/rhyd/Music/Logic/song-a.logicx",
        "/Users/rhyd/Music/Logic/song-b.logicx",
        "/Users/rhyd/Music/Logic/song-c.logicx",
      ],
    });
    render(<LibraryHome folder={f} />);

    expect(screen.getByText("song-a")).toBeInTheDocument();
    expect(screen.getByText("song-b")).toBeInTheDocument();
    expect(screen.getByText("song-c")).toBeInTheDocument();
  });

  it("renders a 'scanning' indicator when the folder is still being scanned", () => {
    const f = folder({ status: { kind: "scanning" }, projects: [] });
    render(<LibraryHome folder={f} />);

    expect(screen.getByText(/scanning/i)).toBeInTheDocument();
  });

  it("renders an empty state when the folder has no .logicx projects", () => {
    const f = folder({ status: { kind: "done" }, projects: [] });
    render(<LibraryHome folder={f} />);

    expect(
      screen.getByText(/no \.logicx projects in this folder/i),
    ).toBeInTheDocument();
  });

  it("renders an error state when the folder scan failed", () => {
    const f = folder({
      status: { kind: "error", message: "permission denied" },
      projects: [],
    });
    render(<LibraryHome folder={f} />);

    expect(screen.getByText(/permission denied/i)).toBeInTheDocument();
  });

  it("shows 'Scanning… N found' while the scan is running, with the live project count", () => {
    const f = folder({
      status: { kind: "scanning" },
      projects: [
        "/Users/rhyd/Music/Logic/song-a.logicx",
        "/Users/rhyd/Music/Logic/song-b.logicx",
      ],
    });
    render(<LibraryHome folder={f} />);

    expect(screen.getByText(/scanning.*2 found/i)).toBeInTheDocument();
  });

  it("shows 'Reading 0 of N…' progress while tiles parse after a finished scan", () => {
    // Folder scan complete, but no summaries cached yet — every tile is
    // still in flight.
    const f = folder({
      status: { kind: "done" },
      projects: [
        "/Users/rhyd/Music/Logic/song-a.logicx",
        "/Users/rhyd/Music/Logic/song-b.logicx",
        "/Users/rhyd/Music/Logic/song-c.logicx",
      ],
    });
    render(<LibraryHome folder={f} />);

    expect(screen.getByText(/reading 0 of 3/i)).toBeInTheDocument();
  });

  it("hides the progress line once every tile has its summary cached", async () => {
    const f = folder({
      status: { kind: "done" },
      projects: ["/a.logicx", "/b.logicx"],
    });
    // Pre-seed the cache so both tiles render in 'loaded' state.
    mockedParse.mockResolvedValue(makeSummary({}));
    await useLibrarySummariesStore.getState().getOrParse("/a.logicx");
    await useLibrarySummariesStore.getState().getOrParse("/b.logicx");

    render(<LibraryHome folder={f} />);

    expect(screen.queryByText(/reading/i)).toBeNull();
  });
});
