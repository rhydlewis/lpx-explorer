import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import type { ProjectSummary } from "../../lib/types";
import { makeSummary } from "../../test/fixtures";

import { PluginList } from "./PluginList";

function summaryWith(...fingerprints: ProjectSummary["fingerprints"]): ProjectSummary {
  return makeSummary({ fingerprints });
}

describe("<PluginList />", () => {
  it("renders the plug-in count with the Logic-terminology word", () => {
    const summary = summaryWith(
      { type_code: "aumu", subtype: "EZk2", manufacturer: "Toon", offset: 12 },
      { type_code: "aufx", subtype: "Comp", manufacturer: "Yamh", offset: 248 },
    );

    render(<PluginList summary={summary} />);

    expect(screen.getByText(/2 plug-ins/i)).toBeInTheDocument();
  });

  it("uses singular wording for one plug-in", () => {
    render(
      <PluginList
        summary={summaryWith({
          type_code: "aumu",
          subtype: "EZk2",
          manufacturer: "Toon",
          offset: 12,
        })}
      />,
    );

    expect(screen.getByText(/^1 plug-in$/i)).toBeInTheDocument();
  });

  it("renders the first fingerprint string", () => {
    render(
      <PluginList
        summary={summaryWith({
          type_code: "aumu",
          subtype: "EZk2",
          manufacturer: "Toon",
          offset: 12,
        })}
      />,
    );

    expect(screen.getByText("aumu/EZk2/Toon")).toBeInTheDocument();
  });

  it("renders the empty-state copy when no plug-ins are detected", () => {
    render(<PluginList summary={summaryWith()} />);

    expect(screen.getByText(/no plug-ins detected/i)).toBeInTheDocument();
  });

  it("exposes the section under aria-label='plug-ins' (Logic terminology)", () => {
    render(<PluginList summary={summaryWith()} />);

    expect(screen.getByRole("region", { name: "plug-ins" })).toBeInTheDocument();
  });

  it("renders the small-caps section heading consistent with other Inspector regions", () => {
    render(<PluginList summary={summaryWith()} />);

    expect(screen.getByRole("heading", { name: /plug-ins/i })).toBeInTheDocument();
  });
});
