import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { TrackList } from "./TrackList";

describe("<TrackList />", () => {
  it("exposes the section under aria-label='tracks' (Logic terminology)", () => {
    render(<TrackList />);

    expect(screen.getByRole("region", { name: "tracks" })).toBeInTheDocument();
  });

  it("explains that the track list lands later", () => {
    render(<TrackList />);

    expect(screen.getByText(/track-registry/i)).toBeInTheDocument();
  });
});
