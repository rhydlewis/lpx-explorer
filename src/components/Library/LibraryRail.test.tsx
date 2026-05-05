import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { useLibraryStore } from "../../store/library-store";

import { LibraryRail } from "./LibraryRail";

vi.mock("../../lib/parse", () => ({
  parseProject: vi.fn().mockResolvedValue({ fingerprints: [] }),
}));

describe("<LibraryRail />", () => {
  beforeEach(() => {
    useLibraryStore.getState().clear();
  });

  afterEach(() => {
    useLibraryStore.getState().clear();
  });

  it("renders the Recent list when entries exist", () => {
    useLibraryStore.getState().addRecent("/Users/rhyd/Music/Logic/song-x.logicx", 1);

    render(<LibraryRail />);

    expect(screen.getByText("song-x")).toBeInTheDocument();
    expect(screen.getByText(/recent/i)).toBeInTheDocument();
  });

  it("collapses to nothing when the library is empty", () => {
    const { container } = render(<LibraryRail />);

    expect(container).toBeEmptyDOMElement();
  });
});
