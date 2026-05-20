import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { useLibraryStore } from "../../store/library-store";
import { useProjectStore } from "../../store/project-store";
import { useUIStore } from "../../store/ui-store";

import { RecentList } from "./RecentList";

vi.mock("../../lib/parse", () => ({
  parseProject: vi.fn().mockResolvedValue({ fingerprints: [] }),
}));

describe("<RecentList />", () => {
  beforeEach(() => {
    useLibraryStore.getState().clear();
    useProjectStore.getState().clear();
    useUIStore.setState({ libraryRailSort: null });
  });

  afterEach(() => {
    useLibraryStore.getState().clear();
    useProjectStore.getState().clear();
    useUIStore.setState({ libraryRailSort: null });
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

  it("filters entries case-insensitively by the library-store query", () => {
    useLibraryStore.getState().addRecent("/a/arp strings.logicx", 1);
    useLibraryStore.getState().addRecent("/b/Demo song.logicx", 2);
    useLibraryStore.getState().addRecent("/c/STRINGS sketch.logicx", 3);
    useLibraryStore.getState().setQuery("strings");

    render(<RecentList />);

    expect(screen.queryByText("Demo song")).not.toBeInTheDocument();
    expect(screen.getByText("arp strings")).toBeInTheDocument();
    expect(screen.getByText("STRINGS sketch")).toBeInTheDocument();
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

  describe("sort by name (lpx-explorer-twm)", () => {
    it("renders entries in recency order when sort is null", () => {
      useLibraryStore.getState().addRecent("/z-project.logicx", 1);
      useLibraryStore.getState().addRecent("/a-project.logicx", 2);
      // addRecent puts newest at top, so a-project (added last) comes first

      render(<RecentList />);

      const rows = screen.getAllByRole("button");
      const names = rows.map((b) => b.textContent ?? "");
      const aIdx = names.findIndex((n) => n.includes("a-project"));
      const zIdx = names.findIndex((n) => n.includes("z-project"));
      expect(aIdx).toBeLessThan(zIdx);
    });

    it("sorts A→Z when libraryRailSort is 'asc'", () => {
      useLibraryStore.getState().addRecent("/z-project.logicx", 1);
      useLibraryStore.getState().addRecent("/a-project.logicx", 2);
      useUIStore.setState({ libraryRailSort: "asc" });

      render(<RecentList />);

      const rows = screen.getAllByRole("button");
      const names = rows.map((b) => b.textContent ?? "");
      const zIdx = names.findIndex((n) => n.includes("z-project"));
      const aIdx = names.findIndex((n) => n.includes("a-project"));
      expect(aIdx).toBeLessThan(zIdx);
    });

    it("sorts Z→A when libraryRailSort is 'desc'", () => {
      useLibraryStore.getState().addRecent("/a-project.logicx", 1);
      useLibraryStore.getState().addRecent("/z-project.logicx", 2);
      useUIStore.setState({ libraryRailSort: "desc" });

      render(<RecentList />);

      const rows = screen.getAllByRole("button");
      const names = rows.map((b) => b.textContent ?? "");
      const zIdx = names.findIndex((n) => n.includes("z-project"));
      const aIdx = names.findIndex((n) => n.includes("a-project"));
      expect(zIdx).toBeLessThan(aIdx);
    });
  });
});
