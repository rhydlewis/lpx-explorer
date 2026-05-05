import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { makeSummary } from "../../test/fixtures";

import { ProjectInfo } from "./ProjectInfo";

describe("<ProjectInfo />", () => {
  it("exposes the section under aria-label='project info' (Logic terminology)", () => {
    const s = makeSummary();
    render(<ProjectInfo metadata={s.metadata} stats={s.stats} />);

    expect(
      screen.getByRole("region", { name: "project info" }),
    ).toBeInTheDocument();
  });

  it("renders key + gender as 'C major' when both present", () => {
    const s = makeSummary({ metadata: { song_key: "C", song_gender: "Major" } });
    render(<ProjectInfo metadata={s.metadata} stats={s.stats} />);

    expect(screen.getByText("C major")).toBeInTheDocument();
  });

  it("renders ? for unknown key", () => {
    const s = makeSummary();
    render(<ProjectInfo metadata={s.metadata} stats={s.stats} />);

    expect(screen.getByText("?")).toBeInTheDocument();
  });

  it("formats BPM with one decimal", () => {
    const s = makeSummary({ metadata: { bpm: 120 } });
    render(<ProjectInfo metadata={s.metadata} stats={s.stats} />);

    expect(screen.getByText("120.0")).toBeInTheDocument();
  });

  it("renders the time signature as '{num}/{denom}'", () => {
    const s = makeSummary({
      metadata: { sig_numerator: 7, sig_denominator: 8 },
    });
    render(<ProjectInfo metadata={s.metadata} stats={s.stats} />);

    expect(screen.getByText("7/8")).toBeInTheDocument();
  });

  it("formats sample rate in kHz with one decimal", () => {
    const s = makeSummary({ metadata: { sample_rate: 44100 } });
    render(<ProjectInfo metadata={s.metadata} stats={s.stats} />);

    expect(screen.getByText("44.1 kHz")).toBeInTheDocument();
  });

  it("formats bundle size as KB / MB / GB depending on magnitude", () => {
    const kb = makeSummary({ stats: { size_bytes: 12 * 1024 } });
    const { unmount } = render(<ProjectInfo metadata={kb.metadata} stats={kb.stats} />);
    expect(screen.getByText("12.0 KB")).toBeInTheDocument();
    unmount();

    const mb = makeSummary({ stats: { size_bytes: 405020 } });
    render(<ProjectInfo metadata={mb.metadata} stats={mb.stats} />);
    expect(screen.getByText("395.5 KB")).toBeInTheDocument();
  });

  it("formats modified date as YYYY-MM-DD", () => {
    // 2026-04-30T10:14:59Z = 1777889699 unix
    const s = makeSummary({ stats: { modified_at_unix: 1777889699 } });
    render(<ProjectInfo metadata={s.metadata} stats={s.stats} />);

    expect(screen.getByText("2026-05-04")).toBeInTheDocument();
  });

  it("renders an em-dash for missing dates / sizes (zero values)", () => {
    const s = makeSummary({
      stats: { size_bytes: 0, modified_at_unix: 0 },
      metadata: { sample_rate: 0, bpm: 0 },
    });
    render(<ProjectInfo metadata={s.metadata} stats={s.stats} />);

    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(4);
  });

  it("hides the impulse-responses row when count is zero", () => {
    const s = makeSummary({ metadata: { impulse_response_count: 0 } });
    render(<ProjectInfo metadata={s.metadata} stats={s.stats} />);

    expect(screen.queryByText(/impulse responses/i)).not.toBeInTheDocument();
  });

  it("shows the impulse-responses row when count > 0", () => {
    const s = makeSummary({ metadata: { impulse_response_count: 2 } });
    render(<ProjectInfo metadata={s.metadata} stats={s.stats} />);

    expect(screen.getByText(/impulse responses/i)).toBeInTheDocument();
  });
});
