import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import type { ProjectSummary as ProjectSummaryData } from "../lib/types";
import { ProjectSummary } from "./ProjectSummary";

function summaryWith(...fingerprints: ProjectSummaryData["fingerprints"]): ProjectSummaryData {
  return { fingerprints };
}

describe("<ProjectSummary />", () => {
  it("renders the fingerprint count", () => {
    const summary = summaryWith(
      { type_code: "aumu", subtype: "EZk2", manufacturer: "Toon", offset: 12 },
      { type_code: "aufx", subtype: "Comp", manufacturer: "Yamh", offset: 248 },
    );

    render(<ProjectSummary summary={summary} />);

    expect(screen.getByText(/2 fingerprint/i)).toBeInTheDocument();
  });

  it("renders the first fingerprint string", () => {
    const summary = summaryWith({
      type_code: "aumu",
      subtype: "EZk2",
      manufacturer: "Toon",
      offset: 12,
    });

    render(<ProjectSummary summary={summary} />);

    expect(screen.getByText("aumu/EZk2/Toon")).toBeInTheDocument();
  });

  it("handles an empty fingerprint list", () => {
    render(<ProjectSummary summary={summaryWith()} />);

    expect(screen.getByText(/0 fingerprint/i)).toBeInTheDocument();
  });
});
