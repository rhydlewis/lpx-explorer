import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { useLibraryStore } from "../../store/library-store";
import { useProjectStore } from "../../store/project-store";

import { RecentList } from "./RecentList";

vi.mock("../../lib/parse", () => ({
  parseProject: vi.fn().mockResolvedValue({ fingerprints: [] }),
}));

describe("<RecentList />", () => {
  beforeEach(() => {
    useLibraryStore.getState().clear();
    useProjectStore.getState().clear();
  });

  afterEach(() => {
    useLibraryStore.getState().clear();
    useProjectStore.getState().clear();
  });

  it("renders nothing when there are no recent entries", () => {
    const { container } = render(<RecentList />);

    expect(container).toBeEmptyDOMElement();
  });

  it("renders a 'RECENT' section heading and one row per recent entry", () => {
    useLibraryStore.getState().addRecent("/Users/rhyd/Music/Logic/song-a.logicx", 1);
    useLibraryStore.getState().addRecent("/Users/rhyd/Music/Logic/song-b.logicx", 2);

    render(<RecentList />);

    expect(screen.getByText(/recent/i)).toBeInTheDocument();
    expect(screen.getByText("song-a")).toBeInTheDocument();
    expect(screen.getByText("song-b")).toBeInTheDocument();
  });

  it("calls project-store.select(path) when a row is clicked", () => {
    const select = vi.spyOn(useProjectStore.getState(), "select");
    useLibraryStore.getState().addRecent("/x.logicx", 1);

    render(<RecentList />);
    fireEvent.click(screen.getByRole("button", { name: /x/i }));

    expect(select).toHaveBeenCalledWith("/x.logicx");
  });

  it("marks the currently-loaded project as selected via aria-current", async () => {
    useLibraryStore.getState().addRecent("/x.logicx", 1);
    await useProjectStore.getState().select("/x.logicx");

    render(<RecentList />);

    expect(screen.getByRole("button", { name: /x/i })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });
});
