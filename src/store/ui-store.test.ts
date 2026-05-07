import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  useUIStore,
  TEXT_ZOOM_DEFAULT,
  TEXT_ZOOM_MIN,
  TEXT_ZOOM_MAX,
} from "./ui-store";

describe("useUIStore", () => {
  beforeEach(() => {
    useUIStore.setState({
      railVisible: false,
      pluginChainsShowAll: false,
      pluginRailFilter: "",
      pluginRailChip: "all",
      pluginRailJumpToMissingNonce: 0,
      pluginRailOpen: false,
      pluginRailScope: "project",
      tracksAllExpanded: false,
      tracksExpansionNonce: 0,
      textZoom: TEXT_ZOOM_DEFAULT,
    });
  });
  afterEach(() => {
    useUIStore.setState({
      railVisible: false,
      pluginChainsShowAll: false,
      pluginRailFilter: "",
      pluginRailChip: "all",
      pluginRailJumpToMissingNonce: 0,
      pluginRailOpen: false,
      pluginRailScope: "project",
      tracksAllExpanded: false,
      tracksExpansionNonce: 0,
      textZoom: TEXT_ZOOM_DEFAULT,
    });
  });

  it("starts with the rail hidden — first launch lands on EmptyState", () => {
    expect(useUIStore.getState().railVisible).toBe(false);
  });

  it("setRailVisible(true) shows the rail", () => {
    useUIStore.getState().setRailVisible(true);

    expect(useUIStore.getState().railVisible).toBe(true);
  });

  it("toggleRail flips the visibility", () => {
    useUIStore.getState().toggleRail();
    expect(useUIStore.getState().railVisible).toBe(true);

    useUIStore.getState().toggleRail();
    expect(useUIStore.getState().railVisible).toBe(false);
  });

  it("starts with pluginChainsShowAll off — routing kinds hidden by default", () => {
    expect(useUIStore.getState().pluginChainsShowAll).toBe(false);
  });

  it("setPluginChainsShowAll(true) reveals routing kinds", () => {
    useUIStore.getState().setPluginChainsShowAll(true);

    expect(useUIStore.getState().pluginChainsShowAll).toBe(true);
  });

  it("togglePluginChainsShowAll flips the value", () => {
    useUIStore.getState().togglePluginChainsShowAll();
    expect(useUIStore.getState().pluginChainsShowAll).toBe(true);

    useUIStore.getState().togglePluginChainsShowAll();
    expect(useUIStore.getState().pluginChainsShowAll).toBe(false);
  });

  // ─── PluginRail filter + chip ───────────────────────────────────────

  it("starts with empty plug-in filter and 'all' chip", () => {
    expect(useUIStore.getState().pluginRailFilter).toBe("");
    expect(useUIStore.getState().pluginRailChip).toBe("all");
  });

  it("setPluginRailFilter and setPluginRailChip update independently", () => {
    useUIStore.getState().setPluginRailFilter("comp");
    useUIStore.getState().setPluginRailChip("missing");

    expect(useUIStore.getState().pluginRailFilter).toBe("comp");
    expect(useUIStore.getState().pluginRailChip).toBe("missing");
  });

  // ─── Compatibility-pill jump-to-missing ─────────────────────────────

  it("requestJumpToMissing bumps the nonce, sets chip='missing', clears filter", () => {
    useUIStore.setState({
      pluginRailFilter: "stale",
      pluginRailChip: "all",
      pluginRailJumpToMissingNonce: 0,
    });

    useUIStore.getState().requestJumpToMissing();

    expect(useUIStore.getState().pluginRailJumpToMissingNonce).toBe(1);
    expect(useUIStore.getState().pluginRailChip).toBe("missing");
    expect(useUIStore.getState().pluginRailFilter).toBe("");
  });

  it("repeat requestJumpToMissing keeps incrementing the nonce", () => {
    useUIStore.getState().requestJumpToMissing();
    useUIStore.getState().requestJumpToMissing();
    useUIStore.getState().requestJumpToMissing();

    expect(useUIStore.getState().pluginRailJumpToMissingNonce).toBe(3);
  });

  it("requestJumpToMissing also opens the rail (so narrow-window users see it)", () => {
    useUIStore.setState({ pluginRailOpen: false });

    useUIStore.getState().requestJumpToMissing();

    expect(useUIStore.getState().pluginRailOpen).toBe(true);
  });

  // ─── Narrow-window rail toggle ──────────────────────────────────────

  it("starts with pluginRailOpen=false (closed at narrow widths until user clicks)", () => {
    expect(useUIStore.getState().pluginRailOpen).toBe(false);
  });

  it("togglePluginRailOpen flips the value", () => {
    useUIStore.getState().togglePluginRailOpen();
    expect(useUIStore.getState().pluginRailOpen).toBe(true);

    useUIStore.getState().togglePluginRailOpen();
    expect(useUIStore.getState().pluginRailOpen).toBe(false);
  });

  it("expandAllTracks sets tracksAllExpanded=true and bumps the nonce", () => {
    const before = useUIStore.getState().tracksExpansionNonce;
    useUIStore.getState().expandAllTracks();

    expect(useUIStore.getState().tracksAllExpanded).toBe(true);
    expect(useUIStore.getState().tracksExpansionNonce).toBe(before + 1);
  });

  it("collapseAllTracks sets tracksAllExpanded=false and bumps the nonce", () => {
    useUIStore.setState({
      tracksAllExpanded: true,
      tracksExpansionNonce: 5,
    });

    useUIStore.getState().collapseAllTracks();

    expect(useUIStore.getState().tracksAllExpanded).toBe(false);
    expect(useUIStore.getState().tracksExpansionNonce).toBe(6);
  });

  it("toggleAllTracks flips the value and bumps the nonce on every call", () => {
    useUIStore.getState().toggleAllTracks();
    expect(useUIStore.getState().tracksAllExpanded).toBe(true);
    expect(useUIStore.getState().tracksExpansionNonce).toBe(1);

    useUIStore.getState().toggleAllTracks();
    expect(useUIStore.getState().tracksAllExpanded).toBe(false);
    expect(useUIStore.getState().tracksExpansionNonce).toBe(2);
  });

  describe("textZoom", () => {
    it("starts at 1.0 (the default)", () => {
      expect(useUIStore.getState().textZoom).toBe(TEXT_ZOOM_DEFAULT);
    });

    it("bumpTextZoom(+0.1) increases by one step", () => {
      useUIStore.getState().bumpTextZoom(0.1);
      expect(useUIStore.getState().textZoom).toBeCloseTo(1.1, 5);
    });

    it("bumpTextZoom(-0.1) decreases by one step", () => {
      useUIStore.getState().bumpTextZoom(-0.1);
      expect(useUIStore.getState().textZoom).toBeCloseTo(0.9, 5);
    });

    it("bumpTextZoom clamps at TEXT_ZOOM_MAX", () => {
      useUIStore.getState().setTextZoom(TEXT_ZOOM_MAX);
      useUIStore.getState().bumpTextZoom(0.5);
      expect(useUIStore.getState().textZoom).toBe(TEXT_ZOOM_MAX);
    });

    it("bumpTextZoom clamps at TEXT_ZOOM_MIN", () => {
      useUIStore.getState().setTextZoom(TEXT_ZOOM_MIN);
      useUIStore.getState().bumpTextZoom(-0.5);
      expect(useUIStore.getState().textZoom).toBe(TEXT_ZOOM_MIN);
    });

    it("setTextZoom rejects NaN, falls back to the default", () => {
      useUIStore.getState().setTextZoom(Number.NaN);
      expect(useUIStore.getState().textZoom).toBe(TEXT_ZOOM_DEFAULT);
    });

    it("resetTextZoom returns to the default", () => {
      useUIStore.getState().setTextZoom(1.5);
      useUIStore.getState().resetTextZoom();
      expect(useUIStore.getState().textZoom).toBe(TEXT_ZOOM_DEFAULT);
    });
  });
});
