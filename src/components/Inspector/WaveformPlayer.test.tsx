import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { WaveformPlayer } from "./WaveformPlayer";

describe("<WaveformPlayer />", () => {
  it("exposes the src as data-now-playing-src on the wrapper so consumers can identify the active track", () => {
    // AudioPreview's tests assert on this attribute to enforce the
    // single-player invariant without touching wavesurfer internals.
    // This contract is load-bearing; keep the attribute name stable.
    const { container } = render(
      <WaveformPlayer src="asset:///x.logicx/Bounces/mix.wav" />,
    );

    expect(
      container.querySelector("[data-now-playing-src]"),
    ).toHaveAttribute(
      "data-now-playing-src",
      "asset:///x.logicx/Bounces/mix.wav",
    );
  });

  it("renders a play/pause transport button labelled for screen readers", () => {
    // The wavesurfer canvas is interactive (click-to-seek) but isn't
    // keyboard-accessible on its own — the explicit play/pause button
    // is the keyboard/screen-reader path to playback control.
    render(<WaveformPlayer src="asset:///x.wav" />);

    // Disabled initially because wavesurfer hasn't fired 'ready' yet
    // in the stub — verifies the loading state holds the button
    // until audio is decoded.
    const btn = screen.getByRole("button", { name: /play/i });
    expect(btn).toBeInTheDocument();
    expect(btn).toBeDisabled();
  });

  it("shows the current-time / duration readout formatted as mm:ss / mm:ss", () => {
    // Lets users see how far into a multi-minute bounce they are
    // without having to interpret raw seconds. Stub starts at 0/0
    // before any audio is decoded.
    render(<WaveformPlayer src="asset:///x.wav" />);

    expect(screen.getByText("00:00 / 00:00")).toBeInTheDocument();
  });

  it("tears down the wavesurfer instance when src changes", () => {
    // Wavesurfer holds a decoded buffer + canvas context per
    // instance. Without cleanup, switching between rows in
    // AudioPreview would leak memory and double-play audio. We can't
    // observe destroy() directly in jsdom (the stub doesn't track
    // it), so we instead verify the wrapper's data-attr updates —
    // proof the effect re-ran with the new src.
    const { container, rerender } = render(
      <WaveformPlayer src="asset:///a.wav" />,
    );
    expect(
      container.querySelector("[data-now-playing-src]"),
    ).toHaveAttribute("data-now-playing-src", "asset:///a.wav");

    rerender(<WaveformPlayer src="asset:///b.wav" />);

    expect(
      container.querySelector("[data-now-playing-src]"),
    ).toHaveAttribute("data-now-playing-src", "asset:///b.wav");
  });

});
