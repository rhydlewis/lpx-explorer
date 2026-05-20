import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";

const mockInvoke = vi.mocked(invoke);

import { useProjectStore } from "../../store/project-store";
import { useUIStore } from "../../store/ui-store";

import { ProjectHeader } from "./ProjectHeader";

describe("<ProjectHeader />", () => {
  it("renders the project name extracted from a .logicx path", () => {
    render(
      <ProjectHeader path="/Users/rhyd/Music/Logic/arp strings.logicx" />,
    );

    expect(screen.getByRole("heading", { name: "arp strings" })).toBeInTheDocument();
  });

  it("renders the full bundle path as secondary text", () => {
    const path = "/Users/rhyd/Music/Logic/Demo song.logicx";
    render(<ProjectHeader path={path} />);

    expect(screen.getByText(path)).toBeInTheDocument();
  });

  it("strips a trailing slash before extracting the name", () => {
    render(<ProjectHeader path="/path/to/Mix.logicx/" />);

    expect(screen.getByRole("heading", { name: "Mix" })).toBeInTheDocument();
  });

  it("exposes the section under aria-label='project' (Logic terminology)", () => {
    render(<ProjectHeader path="/x.logicx" />);

    expect(screen.getByRole("region", { name: "project" })).toBeInTheDocument();
  });

  describe("right-click 'Copy path' context menu", () => {
    let writeText: ReturnType<typeof vi.fn>;
    let originalClipboard: Clipboard | undefined;

    beforeEach(() => {
      originalClipboard = navigator.clipboard;
      writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText },
      });
    });

    afterEach(() => {
      if (originalClipboard !== undefined) {
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: originalClipboard,
        });
      }
    });

    it("right-clicking the path opens a context menu with 'Copy path'", () => {
      const path = "/Users/rhyd/Music/Logic/Demo song.logicx";
      render(<ProjectHeader path={path} />);

      // The menu is hidden until the user right-clicks.
      expect(
        screen.queryByRole("button", { name: /copy path/i }),
      ).toBeNull();

      fireEvent.contextMenu(screen.getByText(path));

      expect(
        screen.getByRole("button", { name: /copy path/i }),
      ).toBeInTheDocument();
    });

    it("clicking 'Copy path' writes the trimmed path to the clipboard", () => {
      const path = "/Users/rhyd/Music/Logic/Demo song.logicx/";
      render(<ProjectHeader path={path} />);

      fireEvent.contextMenu(screen.getByText("/Users/rhyd/Music/Logic/Demo song.logicx"));
      fireEvent.click(screen.getByRole("button", { name: /copy path/i }));

      expect(writeText).toHaveBeenCalledTimes(1);
      // Trailing slash is stripped before copying.
      expect(writeText).toHaveBeenCalledWith(
        "/Users/rhyd/Music/Logic/Demo song.logicx",
      );
    });

    it("clicking 'Copy path' dismisses the menu", () => {
      const path = "/x.logicx";
      render(<ProjectHeader path={path} />);

      fireEvent.contextMenu(screen.getByText(path));
      fireEvent.click(screen.getByRole("button", { name: /copy path/i }));

      expect(
        screen.queryByRole("button", { name: /copy path/i }),
      ).toBeNull();
    });

    it("pressing Escape dismisses the menu without copying", () => {
      const path = "/x.logicx";
      render(<ProjectHeader path={path} />);

      fireEvent.contextMenu(screen.getByText(path));
      fireEvent.keyDown(window, { key: "Escape" });

      expect(
        screen.queryByRole("button", { name: /copy path/i }),
      ).toBeNull();
      expect(writeText).not.toHaveBeenCalled();
    });
  });

  describe("back-to-library affordance (lpx-explorer-vrt)", () => {
    beforeEach(() => {
      useUIStore.setState({ selectedLibraryFolder: null });
      useProjectStore.setState({
        current: {
          kind: "loaded",
          path: "/x.logicx",
          summary: { fingerprints: [], metadata: {} as never, stats: {} as never, tracks: [], tracks_registry: [] },
          alternatives: [{ index: 0, display_name: "x", is_active: true, window_image_path: null, last_saved_unix: 0 }],
          activeVariantIndex: 0,
        },
      });
    });
    afterEach(() => {
      useUIStore.setState({ selectedLibraryFolder: null });
      useProjectStore.getState().clear();
    });

    it("labels the back button with the selected folder name (lpx-explorer-pl1)", () => {
      useUIStore.setState({ selectedLibraryFolder: "/Users/rhyd/Music/Logic" });
      render(<ProjectHeader path="/x.logicx" />);

      // Visible label is the folder name; tooltip ('Back to Logic')
      // sits in the title attribute so screen-readers get a fuller
      // description without the visible chrome ballooning.
      const button = screen.getByRole("button", { name: /^logic$/i });
      expect(button).toHaveAttribute("title", "Back to Logic");
    });

    it("does NOT render the button when no library folder is selected", () => {
      useUIStore.setState({ selectedLibraryFolder: null });
      render(<ProjectHeader path="/x.logicx" />);

      expect(screen.queryByRole("button", { name: /^logic$/i })).toBeNull();
    });

    it("clicking the button clears the project store (returns to LibraryHome)", () => {
      useUIStore.setState({ selectedLibraryFolder: "/Users/rhyd/Music/Logic" });
      render(<ProjectHeader path="/x.logicx" />);

      fireEvent.click(screen.getByRole("button", { name: /^logic$/i }));

      expect(useProjectStore.getState().current.kind).toBe("idle");
    });
  });

  // The alternative-switcher dropdown was removed in lpx-explorer-uk1
  // refactor — AlternativeStrip (inside ProjectWindow) is the canonical
  // selector now. Coverage for selection lives in AlternativeStrip.test
  // + ProjectInspector.test.

  describe("Open in Logic Pro button (lpx-explorer-f3l)", () => {
    beforeEach(() => {
      mockInvoke.mockReset();
    });

    it("renders an 'Open in Logic Pro' button", () => {
      render(<ProjectHeader path="/x.logicx" />);

      expect(
        screen.getByRole("button", { name: /open in logic pro/i }),
      ).toBeInTheDocument();
    });

    it("clicking invokes open_in_logic with the trimmed path", () => {
      mockInvoke.mockResolvedValueOnce(undefined);
      render(<ProjectHeader path="/x.logicx/" />);

      fireEvent.click(screen.getByRole("button", { name: /open in logic pro/i }));

      expect(mockInvoke).toHaveBeenCalledWith("open_in_logic", { path: "/x.logicx" });
    });

    it("shows an inline error when the command rejects", async () => {
      mockInvoke.mockRejectedValueOnce("Logic Pro is not installed on this Mac");
      render(<ProjectHeader path="/x.logicx" />);

      fireEvent.click(screen.getByRole("button", { name: /open in logic pro/i }));

      expect(
        await screen.findByText(/logic pro is not installed/i),
      ).toBeInTheDocument();
    });

    it("clears the error immediately when clicked again (before second result)", async () => {
      mockInvoke
        .mockRejectedValueOnce("Logic Pro is not installed on this Mac")
        .mockResolvedValueOnce(undefined);
      render(<ProjectHeader path="/x.logicx" />);

      fireEvent.click(screen.getByRole("button", { name: /open in logic pro/i }));
      await screen.findByText(/logic pro is not installed/i);

      fireEvent.click(screen.getByRole("button", { name: /open in logic pro/i }));

      // Error clears immediately on the second click (setLogicError(null) is synchronous)
      expect(screen.queryByText(/logic pro is not installed/i)).not.toBeInTheDocument();
      expect(mockInvoke).toHaveBeenCalledTimes(2);
    });
  });
});
