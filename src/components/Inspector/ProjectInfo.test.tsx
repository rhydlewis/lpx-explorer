import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { makeSummary } from "../../test/fixtures";

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
