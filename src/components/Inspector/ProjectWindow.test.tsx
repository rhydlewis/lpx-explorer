import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { ProjectWindow } from "./ProjectWindow";

describe("<ProjectWindow />", () => {
  it("renders the WindowImage screenshot when one is present", () => {
    // Logic writes <bundle>/Alternatives/<NNN>/WindowImage.jpg on save;
    // we surface it as a recognition hero. convertFileSrc is stubbed in
    // setup.ts to `asset://<path>`, so the rendered src is deterministic.
    const path = "/Users/r/Music/Logic/song.logicx/Alternatives/000/WindowImage.jpg";

    render(
      <ProjectWindow
        windowImagePath={path}
        lastSavedUnix={1715000000}
        now={new Date(1715600000 * 1000)}
      />,
    );

    const img = screen.getByRole("img", { name: /logic window/i });
    expect(img).toHaveAttribute("src", `asset://${path}`);
  });

  it("captions the screenshot with a relative-time 'last save' stamp", () => {
    // The image is frozen at save time, not live — the caption sets that
    // expectation so users don't read the inspector as a live view.
    // 10 days delta → formatRelative buckets into the week unit
    // (>= 7d, < 30d) and numeric:'auto' renders "last week".
    const tenDays = 10 * 86400;
    render(
      <ProjectWindow
        windowImagePath="/x/Alternatives/000/WindowImage.jpg"
        lastSavedUnix={1715000000}
        now={new Date((1715000000 + tenDays) * 1000)}
      />,
    );

    expect(
      screen.getByText(/snapshot from last save.*last week/i),
    ).toBeInTheDocument();
  });

  it("renders a neutral placeholder when no WindowImage is present", () => {
    // Older Logic versions / projects never re-saved in recent Logic
    // lack WindowImage.jpg. Show a placeholder instead of breaking layout.
    render(
      <ProjectWindow windowImagePath={null} lastSavedUnix={1715000000} />,
    );

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(
      screen.getByText(/no preview available.*older logic/i),
    ).toBeInTheDocument();
  });
});
