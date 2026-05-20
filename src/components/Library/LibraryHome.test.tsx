import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { useLibraryStore } from "../../store/library-store";
import { useLibrarySummariesStore } from "../../store/library-summaries-store";
import { useUIStore } from "../../store/ui-store";
import { makeSummary } from "../../test/fixtures";
import type { FolderEntry } from "../../lib/types";

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
    useUIStore.setState({ librarySimilarityFilter: null, libraryHomeSort: null });
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
    useUIStore.setState({ librarySimilarityFilter: null, libraryHomeSort: null });
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

  // ── Progress UI removed (lpx-explorer-voe) ──────────────────────────
  // ScanBanner is the canonical scan-progress UI; LibraryHome no longer
  // renders its own progress line. (Per-tile 'Reading…' placeholders
  // inside <LibraryHomeTile /> remain — those are unrelated.)

  it("does not render its own header progress bar — ScanBanner owns that surface", () => {
    const f = folder({
      status: { kind: "done" },
      projects: ["/a.logicx", "/b.logicx", "/c.logicx"],
    });
    const { container } = render(<LibraryHome folder={f} />);

    // The header used to carry a <progress> element + 'Reading X of Y…'
    // / 'Scanning… N found' label. None of that should be present.
    expect(container.querySelector("header progress")).toBeNull();
    expect(screen.queryByText(/scanning…/i)).toBeNull();
    expect(screen.queryByText(/\b\d+ of \d+\b/)).toBeNull();
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

  // ── lpx-explorer-0c5: similarity filter + chip ─────────────────────

  function seedSummary(path: string, overrides: {
    song_key?: string;
    song_gender?: string;
    bpm?: number;
  }) {
    const inner = useLibrarySummariesStore.getState() as unknown as {
      _summariesInner: Map<string, ReturnType<typeof makeSummary>>;
    };
    inner._summariesInner.set(
      path,
      makeSummary({ metadata: overrides }),
    );
    useLibrarySummariesStore.setState({
      summaries: new Map(inner._summariesInner),
    });
  }

  it("renders a dismissible chip when the similarity filter is set", () => {
    useUIStore.setState({
      librarySimilarityFilter: { kind: "key", song_key: "C", song_gender: "Major" },
    });
    render(<LibraryHome folder={folder({ projects: ["/a.logicx"] })} />);

    const chip = screen.getByRole("button", {
      name: /clear similarity filter: c major/i,
    });
    expect(chip).toHaveTextContent(/filtered by:/i);
    expect(chip).toHaveTextContent(/c major/i);
  });

  it("does not render the chip when no filter is set", () => {
    render(<LibraryHome folder={folder({ projects: ["/a.logicx"] })} />);

    expect(screen.queryByText(/filtered by:/i)).not.toBeInTheDocument();
  });

  it("describes a bpm-axis chip with the rounded band", () => {
    useUIStore.setState({
      librarySimilarityFilter: { kind: "bpm", bpm: 92 },
    });
    render(<LibraryHome folder={folder({ projects: ["/a.logicx"] })} />);

    const chip = screen.getByRole("button", {
      name: /clear similarity filter/i,
    });
    expect(chip).toHaveTextContent(/around 92 bpm \(88–92\)/i);
  });

  it("describes a key+bpm-axis chip combining both", () => {
    useUIStore.setState({
      librarySimilarityFilter: {
        kind: "key+bpm",
        song_key: "C",
        song_gender: "Major",
        bpm: 92,
      },
    });
    render(<LibraryHome folder={folder({ projects: ["/a.logicx"] })} />);

    const chip = screen.getByRole("button", {
      name: /clear similarity filter/i,
    });
    expect(chip).toHaveTextContent(/c major around 92 bpm \(88–92\)/i);
  });

  it("clicking the chip clears the filter", () => {
    useUIStore.setState({
      librarySimilarityFilter: { kind: "key", song_key: "C", song_gender: "Major" },
    });
    render(<LibraryHome folder={folder({ projects: ["/a.logicx"] })} />);

    fireEvent.click(
      screen.getByRole("button", { name: /clear similarity filter/i }),
    );

    expect(useUIStore.getState().librarySimilarityFilter).toBeNull();
  });

  it("filters the tile grid to summaries matching the axis", () => {
    seedSummary("/match.logicx", { song_key: "C", song_gender: "Major" });
    seedSummary("/other.logicx", { song_key: "D", song_gender: "Major" });
    useUIStore.setState({
      librarySimilarityFilter: { kind: "key", song_key: "C", song_gender: "Major" },
    });

    render(
      <LibraryHome
        folder={folder({ projects: ["/match.logicx", "/other.logicx"] })}
      />,
    );

    expect(screen.getByText("match")).toBeInTheDocument();
    expect(screen.queryByText("other")).not.toBeInTheDocument();
  });

  it("excludes tiles whose summary hasn't been parsed yet — can't say if they match", () => {
    seedSummary("/known.logicx", { song_key: "C", song_gender: "Major" });
    useUIStore.setState({
      librarySimilarityFilter: { kind: "key", song_key: "C", song_gender: "Major" },
    });

    render(
      <LibraryHome
        folder={folder({ projects: ["/known.logicx", "/unparsed.logicx"] })}
      />,
    );

    expect(screen.getByText("known")).toBeInTheDocument();
    expect(screen.queryByText("unparsed")).not.toBeInTheDocument();
  });

  it("combines name + similarity filtering — tile must pass both", () => {
    seedSummary("/Bass C.logicx", { song_key: "C", song_gender: "Major" });
    seedSummary("/Bass D.logicx", { song_key: "D", song_gender: "Major" });
    seedSummary("/Drums C.logicx", { song_key: "C", song_gender: "Major" });
    useUIStore.setState({
      librarySimilarityFilter: { kind: "key", song_key: "C", song_gender: "Major" },
    });

    render(
      <LibraryHome
        folder={folder({
          projects: ["/Bass C.logicx", "/Bass D.logicx", "/Drums C.logicx"],
        })}
      />,
    );

    fireEvent.change(
      screen.getByRole("searchbox", { name: /search projects/i }),
      { target: { value: "bass" } },
    );

    expect(screen.getByText("Bass C")).toBeInTheDocument();
    expect(screen.queryByText("Bass D")).not.toBeInTheDocument();
    expect(screen.queryByText("Drums C")).not.toBeInTheDocument();
  });

  it("similarity-only empty state reads 'No other projects in <axis>'", () => {
    seedSummary("/a.logicx", { song_key: "D", song_gender: "Major" });
    useUIStore.setState({
      librarySimilarityFilter: { kind: "key", song_key: "C", song_gender: "Major" },
    });

    render(<LibraryHome folder={folder({ projects: ["/a.logicx"] })} />);

    expect(
      screen.getByText(/no other projects in c major/i),
    ).toBeInTheDocument();
  });

  it("name + similarity empty state mentions both", () => {
    seedSummary("/a.logicx", { song_key: "C", song_gender: "Major" });
    useUIStore.setState({
      librarySimilarityFilter: { kind: "key", song_key: "C", song_gender: "Major" },
    });

    render(<LibraryHome folder={folder({ projects: ["/a.logicx"] })} />);

    fireEvent.change(
      screen.getByRole("searchbox", { name: /search projects/i }),
      { target: { value: "synth" } },
    );

    expect(
      screen.getByText(/no projects in c major matching\s+["“]synth["”]/i),
    ).toBeInTheDocument();
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

  // ── lpx-explorer-zh6: result-count line appears when a filter is active

  it("does not render the count line with no filter active", () => {
    render(<LibraryHome folder={folder({ projects: ["/a.logicx", "/b.logicx"] })} />);

    expect(screen.queryByText(/^\d+ of \d+$/)).toBeNull();
  });

  it("shows 'M of N' when a similarity filter is active", () => {
    seedSummary("/match.logicx", { song_key: "C", song_gender: "Major" });
    seedSummary("/other.logicx", { song_key: "D", song_gender: "Major" });
    useUIStore.setState({
      librarySimilarityFilter: { kind: "key", song_key: "C", song_gender: "Major" },
    });

    render(
      <LibraryHome
        folder={folder({ projects: ["/match.logicx", "/other.logicx"] })}
      />,
    );

    expect(screen.getByText("1 of 2")).toBeInTheDocument();
  });

  it("updates the count as the user types in the search box", () => {
    const f = folder({
      projects: ["/Bass.logicx", "/Drums.logicx", "/Synth.logicx"],
    });
    render(<LibraryHome folder={f} />);

    const search = screen.getByRole("searchbox", { name: /search projects/i });
    fireEvent.change(search, { target: { value: "bass" } });

    expect(screen.getByText("1 of 3")).toBeInTheDocument();
  });

  // ── lpx-explorer-m1w: filter survives StrictMode initial-mount cycle
  // React.StrictMode runs every effect setup → cleanup → setup on the
  // first commit to surface cleanup-correctness bugs. The earlier
  // 'clear filter on cleanup' implementation wiped the filter on the
  // mount that followed a pivot — the user saw chip + filtering
  // silently fail. <React.StrictMode> wrapping the render reproduces
  // the dev-mode lifecycle.

  it("similarity filter set before mount survives the StrictMode initial-mount cycle", () => {
    useUIStore.setState({
      librarySimilarityFilter: { kind: "key", song_key: "C", song_gender: "Major" },
    });

    render(
      <StrictMode>
        <LibraryHome folder={folder({ projects: ["/a.logicx"] })} />
      </StrictMode>,
    );

    expect(useUIStore.getState().librarySimilarityFilter).not.toBeNull();
    expect(
      screen.getByRole("button", { name: /clear similarity filter/i }),
    ).toBeInTheDocument();
  });

  describe("sort by name (lpx-explorer-twm)", () => {
    it("renders a sort toggle button when the folder has projects", () => {
      render(<LibraryHome folder={folder({ projects: ["/a.logicx"] })} />);

      expect(screen.getByRole("button", { name: /sort/i })).toBeInTheDocument();
    });

    it("does not render the sort button when the folder is empty", () => {
      render(<LibraryHome folder={folder({ projects: [] })} />);

      expect(screen.queryByRole("button", { name: /sort/i })).not.toBeInTheDocument();
    });

    it("sorts tiles A→Z when libraryHomeSort is 'asc'", () => {
      useUIStore.setState({ libraryHomeSort: "asc" });
      render(
        <LibraryHome folder={folder({ projects: ["/z-project.logicx", "/a-project.logicx"] })} />,
      );

      const tiles = screen.getAllByText(/project/i);
      expect(tiles[0]).toHaveTextContent("a-project");
      expect(tiles[1]).toHaveTextContent("z-project");
    });

    it("sorts tiles Z→A when libraryHomeSort is 'desc'", () => {
      useUIStore.setState({ libraryHomeSort: "desc" });
      render(
        <LibraryHome folder={folder({ projects: ["/a-project.logicx", "/z-project.logicx"] })} />,
      );

      const tiles = screen.getAllByText(/project/i);
      expect(tiles[0]).toHaveTextContent("z-project");
      expect(tiles[1]).toHaveTextContent("a-project");
    });
  });

  it("switching folders DOES clear the filter (genuine path change)", () => {
    useUIStore.setState({
      librarySimilarityFilter: { kind: "key", song_key: "C", song_gender: "Major" },
    });
    const { rerender } = render(
      <LibraryHome folder={folder({ path: "/lib/A", projects: [] })} />,
    );
    expect(useUIStore.getState().librarySimilarityFilter).not.toBeNull();

    rerender(
      <LibraryHome folder={folder({ path: "/lib/B", projects: [] })} />,
    );

    expect(useUIStore.getState().librarySimilarityFilter).toBeNull();
  });
});
