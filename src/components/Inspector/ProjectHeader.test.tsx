import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

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
});
