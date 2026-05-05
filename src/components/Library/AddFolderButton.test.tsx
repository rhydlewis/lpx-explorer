import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { open } from "@tauri-apps/plugin-dialog";

import { useLibraryStore } from "../../store/library-store";

import { AddFolderButton } from "./AddFolderButton";

vi.mock("../../lib/library", () => ({
  scanFolder: vi.fn().mockResolvedValue([]),
}));

const mockedOpen = vi.mocked(open);

describe("<AddFolderButton />", () => {
  beforeEach(() => {
    useLibraryStore.getState().clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    useLibraryStore.getState().clear();
    vi.restoreAllMocks();
  });

  it("renders an 'Add folder' button", () => {
    render(<AddFolderButton />);

    expect(screen.getByRole("button", { name: /add folder/i })).toBeInTheDocument();
  });

  it("opens the directory dialog when clicked", () => {
    mockedOpen.mockResolvedValueOnce(null);
    render(<AddFolderButton />);

    fireEvent.click(screen.getByRole("button", { name: /add folder/i }));

    expect(mockedOpen).toHaveBeenCalledWith(
      expect.objectContaining({ directory: true, multiple: false }),
    );
  });

  it("routes the picked path through library-store.addFolder", async () => {
    mockedOpen.mockResolvedValueOnce("/Users/rhyd/Music/Logic");
    const addFolder = vi.spyOn(useLibraryStore.getState(), "addFolder");
    render(<AddFolderButton />);

    fireEvent.click(screen.getByRole("button", { name: /add folder/i }));
    // Drain microtasks: open() resolves, then the typeof check, then addFolder.
    // A single Promise.resolve() flush isn't enough; setTimeout(0) drains.
    await new Promise<void>((r) => setTimeout(r, 0));

    expect(addFolder).toHaveBeenCalledWith("/Users/rhyd/Music/Logic");
  });

  it("does nothing when the dialog is cancelled (returns null)", async () => {
    mockedOpen.mockResolvedValueOnce(null);
    const addFolder = vi.spyOn(useLibraryStore.getState(), "addFolder");
    render(<AddFolderButton />);

    fireEvent.click(screen.getByRole("button", { name: /add folder/i }));
    await new Promise<void>((r) => setTimeout(r, 0));

    expect(addFolder).not.toHaveBeenCalled();
  });
});
