import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import type { Alternative } from "../../lib/types";

import { ProjectWindow } from "./ProjectWindow";

function alt(
  index: number,
  display_name: string,
  is_active: boolean,
  window_image_path: string | null,
): Alternative {
  return { index, display_name, is_active, window_image_path };
}

describe("<ProjectWindow />", () => {
  it("renders the active alternative's WindowImage as the hero", () => {
    // Logic writes <bundle>/Alternatives/<NNN>/WindowImage.jpg on save;
    // we render the active one as the recognition hero. convertFileSrc
    // is stubbed in setup.ts to `asset://<path>`.
    const path = "/Users/r/Music/Logic/song.logicx/Alternatives/001/WindowImage.jpg";

    render(
      <ProjectWindow
        alternatives={[
          alt(0, "song", false, "/x/000/WindowImage.jpg"),
          alt(1, "song - alt 1", true, path),
        ]}
        activeVariantIndex={1}
        onSelectAlternative={() => {}}
        lastSavedUnix={1715000000}
        now={new Date(1715600000 * 1000)}
      />,
    );

    expect(
      screen.getByRole("img", { name: /logic window/i }),
    ).toHaveAttribute("src", `asset://${path}`);
  });

  it("captions the hero with a relative-time 'last save' stamp", () => {
    // 10 days delta → formatRelative buckets into the week unit
    // (>= 7d, < 30d) and numeric:'auto' renders "last week".
    const tenDays = 10 * 86400;
    render(
      <ProjectWindow
        alternatives={[alt(0, "x", true, "/x/000/WindowImage.jpg")]}
        activeVariantIndex={0}
        onSelectAlternative={() => {}}
        lastSavedUnix={1715000000}
        now={new Date((1715000000 + tenDays) * 1000)}
      />,
    );

    expect(
      screen.getByText(/snapshot from last save.*last week/i),
    ).toBeInTheDocument();
  });

  it("renders a neutral placeholder when the active alt has no WindowImage", () => {
    // Older Logic versions / projects never re-saved in recent Logic
    // lack WindowImage.jpg. Show a placeholder instead of breaking layout.
    render(
      <ProjectWindow
        alternatives={[alt(0, "x", true, null)]}
        activeVariantIndex={0}
        onSelectAlternative={() => {}}
        lastSavedUnix={1715000000}
      />,
    );

    expect(screen.queryByRole("img", { name: /logic window/i })).not.toBeInTheDocument();
    expect(
      screen.getByText(/no preview available.*older logic/i),
    ).toBeInTheDocument();
  });

  it("double-clicking the hero image opens a lightbox dialog showing the same image", () => {
    // Recognition is the JTBD; the lightbox is for inspecting details
    // (track names, plug-in UIs, mixer state) at native resolution.
    const path = "/x/Alternatives/000/WindowImage.jpg";
    render(
      <ProjectWindow
        alternatives={[alt(0, "x", true, path)]}
        activeVariantIndex={0}
        onSelectAlternative={() => {}}
        lastSavedUnix={1715000000}
      />,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.doubleClick(screen.getByRole("img", { name: /logic window/i }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    // Lightbox renders the same WindowImage at native size; finding it
    // inside the dialog scope (rather than the inspector-level img)
    // confirms it's the dialog's copy.
    const lightboxImg = dialog.querySelector("img");
    expect(lightboxImg).not.toBeNull();
    expect(lightboxImg).toHaveAttribute("src", `asset://${path}`);
  });

  it("pressing Escape closes the lightbox", () => {
    const path = "/x/Alternatives/000/WindowImage.jpg";
    render(
      <ProjectWindow
        alternatives={[alt(0, "x", true, path)]}
        activeVariantIndex={0}
        onSelectAlternative={() => {}}
        lastSavedUnix={1715000000}
      />,
    );

    fireEvent.doubleClick(screen.getByRole("img", { name: /logic window/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("clicking the backdrop closes the lightbox; clicking inside does not", () => {
    const path = "/x/Alternatives/000/WindowImage.jpg";
    render(
      <ProjectWindow
        alternatives={[alt(0, "x", true, path)]}
        activeVariantIndex={0}
        onSelectAlternative={() => {}}
        lastSavedUnix={1715000000}
      />,
    );
    fireEvent.doubleClick(screen.getByRole("img", { name: /logic window/i }));
    const dialog = screen.getByRole("dialog");

    // Click inside the dialog (the image itself) — should NOT close.
    const lightboxImg = dialog.querySelector("img");
    if (lightboxImg !== null) fireEvent.click(lightboxImg);
    expect(screen.queryByRole("dialog")).toBeInTheDocument();

    // Click backdrop (the dialog element itself, outside the inner panel) — closes.
    fireEvent.click(dialog);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders the AlternativeStrip inside the project-window section", () => {
    // The strip is the canonical alternative selector — it lives inside
    // the project-window section as the left column, even for projects
    // with a single alternative (so the switcher's location is
    // predictable and the dropdown can be retired).
    render(
      <ProjectWindow
        alternatives={[alt(0, "only one", true, null)]}
        activeVariantIndex={0}
        onSelectAlternative={() => {}}
        lastSavedUnix={1715000000}
      />,
    );

    const section = screen.getByRole("region", { name: "project window" });
    expect(
      section.querySelector("[role=\"group\"][aria-label=\"alternatives\"]"),
    ).not.toBeNull();
  });
});
