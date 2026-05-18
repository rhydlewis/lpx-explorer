import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";

import type { AudioFile } from "../../lib/types";

import { AudioPreview } from "./AudioPreview";

const mockInvoke = vi.mocked(invoke);

beforeEach(() => {
  // The module-level vi.fn() from test/setup.ts persists across tests.
  // Clear it so per-test call counts are honest.
  mockInvoke.mockReset();
});

function audio(overrides: Partial<AudioFile> = {}): AudioFile {
  return {
    path: "/x.logicx/Bounces/mix.wav",
    file_name: "mix.wav",
    category: "bounce",
    size_bytes: 100,
    mtime_unix: 1715000000,
    previewable: true,
    ...overrides,
  };
}

describe("<AudioPreview />", () => {
  it("renders an empty-state message when the inventory is empty", async () => {
    // Projects with no recorded audio / bounces / freeze files
    // (e.g. all-MIDI sketches that were never bounced) should show
    // an honest empty state rather than a broken-looking play button.
    mockInvoke.mockResolvedValueOnce([] satisfies AudioFile[]);

    render(<AudioPreview path="/empty.logicx" />);

    expect(
      await screen.findByText(
        /no recorded audio.*bounces.*freeze files/i,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /play/i })).not.toBeInTheDocument();
  });

  it("renders a hero play button labelled with the smart-picked file's category and name", async () => {
    // The hero answers "what does this song sound like?" — for that
    // we need to tell the user what they're listening to. PM brief
    // calls this out specifically: never silently pick across
    // categories without telling the user.
    mockInvoke.mockResolvedValueOnce([
      audio({ file_name: "final_mix.wav", category: "bounce" }),
    ] satisfies AudioFile[]);

    render(<AudioPreview path="/song.logicx" />);

    const heroBtn = await screen.findByRole("button", { name: /play/i });
    expect(heroBtn).toBeInTheDocument();
    // Category label + filename both surfaced.
    expect(screen.getByText(/bounce/i)).toBeInTheDocument();
    expect(screen.getByText(/final_mix\.wav/i)).toBeInTheDocument();
  });

  it("renders the hero with duration and size alongside the filename", async () => {
    // The hero is the first thing a user reads — it should answer
    // "what is this and how long?" without needing to expand the
    // inventory panel.
    mockInvoke.mockResolvedValueOnce([
      audio({
        file_name: "final_mix.wav",
        category: "bounce",
        size_bytes: 25 * 1024 * 1024, // 25 MB
        duration_seconds: 280, // 4:40
      }),
    ] satisfies AudioFile[]);

    render(<AudioPreview path="/song.logicx" />);

    expect(await screen.findByText("final_mix.wav")).toBeInTheDocument();
    expect(screen.getByText("4:40")).toBeInTheDocument();
    expect(screen.getByText("25.0 MB")).toBeInTheDocument();
  });

  it("clicking the hero play button mounts the waveform player with the picked file's src", async () => {
    // Single-player invariant is enforced by mounting one
    // WaveformPlayer whose data-now-playing-src reflects the
    // currently-playing path. Tests assert against the data attribute
    // since jsdom can't decode audio.
    mockInvoke.mockResolvedValueOnce([
      audio({
        path: "/x.logicx/Bounces/mix.wav",
        file_name: "mix.wav",
      }),
    ] satisfies AudioFile[]);

    const { container } = render(<AudioPreview path="/x.logicx" />);

    const heroBtn = await screen.findByRole("button", { name: /play/i });
    fireEvent.click(heroBtn);

    const player = container.querySelector("[data-now-playing-src]");
    expect(player).not.toBeNull();
    expect(player).toHaveAttribute(
      "data-now-playing-src",
      "asset:///x.logicx/Bounces/mix.wav",
    );
  });

  it("clicking a different row in the expanded inventory switches the player's src (single-player invariant)", async () => {
    // PM acceptance: 'starting one ▶ stops any prior playback'. We
    // verify this indirectly: data-now-playing-src moves to whichever
    // row was last clicked. Exactly one WaveformPlayer exists at a time.
    mockInvoke.mockResolvedValueOnce([
      audio({
        path: "/x.logicx/Bounces/mix.wav",
        file_name: "mix.wav",
      }),
      audio({
        path: "/x.logicx/Audio Files/vocal.wav",
        file_name: "vocal.wav",
        category: "audio-region",
        size_bytes: 5000,
      }),
    ] satisfies AudioFile[]);

    const { container } = render(<AudioPreview path="/x.logicx" />);

    const expandBtn = await screen.findByRole("button", { name: /all audio files/i });
    fireEvent.click(expandBtn);

    // The hero already targets mix.wav; click vocal.wav's row button.
    const vocalRow = await screen.findByRole("button", {
      name: /play vocal\.wav/i,
    });
    fireEvent.click(vocalRow);

    const players = container.querySelectorAll("[data-now-playing-src]");
    // Critical: exactly one player mounted. A second one would mean
    // the prior playback is still running.
    expect(players).toHaveLength(1);
    expect(players[0]).toHaveAttribute(
      "data-now-playing-src",
      "asset:///x.logicx/Audio Files/vocal.wav",
    );
  });

  it("disables play buttons for non-previewable CAF files and explains why via title", async () => {
    // CAF freeze files: we list them honestly but the WebView can't
    // decode the format. Disabled button + tooltip is the v1 mitigation;
    // a "Format not supported" badge would be even better but YAGNI for
    // now — tooltip is the standard browser disabled-button affordance.
    mockInvoke.mockResolvedValueOnce([
      audio({
        path: "/x.logicx/Freeze Files/track_1.caf",
        file_name: "track_1.caf",
        category: "freeze-file",
        previewable: false,
      }),
    ] satisfies AudioFile[]);

    render(<AudioPreview path="/x.logicx" />);

    // Inventory is non-empty but no previewable hero → render the
    // inventory panel directly (no hero) so the user sees the file
    // exists and learns why it can't play.
    const rowBtn = await screen.findByRole("button", {
      name: /track_1\.caf.*not previewable/i,
    });
    expect(rowBtn).toBeDisabled();
    expect(rowBtn).toHaveAttribute(
      "title",
      expect.stringMatching(/not supported/i),
    );
  });

  it("renders duration as mm:ss in inventory rows when the Rust side parsed a header", async () => {
    // Two files: one with a parsed duration, one without. The first
    // gets a mm:ss column; the second renders without it (we don't
    // show 0:00 for unknown — that lies about a known-good zero).
    mockInvoke.mockResolvedValueOnce([
      audio({
        file_name: "intro.wav",
        path: "/x.logicx/Audio Files/intro.wav",
        category: "audio-region",
        duration_seconds: 75.4, // 1:15
      }),
      audio({
        file_name: "mystery.wav",
        path: "/x.logicx/Audio Files/mystery.wav",
        category: "audio-region",
        duration_seconds: null,
      }),
    ] satisfies AudioFile[]);

    render(<AudioPreview path="/x.logicx" />);

    const expandBtn = await screen.findByRole("button", {
      name: /all audio files/i,
    });
    fireEvent.click(expandBtn);

    // Duration shows in both the hero card and the row (hero gets
    // picked from the inventory by smart-pick), so use findAllByText
    // to allow the duplicate. Confirms it rendered *at all* —
    // toBeInTheDocument is implicit in the length check.
    const matches = await screen.findAllByText("1:15");
    expect(matches.length).toBeGreaterThanOrEqual(1);
    // For unknown duration we render nothing — the cell should be absent.
    expect(screen.queryByText(/0:00/)).not.toBeInTheDocument();
  });

  it("renders h:mm:ss duration for files longer than an hour", async () => {
    // Real-world: long-form podcasts / live recordings get bounced
    // to multi-hour AIFF files. mm:ss would mis-render 3700s as
    // 61:40 — h:mm:ss reads correctly as 1:01:40.
    mockInvoke.mockResolvedValueOnce([
      audio({
        file_name: "podcast.wav",
        path: "/x.logicx/Bounces/podcast.wav",
        duration_seconds: 3700,
      }),
    ] satisfies AudioFile[]);

    render(<AudioPreview path="/x.logicx" />);

    const expandBtn = await screen.findByRole("button", {
      name: /all audio files/i,
    });
    fireEvent.click(expandBtn);

    // Same hero+row duplicate as above — assert ≥1 rather than =1.
    const matches = await screen.findAllByText("1:01:40");
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("re-fetches the inventory when the project path changes", async () => {
    // Switching between projects in the same session must re-query
    // — otherwise the second project would show the first's audio.
    mockInvoke
      .mockResolvedValueOnce([
        audio({ file_name: "a.wav", path: "/a.logicx/Bounces/a.wav" }),
      ] satisfies AudioFile[])
      .mockResolvedValueOnce([
        audio({ file_name: "b.wav", path: "/b.logicx/Bounces/b.wav" }),
      ] satisfies AudioFile[]);

    const { rerender } = render(<AudioPreview path="/a.logicx" />);
    expect(await screen.findByText(/a\.wav/)).toBeInTheDocument();

    rerender(<AudioPreview path="/b.logicx" />);

    expect(await screen.findByText(/b\.wav/)).toBeInTheDocument();
    expect(screen.queryByText(/a\.wav/)).not.toBeInTheDocument();
    expect(mockInvoke).toHaveBeenCalledTimes(2);
    expect(mockInvoke).toHaveBeenNthCalledWith(1, "list_audio_files", {
      path: "/a.logicx",
    });
    expect(mockInvoke).toHaveBeenNthCalledWith(2, "list_audio_files", {
      path: "/b.logicx",
    });
  });
});
