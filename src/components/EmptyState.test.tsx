import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { makeAuRegistry } from "../test/fixtures";

import { EmptyState } from "./EmptyState";

describe("<EmptyState />", () => {
  it("renders the JTBD-led tagline and reassurance copy", () => {
    render(<EmptyState onPickProject={vi.fn()} onOpenFolder={vi.fn()} />);

    expect(
      screen.getByText(
        /Check whether a project will open before you launch Logic\./i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Read-only\. We never write to your projects\./i),
    ).toBeInTheDocument();
  });

  it("surfaces the drag-anywhere hint", () => {
    render(<EmptyState onPickProject={vi.fn()} onOpenFolder={vi.fn()} />);

    expect(
      screen.getByText(/or drag a \.logicx anywhere/i),
    ).toBeInTheDocument();
  });

  it("renders Pick project and Open folder buttons", () => {
    render(<EmptyState onPickProject={vi.fn()} onOpenFolder={vi.fn()} />);

    expect(
      screen.getByRole("button", { name: /pick project/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /open folder/i }),
    ).toBeInTheDocument();
  });

  it("invokes onPickProject when the Pick project button is clicked", () => {
    const handler = vi.fn();
    render(<EmptyState onPickProject={handler} onOpenFolder={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /pick project/i }));

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("renders Open folder as enabled now that folder scanning has shipped", () => {
    render(<EmptyState onPickProject={vi.fn()} onOpenFolder={vi.fn()} />);

    const openFolder = screen.getByRole("button", { name: /open folder/i });
    expect(openFolder).not.toHaveAttribute("aria-disabled", "true");
  });

  it("invokes onOpenFolder when the Open folder button is clicked", () => {
    const handler = vi.fn();
    render(<EmptyState onPickProject={vi.fn()} onOpenFolder={handler} />);

    fireEvent.click(screen.getByRole("button", { name: /open folder/i }));

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("renders the live AU scan progress when the registry is scanning", () => {
    render(
      <EmptyState
        onPickProject={vi.fn()}
        onOpenFolder={vi.fn()}
        auRegistryStatus={{ kind: "scanning", found: 412 }}
      />,
    );

    const status = screen.getByRole("status");
    expect(status.textContent).toMatch(/Reading your AU library/i);
    expect(status.textContent).toContain("412");
  });

  it("renders a quiet 'N plug-ins ready' line when the registry is loaded", () => {
    const registry = makeAuRegistry([
      "aumu/EZk2/Toon",
      "aufx/Comp/appl",
      "aumu/Kat1/Artu",
    ]);
    render(
      <EmptyState
        onPickProject={vi.fn()}
        onOpenFolder={vi.fn()}
        auRegistryStatus={{ kind: "loaded", registry }}
      />,
    );

    expect(screen.getByText(/3 plug-ins ready to check against\./i))
      .toBeInTheDocument();
  });

  it("surfaces an error message when the registry read failed", () => {
    render(
      <EmptyState
        onPickProject={vi.fn()}
        onOpenFolder={vi.fn()}
        auRegistryStatus={{ kind: "error", message: "auval crashed" }}
      />,
    );

    expect(screen.getByRole("status").textContent).toMatch(
      /Couldn't read your AU library/i,
    );
  });

  it("renders no scan-status line when no registry status is provided", () => {
    render(<EmptyState onPickProject={vi.fn()} onOpenFolder={vi.fn()} />);

    expect(screen.queryByRole("status")).toBeNull();
  });

  it("renders no scan-status line when the registry is idle", () => {
    // 'idle' is the brief moment before loadFromCache resolves —
    // showing nothing is correct, the user shouldn't see a flash.
    render(
      <EmptyState
        onPickProject={vi.fn()}
        onOpenFolder={vi.fn()}
        auRegistryStatus={{ kind: "idle" }}
      />,
    );

    expect(screen.queryByRole("status")).toBeNull();
  });
});
