import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { makeSummary } from "../../test/fixtures";
import { useLibraryStore } from "../../store/library-store";
import { useProjectStore } from "../../store/project-store";
import { useUIStore } from "../../store/ui-store";

import { ProjectInfo } from "./ProjectInfo";

const NOW_UNIX = 1777889700;
const fixedNow = new Date(NOW_UNIX * 1000);

describe("<ProjectInfo />", () => {
  it("exposes the section under aria-label='project info' (Logic terminology)", () => {
    const s = makeSummary();
    render(<ProjectInfo metadata={s.metadata} stats={s.stats} now={fixedNow} />);

    expect(
      screen.getByRole("region", { name: "project info" }),
    ).toBeInTheDocument();
  });

  it("renders key + gender as 'C major' when both present", () => {
    const s = makeSummary({ metadata: { song_key: "C", song_gender: "Major" } });
    render(<ProjectInfo metadata={s.metadata} stats={s.stats} now={fixedNow} />);

    expect(screen.getByText("C major")).toBeInTheDocument();
  });

  it("renders ? for unknown key", () => {
    const s = makeSummary();
    render(<ProjectInfo metadata={s.metadata} stats={s.stats} now={fixedNow} />);

    expect(screen.getByText("?")).toBeInTheDocument();
  });

  it("formats BPM with one decimal", () => {
    const s = makeSummary({ metadata: { bpm: 120 } });
    render(<ProjectInfo metadata={s.metadata} stats={s.stats} now={fixedNow} />);

    expect(screen.getByText("120.0")).toBeInTheDocument();
  });

  it("renders the time signature as '{num}/{denom}'", () => {
    const s = makeSummary({
      metadata: { sig_numerator: 7, sig_denominator: 8 },
    });
    render(<ProjectInfo metadata={s.metadata} stats={s.stats} now={fixedNow} />);

    expect(screen.getByText("7/8")).toBeInTheDocument();
  });

  it("formats sample rate in kHz with one decimal", () => {
    const s = makeSummary({ metadata: { sample_rate: 44100 } });
    render(<ProjectInfo metadata={s.metadata} stats={s.stats} now={fixedNow} />);

    expect(screen.getByText("44.1 kHz")).toBeInTheDocument();
  });

  it("formats bundle size as KB / MB / GB depending on magnitude", () => {
    const kb = makeSummary({ stats: { size_bytes: 12 * 1024 } });
    const { unmount } = render(
      <ProjectInfo metadata={kb.metadata} stats={kb.stats} now={fixedNow} />,
    );
    expect(screen.getByText("12.0 KB")).toBeInTheDocument();
    unmount();

    const mb = makeSummary({ stats: { size_bytes: 405020 } });
    render(<ProjectInfo metadata={mb.metadata} stats={mb.stats} now={fixedNow} />);
    expect(screen.getByText("395.5 KB")).toBeInTheDocument();
  });

  it("formats modified date as YYYY-MM-DD with a relative suffix", () => {
    const s = makeSummary({
      stats: { modified_at_unix: NOW_UNIX - 270 * 86400 },
    });
    render(<ProjectInfo metadata={s.metadata} stats={s.stats} now={fixedNow} />);

    expect(screen.getByText(/9 months ago/i)).toBeInTheDocument();
  });

  it("renders a Created row above Modified, with the same absolute + relative format", () => {
    const s = makeSummary({
      stats: {
        created_at_unix: NOW_UNIX - 30 * 86400,
        modified_at_unix: NOW_UNIX - 86400,
      },
    });
    render(<ProjectInfo metadata={s.metadata} stats={s.stats} now={fixedNow} />);

    expect(screen.getByText(/^Created$/i)).toBeInTheDocument();
    expect(screen.getByText(/last month/i)).toBeInTheDocument();
    expect(screen.getByText(/yesterday/i)).toBeInTheDocument();
  });

  it("renders an em-dash for missing dates / sizes (zero values)", () => {
    const s = makeSummary({
      stats: { size_bytes: 0, created_at_unix: 0, modified_at_unix: 0 },
      metadata: { sample_rate: 0, bpm: 0 },
    });
    render(<ProjectInfo metadata={s.metadata} stats={s.stats} now={fixedNow} />);

    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(5);
  });

  it("hides the impulse-responses row when count is zero", () => {
    const s = makeSummary({ metadata: { impulse_response_count: 0 } });
    render(<ProjectInfo metadata={s.metadata} stats={s.stats} now={fixedNow} />);

    expect(screen.queryByText(/impulse responses/i)).not.toBeInTheDocument();
  });

  it("shows the impulse-responses row when count > 0", () => {
    const s = makeSummary({ metadata: { impulse_response_count: 2 } });
    render(<ProjectInfo metadata={s.metadata} stats={s.stats} now={fixedNow} />);

    expect(screen.getByText(/impulse responses/i)).toBeInTheDocument();
  });

  it("does not surface the parser-coverage gap (the '(N identified)' apology was removed in lpx-explorer-bul)", () => {
    // The gap was a parser-mental-model leak — track-registry vs
    // channel-strip extraction is an implementation seam, not a user
    // concept. The bare track_count from MetaData stays.
    const s = makeSummary({ metadata: { track_count: 6 } });
    render(<ProjectInfo metadata={s.metadata} stats={s.stats} now={fixedNow} />);

    expect(screen.queryByText(/identified/)).not.toBeInTheDocument();
  });

  describe("similarity pivots (lpx-explorer-89p)", () => {
    beforeEach(() => {
      useUIStore.setState({
        librarySimilarityFilter: null,
        selectedLibraryFolder: null,
      });
      useProjectStore.setState({ current: { kind: "idle" } });
      useLibraryStore.setState({
        recent: [],
        recentFolders: [],
        folders: [],
        query: "",
      });
    });
    afterEach(() => {
      useUIStore.setState({
        librarySimilarityFilter: null,
        selectedLibraryFolder: null,
      });
      useProjectStore.setState({ current: { kind: "idle" } });
      useLibraryStore.setState({
        recent: [],
        recentFolders: [],
        folders: [],
        query: "",
      });
    });

    it("renders the Key cell as a button when key is known", () => {
      const s = makeSummary({
        metadata: { song_key: "C", song_gender: "Major" },
      });
      render(
        <ProjectInfo metadata={s.metadata} stats={s.stats} now={fixedNow} />,
      );

      const btn = screen.getByRole("button", {
        name: /find other projects in c major/i,
      });
      expect(btn).toHaveTextContent("C major");
    });

    it("renders the Key cell as plain text when song_key is unknown", () => {
      const s = makeSummary({
        metadata: { song_key: "?", song_gender: "?" },
      });
      render(
        <ProjectInfo metadata={s.metadata} stats={s.stats} now={fixedNow} />,
      );

      expect(
        screen.queryByRole("button", { name: /find other projects in/i }),
      ).not.toBeInTheDocument();
      expect(screen.getByText("?")).toBeInTheDocument();
    });

    it("renders the BPM cell as a button when bpm is known", () => {
      const s = makeSummary({ metadata: { bpm: 92 } });
      render(
        <ProjectInfo metadata={s.metadata} stats={s.stats} now={fixedNow} />,
      );

      const btn = screen.getByRole("button", {
        name: /find projects around 92 bpm \(88–92\)/i,
      });
      expect(btn).toHaveTextContent("92.0");
    });

    it("renders the BPM cell as plain text when bpm is 0", () => {
      const s = makeSummary({ metadata: { bpm: 0 } });
      render(
        <ProjectInfo metadata={s.metadata} stats={s.stats} now={fixedNow} />,
      );

      expect(
        screen.queryByRole("button", { name: /find projects around/i }),
      ).not.toBeInTheDocument();
      expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    });

    it("renders the combined Key+BPM action only when both are known", () => {
      const s = makeSummary({
        metadata: { song_key: "C", song_gender: "Major", bpm: 92 },
      });
      render(
        <ProjectInfo metadata={s.metadata} stats={s.stats} now={fixedNow} />,
      );

      expect(
        screen.getByRole("button", {
          name: /find projects in c major around 92 bpm/i,
        }),
      ).toBeInTheDocument();
    });

    it("hides the combined action when key is unknown", () => {
      const s = makeSummary({
        metadata: { song_key: "?", song_gender: "?", bpm: 92 },
      });
      render(
        <ProjectInfo metadata={s.metadata} stats={s.stats} now={fixedNow} />,
      );

      expect(
        screen.queryByRole("button", { name: /find projects in/i }),
      ).not.toBeInTheDocument();
    });

    it("hides the combined action when bpm is 0", () => {
      const s = makeSummary({
        metadata: { song_key: "C", song_gender: "Major", bpm: 0 },
      });
      render(
        <ProjectInfo metadata={s.metadata} stats={s.stats} now={fixedNow} />,
      );

      expect(
        screen.queryByRole("button", { name: /find projects in.*around/i }),
      ).not.toBeInTheDocument();
    });

    it("clicking the Key cell sets a key-axis filter, clears the project, and pivots to the containing folder", () => {
      const s = makeSummary({
        metadata: { song_key: "C", song_gender: "Major" },
      });
      useProjectStore.setState({
        current: { kind: "loaded", path: "/lib/song-a.logicx", summary: s, alternatives: [{ index: 0, display_name: "song-a", is_active: true }], activeVariantIndex: 0 },
      });
      useLibraryStore.setState({
        folders: [
          {
            path: "/lib",
            status: { kind: "done" },
            projects: ["/lib/song-a.logicx", "/lib/song-b.logicx"],
          },
        ],
      });

      render(
        <ProjectInfo metadata={s.metadata} stats={s.stats} now={fixedNow} />,
      );

      fireEvent.click(
        screen.getByRole("button", {
          name: /find other projects in c major/i,
        }),
      );

      expect(useUIStore.getState().librarySimilarityFilter).toEqual({
        kind: "key",
        song_key: "C",
        song_gender: "Major",
      });
      expect(useProjectStore.getState().current.kind).toBe("idle");
      expect(useUIStore.getState().selectedLibraryFolder).toBe("/lib");
    });

    it("clicking the BPM cell sets a bpm-axis filter", () => {
      const s = makeSummary({ metadata: { bpm: 92 } });
      useProjectStore.setState({
        current: { kind: "loaded", path: "/lib/song-a.logicx", summary: s, alternatives: [{ index: 0, display_name: "song-a", is_active: true }], activeVariantIndex: 0 },
      });
      useLibraryStore.setState({
        folders: [
          {
            path: "/lib",
            status: { kind: "done" },
            projects: ["/lib/song-a.logicx"],
          },
        ],
      });

      render(
        <ProjectInfo metadata={s.metadata} stats={s.stats} now={fixedNow} />,
      );

      fireEvent.click(
        screen.getByRole("button", {
          name: /find projects around 92 bpm/i,
        }),
      );

      expect(useUIStore.getState().librarySimilarityFilter).toEqual({
        kind: "bpm",
        bpm: 92,
      });
    });

    it("clicking the combined action sets a key+bpm-axis filter", () => {
      const s = makeSummary({
        metadata: { song_key: "C", song_gender: "Major", bpm: 92 },
      });
      useProjectStore.setState({
        current: { kind: "loaded", path: "/lib/song-a.logicx", summary: s, alternatives: [{ index: 0, display_name: "song-a", is_active: true }], activeVariantIndex: 0 },
      });
      useLibraryStore.setState({
        folders: [
          {
            path: "/lib",
            status: { kind: "done" },
            projects: ["/lib/song-a.logicx"],
          },
        ],
      });

      render(
        <ProjectInfo metadata={s.metadata} stats={s.stats} now={fixedNow} />,
      );

      fireEvent.click(
        screen.getByRole("button", {
          name: /find projects in c major around 92 bpm/i,
        }),
      );

      expect(useUIStore.getState().librarySimilarityFilter).toEqual({
        kind: "key+bpm",
        song_key: "C",
        song_gender: "Major",
        bpm: 92,
      });
    });
  });

  it("renders a Lucide icon next to each metadata label (lpx-explorer-319)", () => {
    const s = makeSummary({
      metadata: { track_count: 8, audio_file_count: 4 },
    });
    const { container } = render(
      <ProjectInfo metadata={s.metadata} stats={s.stats} now={fixedNow} />,
    );

    // Each <dt> carries an aria-hidden <svg> from lucide-react.
    const dts = container.querySelectorAll("dt");
    expect(dts.length).toBeGreaterThan(0);
    dts.forEach((dt) => {
      expect(dt.querySelector("svg")).not.toBeNull();
    });
  });
});
