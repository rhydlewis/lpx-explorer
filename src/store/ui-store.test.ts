import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useUIStore } from "./ui-store";

describe("useUIStore", () => {
  beforeEach(() => {
    useUIStore.setState({ railVisible: false });
  });
  afterEach(() => {
    useUIStore.setState({ railVisible: false });
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
});
