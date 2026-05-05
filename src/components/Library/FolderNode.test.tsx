import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import type { FolderEntry } from "../../lib/types";
import { useLibraryStore } from "../../store/library-store";

import { FolderNode } from "./FolderNode";

vi.mock("../../lib/library", () => ({
  scanFolder: vi.fn(),
}));

function entry(overrides: Partial<FolderEntry> = {}): FolderEntry {
  return {
    path: "/Users/rhyd/Music/Logic",
    status: { kind: "idle" },
    projects: [],
    ...overrides,
  };
}

describe("<FolderNode />", () => {
  beforeEach(() => {
    useLibraryStore.getState().clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    useLibraryStore.getState().clear();
    vi.restoreAllMocks();
  });

  it("renders the folder name (last segment of the path)", () => {
    render(<FolderNode folder={entry({ path: "/Users/rhyd/Music/Logic" })} />);

    expect(screen.getByText("Logic")).toBeInTheDocument();
  });

  it("shows a 'Scanning…' indicator while the scan is in flight", () => {
    render(
      <FolderNode
        folder={entry({ status: { kind: "scanning" } })}
      />,
    );

    expect(screen.getByText(/scanning/i)).toBeInTheDocument();
  });

  it("shows the project count when scan is done", () => {
    render(
      <FolderNode
        folder={entry({
          status: { kind: "done" },
          projects: ["/a.logicx", "/b.logicx", "/c.logicx"],
        })}
      />,
    );

    expect(screen.getByText(/3 projects/i)).toBeInTheDocument();
  });

  it("shows an italic empty-state when scan is done with zero projects", () => {
    render(
      <FolderNode folder={entry({ status: { kind: "done" }, projects: [] })} />,
    );

    expect(
      screen.getByText(/no \.logicx projects found/i),
    ).toBeInTheDocument();
  });

  it("renders an error message when the scan fails", () => {
    render(
      <FolderNode
        folder={entry({
          status: { kind: "error", message: "permission denied" },
        })}
      />,
    );

    expect(screen.getByText(/permission denied/i)).toBeInTheDocument();
  });

  it("expands and collapses the project list when the toggle is clicked", () => {
    render(
      <FolderNode
        folder={entry({
          status: { kind: "done" },
          projects: ["/Music/Logic/song-a.logicx"],
        })}
      />,
    );

    const toggle = screen.getByRole("button", { expanded: false });
    expect(screen.queryByText("song-a")).not.toBeInTheDocument();

    fireEvent.click(toggle);

    expect(screen.getByRole("button", { expanded: true })).toBeInTheDocument();
    expect(screen.getByText("song-a")).toBeInTheDocument();
  });

  it("removes the folder from the store when the remove affordance is clicked", () => {
    useLibraryStore.setState({
      folders: [entry({ path: "/Music/Logic" })],
    });
    render(<FolderNode folder={entry({ path: "/Music/Logic" })} />);

    fireEvent.click(screen.getByRole("button", { name: /remove folder/i }));

    expect(useLibraryStore.getState().folders).toHaveLength(0);
  });

  it("filters folder children case-insensitively by the library-store query", () => {
    const folder = entry({
      status: { kind: "done" },
      projects: [
        "/Music/Logic/strings.logicx",
        "/Music/Logic/Demo song.logicx",
        "/Music/Logic/STRINGS sketch.logicx",
      ],
    });
    useLibraryStore.getState().setQuery("strings");

    render(<FolderNode folder={folder} />);

    fireEvent.click(screen.getByRole("button", { expanded: false }));

    expect(screen.queryByText("Demo song")).not.toBeInTheDocument();
    expect(screen.getByText("strings")).toBeInTheDocument();
    expect(screen.getByText("STRINGS sketch")).toBeInTheDocument();
  });

  it("counts matching projects when the query is non-empty", () => {
    const folder = entry({
      status: { kind: "done" },
      projects: [
        "/Music/Logic/a.logicx",
        "/Music/Logic/b.logicx",
        "/Music/Logic/c.logicx",
      ],
    });
    useLibraryStore.getState().setQuery("b");

    render(<FolderNode folder={folder} />);

    expect(screen.getByText(/1 of 3/i)).toBeInTheDocument();
  });

  it("ArrowRight on a collapsed folder toggle expands it", () => {
    render(<FolderNode folder={entry({ status: { kind: "done" } })} />);

    const toggle = screen.getByRole("button", { expanded: false });
    fireEvent.keyDown(toggle, { key: "ArrowRight" });

    expect(screen.getByRole("button", { expanded: true })).toBeInTheDocument();
  });

  it("ArrowLeft on an expanded folder toggle collapses it", () => {
    render(<FolderNode folder={entry({ status: { kind: "done" } })} />);

    const toggle = screen.getByRole("button", { expanded: false });
    fireEvent.click(toggle); // expand
    fireEvent.keyDown(
      screen.getByRole("button", { expanded: true }),
      { key: "ArrowLeft" },
    );

    expect(screen.getByRole("button", { expanded: false })).toBeInTheDocument();
  });

  it("adds the project to Recent when a folder-child row is clicked", () => {
    const folder = entry({
      status: { kind: "done" },
      projects: ["/Music/Logic/song-x.logicx"],
    });
    render(<FolderNode folder={folder} />);

    fireEvent.click(screen.getByRole("button", { expanded: false }));
    fireEvent.click(screen.getByRole("button", { name: /song-x/i }));

    expect(useLibraryStore.getState().recent[0]?.path).toBe(
      "/Music/Logic/song-x.logicx",
    );
  });
});
