import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import type { AURef } from "../../lib/types";
import { useAuRegistryStore } from "../../store/au-registry-store";
import { useLibraryStore } from "../../store/library-store";
import { useLibrarySummariesStore } from "../../store/library-summaries-store";
import { useUIStore } from "../../store/ui-store";
import { makeAuRegistry, makeSummary } from "../../test/fixtures";

vi.mock("../../lib/plugin-actions", () => ({
  copyFingerprint: vi.fn().mockResolvedValue(undefined),
  searchPluginOnWeb: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../lib/parse", () => ({
  parseProject: vi.fn(),
  projectDataStat: vi.fn().mockResolvedValue(null),
}));

vi.mock("../../lib/persistence", () => ({
  persistParseCacheEntry: vi.fn().mockResolvedValue(undefined),
  deleteParseCacheEntry: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../lib/open-project", () => ({
  openProject: vi.fn().mockResolvedValue(undefined),
}));

import { parseProject } from "../../lib/parse";
import { openProject } from "../../lib/open-project";
import { copyFingerprint, searchPluginOnWeb } from "../../lib/plugin-actions";

import { PluginRail } from "./PluginRail";

const mockedCopy = vi.mocked(copyFingerprint);
const mockedSearch = vi.mocked(searchPluginOnWeb);
const mockedParse = vi.mocked(parseProject);
const mockedOpen = vi.mocked(openProject);

function ref(
  type: string,
  subtype: string,
  manufacturer: string,
  offset = 0,
): AURef {
  return { type_code: type, subtype, manufacturer, offset };
}

describe("<PluginRail />", () => {
  beforeEach(() => {
    useUIStore.setState({
      pluginRailFilter: "",
      pluginRailChip: "all",
      pluginRailShowFingerprints: false,
      pluginRailScope: "project",
    });
    useAuRegistryStore.setState({ status: { kind: "idle" } });
    useLibraryStore.setState({ recent: [], folders: [] });
    useLibrarySummariesStore.getState().clear();
    mockedCopy.mockClear();
    mockedSearch.mockClear();
    mockedParse.mockReset();
    mockedOpen.mockClear();
  });
  afterEach(() => {
    useUIStore.setState({
      pluginRailFilter: "",
      pluginRailChip: "all",
      pluginRailShowFingerprints: false,
      pluginRailScope: "project",
    });
    useAuRegistryStore.setState({ status: { kind: "idle" } });
    useLibraryStore.setState({ recent: [], folders: [] });
    useLibrarySummariesStore.getState().clear();
  });

  it("renders the section under aria-label='plug-ins'", () => {
    render(<PluginRail summary={makeSummary()} />);

    expect(
      screen.getByRole("region", { name: "plug-ins" }),
    ).toBeInTheDocument();
  });

  it("shows the empty state when no fingerprints are present", () => {
    render(<PluginRail summary={makeSummary()} />);

    expect(screen.getByText(/no plug-ins detected/i)).toBeInTheDocument();
  });

  it("renders one row per unique fingerprint", () => {
    render(
      <PluginRail
        summary={makeSummary({
          fingerprints: [
            ref("aufx", "Comp", "Yamh", 1),
            ref("aufx", "Comp", "Yamh", 2), // duplicate -> ×2 badge
            ref("aumu", "EZk2", "Toon", 3),
          ],
        })}
      />,
    );

    expect(screen.getByText("aufx/Comp/Yamh")).toBeInTheDocument();
    expect(screen.getByText("aumu/EZk2/Toon")).toBeInTheDocument();
    expect(screen.getByText("×2")).toBeInTheDocument();
  });

  it("filter input narrows the visible list", () => {
    render(
      <PluginRail
        summary={makeSummary({
          fingerprints: [
            ref("aufx", "Comp", "Yamh", 1),
            ref("aumu", "EZk2", "Toon", 2),
          ],
        })}
      />,
    );

    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "Comp" },
    });

    expect(screen.getByText("aufx/Comp/Yamh")).toBeInTheDocument();
    expect(screen.queryByText("aumu/EZk2/Toon")).not.toBeInTheDocument();
  });

  it("filter is case-insensitive", () => {
    render(
      <PluginRail
        summary={makeSummary({
          fingerprints: [ref("aufx", "Comp", "Yamh", 1)],
        })}
      />,
    );

    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "yamh" },
    });

    expect(screen.getByText("aufx/Comp/Yamh")).toBeInTheDocument();
  });

  it("Escape clears the filter input", () => {
    render(<PluginRail summary={makeSummary()} />);

    const search = screen.getByRole("searchbox");
    fireEvent.change(search, { target: { value: "anything" } });
    fireEvent.keyDown(search, { key: "Escape" });

    expect(useUIStore.getState().pluginRailFilter).toBe("");
  });

  it("'No matches' placeholder shows when filter empties the list", () => {
    render(
      <PluginRail
        summary={makeSummary({
          fingerprints: [ref("aufx", "Comp", "Yamh", 1)],
        })}
      />,
    );

    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "qzqz" },
    });

    expect(screen.getByText(/no matches/i)).toBeInTheDocument();
  });

  it("collapses every row to one visual line by default (count + status badge inline)", () => {
    // Post-4l1 layout contract: line 1 carries icon + name + count
    // badge + status badge. The fingerprint sub-line is hidden behind
    // the 'Show IDs' header toggle. This test asserts the default-off
    // single-line shape.
    useAuRegistryStore.setState({
      status: { kind: "loaded", registry: makeAuRegistry(["aufx/Comp/Yamh"]) },
    });
    const { container } = render(
      <PluginRail
        summary={makeSummary({
          fingerprints: [
            ref("aufx", "Comp", "Yamh", 1),
            ref("aufx", "Comp", "Yamh", 2), // duplicate -> ×2 on line 1
          ],
        })}
      />,
    );

    const row = container.querySelector("li");
    expect(row).not.toBeNull();
    const lines = row?.querySelectorAll(":scope > div") ?? [];
    expect(lines.length).toBe(1);
    expect(lines[0].textContent).toContain("aufx/Comp/Yamh");
    expect(lines[0].textContent).toContain("×2");
    expect(lines[0].textContent).toContain("Installed");
  });

  it("renders Apple stock plug-ins as a 1-line row (no second line, no synthesised fingerprint)", () => {
    // No fingerprint to show on line 2 → the row collapses to one line.
    useAuRegistryStore.setState({
      status: { kind: "loaded", registry: makeAuRegistry([]) },
    });
    const stockBassAmp: AURef = {
      type_code: "aufx",
      subtype: "bass",
      manufacturer: "appl",
      offset: 1,
      display_name: "Bass Amp",
    };
    const { container } = render(
      <PluginRail summary={makeSummary({ fingerprints: [stockBassAmp] })} />,
    );

    const row = container.querySelector("li");
    expect(row).not.toBeNull();
    const lines = row?.querySelectorAll(":scope > div") ?? [];
    expect(lines.length).toBe(1);
    expect(lines[0].textContent).toContain("Bass Amp");
    expect(lines[0].textContent).toContain("Installed");
  });

  it("renders Apple stock plug-ins by display_name (not synthesised fingerprint) and treats them as installed", () => {
    // The parser surfaces Apple stock plug-ins (Compressor, Bass Amp,
    // Alchemy, ...) with a synthesised fingerprint and the real name in
    // `display_name`. The synthesised fingerprint won't match auval.
    // Render the human name and skip the missing-from-registry verdict.
    useAuRegistryStore.setState({
      status: { kind: "loaded", registry: makeAuRegistry(["aumu/EZk2/Toon"]) },
    });
    const stockBassAmp: AURef = {
      type_code: "aufx",
      subtype: "bass",
      manufacturer: "appl",
      offset: 1,
      display_name: "Bass Amp",
    };
    render(
      <PluginRail
        summary={makeSummary({
          fingerprints: [stockBassAmp, ref("aumu", "EZk2", "Toon", 2)],
        })}
      />,
    );

    expect(screen.getByText("Bass Amp")).toBeInTheDocument();
    // Synthesised fingerprint should NOT be rendered for stock plug-ins.
    expect(screen.queryByText("aufx/bass/appl")).not.toBeInTheDocument();
    // The Bass Amp row should be marked installed, not missing.
    const bassAmpRow = screen
      .getByText("Bass Amp")
      .closest("li") as HTMLElement | null;
    expect(bassAmpRow?.getAttribute("data-status")).toBe("installed");
  });

  it("'Missing' chip narrows to plug-ins not in the AU registry", () => {
    useAuRegistryStore.setState({
      status: { kind: "loaded", registry: makeAuRegistry(["aufx/Comp/Yamh"]) },
    });
    render(
      <PluginRail
        summary={makeSummary({
          fingerprints: [
            ref("aufx", "Comp", "Yamh", 1), // installed
            ref("aumu", "EZk2", "Toon", 2), // missing
          ],
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Missing" }));

    expect(screen.getByText("aumu/EZk2/Toon")).toBeInTheDocument();
    expect(screen.queryByText("aufx/Comp/Yamh")).not.toBeInTheDocument();
  });

  it("'Duplicated' chip narrows to fingerprints with count >= 2", () => {
    render(
      <PluginRail
        summary={makeSummary({
          fingerprints: [
            ref("aufx", "Comp", "Yamh", 1),
            ref("aufx", "Comp", "Yamh", 2), // dup
            ref("aumu", "EZk2", "Toon", 3), // unique
          ],
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Duplicated" }));

    expect(screen.getByText("aufx/Comp/Yamh")).toBeInTheDocument();
    expect(screen.queryByText("aumu/EZk2/Toon")).not.toBeInTheDocument();
  });

  it("count line shows '<visible> of <total>' when filtered, total alone otherwise", () => {
    render(
      <PluginRail
        summary={makeSummary({
          fingerprints: [
            ref("aufx", "Comp", "Yamh", 1),
            ref("aumu", "EZk2", "Toon", 2),
            ref("aumf", "FXR ", "SToy", 3),
          ],
        })}
      />,
    );

    // Unfiltered: '3 plug-ins'.
    expect(screen.getByText(/3 plug-ins/i)).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "Comp" },
    });

    // Filtered: '1 of 3'.
    expect(screen.getByText(/1 of 3/i)).toBeInTheDocument();
  });

  it("missing rows expose 'Copy fingerprint' and 'Search the web' action buttons", () => {
    // Per the 2026-05-06 PM/Whimsy review: the JTBD hole is 'what do I do
    // about a missing plug-in'. Each missing row carries phase-1 actions —
    // copy the fingerprint, search the web for the plug-in name.
    useAuRegistryStore.setState({
      status: { kind: "loaded", registry: makeAuRegistry([]) },
    });
    render(
      <PluginRail
        summary={makeSummary({
          fingerprints: [ref("aufx", "Miss", "Mfgr", 1)],
        })}
      />,
    );

    expect(
      screen.getByRole("button", { name: /copy fingerprint/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /search the web/i }),
    ).toBeInTheDocument();
  });

  it("installed rows do NOT expose the missing-plug-in action buttons", () => {
    useAuRegistryStore.setState({
      status: {
        kind: "loaded",
        registry: makeAuRegistry(["aufx/Comp/Yamh"]),
      },
    });
    render(
      <PluginRail
        summary={makeSummary({
          fingerprints: [ref("aufx", "Comp", "Yamh", 1)],
        })}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /copy fingerprint/i }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: /search the web/i })).toBeNull();
  });

  it("clicking 'Copy fingerprint' on a missing row copies the canonical fingerprint", () => {
    useAuRegistryStore.setState({
      status: { kind: "loaded", registry: makeAuRegistry([]) },
    });
    render(
      <PluginRail
        summary={makeSummary({
          // Soundtoys-style fingerprint to lock in trailing-space preservation.
          fingerprints: [ref("aufx", "EB  ", "SToy", 1)],
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /copy fingerprint/i }));

    expect(mockedCopy).toHaveBeenCalledTimes(1);
    expect(mockedCopy).toHaveBeenCalledWith("aufx/EB  /SToy");
  });

  it("clicking 'Search the web' on a missing row searches by the row's display name", () => {
    // When the fingerprint is in auval-registry-but-display-name-only world
    // (we don't have a registry hit because it's missing), the row's
    // displayName falls back to the fingerprint. Search runs on whatever
    // the user sees — so the displayed name is what we hand to the helper.
    useAuRegistryStore.setState({
      status: { kind: "loaded", registry: makeAuRegistry([]) },
    });
    render(
      <PluginRail
        summary={makeSummary({
          fingerprints: [ref("aumu", "EZk2", "Toon", 1)],
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /search the web/i }));

    expect(mockedSearch).toHaveBeenCalledTimes(1);
    expect(mockedSearch).toHaveBeenCalledWith("aumu/EZk2/Toon");
  });

  it("renders a quiet ghost mark next to a Klopfgeist row (Logic's stock metronome)", () => {
    // Easter egg per the 2026-05-06 Whimsy review — Klopfgeist is German
    // for poltergeist; Apple's silent in-joke as the metronome plug-in
    // name. Fires on the canonical fingerprint, never as decoration.
    useAuRegistryStore.setState({
      status: {
        kind: "loaded",
        registry: makeAuRegistry(["aumu/klop/appl"]),
      },
    });
    render(
      <PluginRail
        summary={makeSummary({
          fingerprints: [ref("aumu", "klop", "appl", 1)],
        })}
      />,
    );

    expect(screen.getByLabelText(/klopfgeist/i)).toBeInTheDocument();
  });

  it("does NOT render the ghost mark on rows that aren't Klopfgeist", () => {
    useAuRegistryStore.setState({
      status: {
        kind: "loaded",
        registry: makeAuRegistry(["aumu/EZk2/Toon"]),
      },
    });
    render(
      <PluginRail
        summary={makeSummary({
          fingerprints: [ref("aumu", "EZk2", "Toon", 1)],
        })}
      />,
    );

    expect(screen.queryByLabelText(/klopfgeist/i)).toBeNull();
  });

  describe("per-row icon + UX reshape (lpx-explorer-4l1)", () => {
    it("does NOT render the category chip row anymore", () => {
      // The category filter was folded into per-row icons; the chip
      // row from lpx-explorer-01w is gone.
      render(<PluginRail summary={makeSummary()} />);

      expect(
        screen.queryByRole("group", { name: /filter by category/i }),
      ).toBeNull();
    });

    it("renders a leading icon on each row (status known)", () => {
      useAuRegistryStore.setState({
        status: { kind: "loaded", registry: makeAuRegistry(["aufx/Comp/Yamh"]) },
      });
      const { container } = render(
        <PluginRail
          summary={makeSummary({
            fingerprints: [ref("aufx", "Comp", "Yamh", 1)],
          })}
        />,
      );

      const row = container.querySelector('li[data-fingerprint="aufx/Comp/Yamh"]');
      expect(row).not.toBeNull();
      // The leading icon renders inside its own span — assert at least
      // one svg is present in the row's first line.
      expect(row?.querySelector("svg")).not.toBeNull();
    });

    it("hides the fingerprint sub-line by default; toggling the header button reveals it", () => {
      // Use a registry entry whose human name DIFFERS from the
      // fingerprint string so the sub-line is the only place the
      // fingerprint text appears in the DOM.
      useAuRegistryStore.setState({
        status: {
          kind: "loaded",
          registry: {
            scanned_at_unix: 0,
            entries: [
              {
                fingerprint: "aufx/Comp/Yamh",
                type_4cc: "aufx",
                subtype_4cc: "Comp",
                manufacturer_4cc: "Yamh",
                name: "Yamaha Compressor",
              },
            ],
          },
        },
      });
      render(
        <PluginRail
          summary={makeSummary({
            fingerprints: [ref("aufx", "Comp", "Yamh", 1)],
          })}
        />,
      );

      // Default: human name is rendered (line 1), fingerprint is not.
      expect(screen.getByText("Yamaha Compressor")).toBeInTheDocument();
      expect(screen.queryByText("aufx/Comp/Yamh")).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: /show ids/i }));

      expect(screen.getByText("aufx/Comp/Yamh")).toBeInTheDocument();
      expect(useUIStore.getState().pluginRailShowFingerprints).toBe(true);
    });

    it("count line surfaces missing-count when there are missing plug-ins", () => {
      useAuRegistryStore.setState({
        status: { kind: "loaded", registry: makeAuRegistry([]) },
      });
      render(
        <PluginRail
          summary={makeSummary({
            fingerprints: [
              ref("aufx", "Miss", "Mfgr", 1),
              ref("aufx", "Comp", "Yamh", 2),
            ],
          })}
        />,
      );

      // 2 plug-ins, both missing — count line includes "2 missing".
      expect(screen.getByText(/2 missing/)).toBeInTheDocument();
    });
  });

  describe("scope toggle (lpx-explorer-185)", () => {
    it("renders 'This project' / 'Library' segmented controls in the header", () => {
      render(<PluginRail summary={makeSummary()} />);

      expect(
        screen.getByRole("button", { name: /this project/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /library/i }),
      ).toBeInTheDocument();
    });

    it("clicking 'Library' flips ui-store.pluginRailScope", () => {
      render(<PluginRail summary={makeSummary()} />);

      fireEvent.click(screen.getByRole("button", { name: /library/i }));

      expect(useUIStore.getState().pluginRailScope).toBe("library");
    });

    it("library scope renders rolled-up rows aggregated across the library", async () => {
      // Two recent projects each containing the same plug-in. Library
      // scope rolls them up to one row with a '· 2 projects' badge.
      useLibraryStore.setState({
        recent: [
          { path: "/a.logicx", name: "a", lastLoadedMs: 1 },
          { path: "/b.logicx", name: "b", lastLoadedMs: 2 },
        ],
        folders: [],
      });
      mockedParse.mockImplementation(async (path: string) => {
        if (path === "/a.logicx") {
          return makeSummary({
            fingerprints: [ref("aumu", "EZk2", "Toon", 1)],
          });
        }
        if (path === "/b.logicx") {
          return makeSummary({
            fingerprints: [ref("aumu", "EZk2", "Toon", 2)],
          });
        }
        return makeSummary();
      });
      useUIStore.setState({ pluginRailScope: "library" });

      render(<PluginRail summary={makeSummary()} />);

      // Wait for the parse promises to settle. The store updates and
      // re-renders the rail with the rolled-up row.
      await screen.findByText(/· 2 projects/i);
      expect(screen.getByText("aumu/EZk2/Toon")).toBeInTheDocument();
    });

    it("library scope rows disclose contributing project paths on click", async () => {
      useLibraryStore.setState({
        recent: [{ path: "/a.logicx", name: "a", lastLoadedMs: 1 }],
        folders: [],
      });
      mockedParse.mockResolvedValue(
        makeSummary({ fingerprints: [ref("aumu", "EZk2", "Toon", 1)] }),
      );
      useUIStore.setState({ pluginRailScope: "library" });

      render(<PluginRail summary={makeSummary()} />);

      await screen.findByText(/· 1 project/i);
      const disclosure = screen.getByText(/· 1 project/i)
        .closest("details");
      expect(disclosure).not.toBeNull();
      // Open the disclosure and check the project path appears.
      if (disclosure !== null) {
        fireEvent.click(disclosure.querySelector("summary")!);
      }
      expect(screen.getByText("/a.logicx")).toBeInTheDocument();
    });

    it("clicking a project path inside a library row opens that project", async () => {
      useLibraryStore.setState({
        recent: [{ path: "/a.logicx", name: "a", lastLoadedMs: 1 }],
        folders: [],
      });
      mockedParse.mockResolvedValue(
        makeSummary({ fingerprints: [ref("aumu", "EZk2", "Toon", 1)] }),
      );
      useUIStore.setState({ pluginRailScope: "library" });

      render(<PluginRail summary={makeSummary()} />);

      await screen.findByText(/· 1 project/i);
      // Open the disclosure first.
      const summary = screen
        .getByText(/· 1 project/i)
        .closest("details")
        ?.querySelector("summary");
      if (summary) fireEvent.click(summary);

      fireEvent.click(screen.getByText("/a.logicx"));

      expect(mockedOpen).toHaveBeenCalledWith("/a.logicx");
    });
  });
});
