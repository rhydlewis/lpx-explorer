import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { useLibraryStore } from "../../store/library-store";
import { useLibrarySummariesStore } from "../../store/library-summaries-store";
import type { FolderEntry } from "../../lib/types";
import { makeSummary } from "../../test/fixtures";

vi.mock("../../lib/parse", () => ({
  parseProject: vi.fn(),
  projectDataStat: vi.fn().mockResolvedValue(null),
}));

vi.mock("../../lib/persistence", () => ({
  persistParseCacheEntry: vi.fn().mockResolvedValue(undefined),
  deleteParseCacheEntry: vi.fn().mockResolvedValue(undefined),
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

  // ── lpx-explorer-xxb: per-folder name filter ────────────────────────

  it("renders a search input when the folder has projects", () => {
    const f = folder({ projects: ["/a.logicx"] });
    render(<LibraryHome folder={f} />);

    expect(
      screen.getByRole("searchbox", { name: /search projects/i }),
    ).toBeInTheDocument();
  });

  it("does not render the search input when the folder is empty", () => {
    render(<LibraryHome folder={folder({ projects: [] })} />);

    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });

  it("typing narrows the visible tiles by case-insensitive substring", () => {
    const f = folder({
      projects: ["/Bass groove.logicx", "/Drum loops.logicx", "/Bass DI.logicx"],
    });
    render(<LibraryHome folder={f} />);

    fireEvent.change(
      screen.getByRole("searchbox", { name: /search projects/i }),
      { target: { value: "bass" } },
    );

    expect(screen.getByText("Bass groove")).toBeInTheDocument();
    expect(screen.getByText("Bass DI")).toBeInTheDocument();
    expect(screen.queryByText("Drum loops")).not.toBeInTheDocument();
  });

  it("shows an empty-state placeholder when nothing matches", () => {
    const f = folder({ projects: ["/Bass.logicx"] });
    render(<LibraryHome folder={f} />);

    fireEvent.change(
      screen.getByRole("searchbox", { name: /search projects/i }),
      { target: { value: "synth" } },
    );

    expect(screen.getByText(/no projects match\s+["“]synth["”]/i)).toBeInTheDocument();
  });

  it("ESC clears the query and restores the full grid", () => {
    const f = folder({
      projects: ["/Bass.logicx", "/Drums.logicx"],
    });
    render(<LibraryHome folder={f} />);

    const search = screen.getByRole("searchbox", { name: /search projects/i });
    fireEvent.change(search, { target: { value: "bass" } });
    expect(screen.queryByText("Drums")).not.toBeInTheDocument();

    fireEvent.keyDown(search, { key: "Escape" });

    expect(screen.getByText("Bass")).toBeInTheDocument();
    expect(screen.getByText("Drums")).toBeInTheDocument();
  });
});
