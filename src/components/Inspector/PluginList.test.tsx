import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import type { ProjectSummary } from "../../lib/types";
import { PluginList } from "./PluginList";

function summaryWith(...fingerprints: ProjectSummary["fingerprints"]): ProjectSummary {
  return { fingerprints };
}

describe("<PluginList />", () => {
  it("renders the fingerprint count", () => {
    const summary = summaryWith(
      { type_code: "aumu", subtype: "EZk2", manufacturer: "Toon", offset: 12 },
      { type_code: "aufx", subtype: "Comp", manufacturer: "Yamh", offset: 248 },
    );

    render(<PluginList summary={summary} />);

    expect(screen.getByText(/2 fingerprint/i)).toBeInTheDocument();
  });

  it("renders the first fingerprint string", () => {
    const summary = summaryWith({
      type_code: "aumu",
      subtype: "EZk2",
      manufacturer: "Toon",
      offset: 12,
    });

    render(<PluginList summary={summary} />);

    expect(screen.getByText("aumu/EZk2/Toon")).toBeInTheDocument();
  });

  it("handles an empty fingerprint list", () => {
    render(<PluginList summary={summaryWith()} />);

    expect(screen.getByText(/0 fingerprint/i)).toBeInTheDocument();
  });

  it("exposes the section under aria-label='plug-ins' (Logic terminology)", () => {
    render(<PluginList summary={summaryWith()} />);

    expect(screen.getByRole("region", { name: "plug-ins" })).toBeInTheDocument();
  });
});
