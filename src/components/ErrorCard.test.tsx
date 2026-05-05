import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { ErrorCard } from "./ErrorCard";

describe("<ErrorCard />", () => {
  it("renders headline + role='alert' so screen readers announce it", () => {
    render(<ErrorCard headline="Couldn't open project" />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/couldn't open project/i);
  });

  it("renders the optional subhead", () => {
    render(
      <ErrorCard
        headline="Couldn't open project"
        subhead="/Users/rhyd/Music/Logic/song.logicx"
      />,
    );

    expect(
      screen.getByText("/Users/rhyd/Music/Logic/song.logicx"),
    ).toBeInTheDocument();
  });

  it("hides technical detail behind a collapsed <details>", () => {
    render(
      <ErrorCard
        headline="Couldn't open project"
        detail="ProjectData not found in bundle"
      />,
    );

    const summary = screen.getByText(/technical details/i);
    // The detail is in the DOM but not visibly expanded by default.
    expect(screen.getByText(/projectdata not found in bundle/i)).toBeInTheDocument();
    expect(summary.closest("details")).not.toHaveAttribute("open");
  });

  it("renders the retry button when onRetry is provided", () => {
    const onRetry = vi.fn();
    render(<ErrorCard headline="Try me" onRetry={onRetry} />);

    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("omits the retry button when onRetry is absent", () => {
    render(<ErrorCard headline="Static error" />);

    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();
  });

  it("supports a custom retry label", () => {
    render(
      <ErrorCard
        headline="No reach"
        onRetry={vi.fn()}
        retryLabel="Run AU scan"
      />,
    );

    expect(
      screen.getByRole("button", { name: /run au scan/i }),
    ).toBeInTheDocument();
  });
});
