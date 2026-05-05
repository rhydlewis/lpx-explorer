import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useUIStore } from "./ui-store";

describe("useUIStore", () => {
  beforeEach(() => {
    useUIStore.setState({ railVisible: false, pluginChainsShowAll: false });
  });
  afterEach(() => {
    useUIStore.setState({ railVisible: false, pluginChainsShowAll: false });
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
});
