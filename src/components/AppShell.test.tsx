import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { AppShell } from "./AppShell";

describe("<AppShell />", () => {
  it("renders the top-bar slot", () => {
    render(
      <AppShell
        topBar={<div data-testid="top">top</div>}
        rail={<div>rail</div>}
        main={<div>main</div>}
      />,
    );

    expect(screen.getByTestId("top")).toBeInTheDocument();
  });

  it("renders the rail and main regions with Logic-terminology aria-labels", () => {
    render(
      <AppShell
        rail={<nav>rail content</nav>}
        main={<section>main content</section>}
      />,
    );

    expect(screen.getByRole("complementary", { name: "library" })).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
  });

  it("collapses the rail column when no rail is supplied", () => {
    render(<AppShell main={<section>main only</section>} />);

    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
  });

  it("renders the right rail with aria-label='plug-ins' when supplied", () => {
    render(
      <AppShell
        rail={<nav>library</nav>}
        rightRail={<div>plugin rail</div>}
        main={<section>main</section>}
      />,
    );

    expect(
      screen.getByRole("complementary", { name: "plug-ins" }),
    ).toBeInTheDocument();
    // Both rails coexist
    expect(
      screen.getByRole("complementary", { name: "library" }),
    ).toBeInTheDocument();
  });

  it("omits the right rail when no rightRail is supplied", () => {
    render(
      <AppShell rail={<nav>library</nav>} main={<section>main</section>} />,
    );

    expect(
      screen.queryByRole("complementary", { name: "plug-ins" }),
    ).not.toBeInTheDocument();
  });

  it("supports a right-rail-only layout (no left rail)", () => {
    render(
      <AppShell
        rightRail={<div>plugins</div>}
        main={<section>main</section>}
      />,
    );

    expect(
      screen.queryByRole("complementary", { name: "library" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("complementary", { name: "plug-ins" }),
    ).toBeInTheDocument();
  });
});
