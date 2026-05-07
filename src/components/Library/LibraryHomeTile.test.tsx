import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { useLibrarySummariesStore } from "../../store/library-summaries-store";
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
import { openProject } from "../../lib/open-project";

import { LibraryHomeTile } from "./LibraryHomeTile";

const mockedParse = vi.mocked(parseProject);
const mockedOpen = vi.mocked(openProject);

describe("<LibraryHomeTile />", () => {
  beforeEach(() => {
    useLibrarySummariesStore.getState().clear();
    mockedParse.mockReset();
    mockedOpen.mockClear();
  });
  afterEach(() => {
    useLibrarySummariesStore.getState().clear();
  });

  it("renders the project name extracted from the path while parsing", () => {
    mockedParse.mockImplementationOnce(() => new Promise(() => {})); // never resolves
    render(
      <LibraryHomeTile path="/Users/rhyd/Music/Logic/song.logicx" />,
    );

    expect(screen.getByText("song")).toBeInTheDocument();
  });

  it("kicks off parseProject on mount", async () => {
    mockedParse.mockImplementationOnce(() => new Promise(() => {}));
    render(<LibraryHomeTile path="/x.logicx" />);

    // The parse is gated on acquireSlot (concurrency cap, lpx-explorer-bh4)
    // so it fires on a microtask after mount, not synchronously.
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
    expect(mockedParse).toHaveBeenCalledWith("/x.logicx");
  });

  it("renders Key·BPM·Sig and counts once the summary parses", async () => {
    mockedParse.mockResolvedValueOnce(
      makeSummary({
        metadata: {
          song_key: "C",
          song_gender: "Major",
          bpm: 120,
          sig_numerator: 7,
          sig_denominator: 8,
          track_count: 12,
        },
        fingerprints: [
          {
            type_code: "aufx",
            subtype: "Comp",
            manufacturer: "Yamh",
            offset: 1,
          },
          {
            type_code: "aumu",
            subtype: "EZk2",
            manufacturer: "Toon",
            offset: 2,
          },
        ],
        stats: {
          size_bytes: 36_500_000,
          created_at_unix: 0,
          modified_at_unix: 0,
        },
      }),
    );

    render(<LibraryHomeTile path="/x.logicx" />);

    expect(await screen.findByText(/C major/)).toBeInTheDocument();
    expect(screen.getByText(/120/)).toBeInTheDocument();
    expect(screen.getByText(/7\/8/)).toBeInTheDocument();
    // Track count and plug-in count.
    expect(screen.getByText(/12 tracks/i)).toBeInTheDocument();
    expect(screen.getByText(/2 plug-ins/i)).toBeInTheDocument();
  });

  it("renders an error state when parse rejects", async () => {
    mockedParse.mockRejectedValueOnce(new Error("ProjectData not found"));
    render(<LibraryHomeTile path="/broken.logicx" />);

    expect(await screen.findByText(/couldn'?t read/i)).toBeInTheDocument();
  });

  it("clicking the tile opens the project via openProject", async () => {
    mockedParse.mockResolvedValueOnce(makeSummary());
    render(<LibraryHomeTile path="/x.logicx" />);

    // Wait for the summary to land before clicking; click works either way.
    await screen.findByText("x");
    fireEvent.click(screen.getByRole("button", { name: /x/i }));

    expect(mockedOpen).toHaveBeenCalledWith("/x.logicx");
  });

  it("re-uses the cache and does not re-parse on subsequent renders of the same path", async () => {
    mockedParse.mockResolvedValue(makeSummary());

    const { unmount } = render(<LibraryHomeTile path="/x.logicx" />);
    await screen.findByText("x");
    unmount();

    render(<LibraryHomeTile path="/x.logicx" />);
    await screen.findByText("x");

    expect(mockedParse).toHaveBeenCalledTimes(1);
  });
});
