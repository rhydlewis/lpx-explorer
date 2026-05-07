import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useUIStore } from "../store/ui-store";

import { installThemeWatcher, resolveTheme } from "./theme";

interface FakeMedia {
  matches: boolean;
  listeners: Array<(e: { matches: boolean }) => void>;
  addEventListener: (event: string, cb: (e: { matches: boolean }) => void) => void;
  removeEventListener: (
    event: string,
    cb: (e: { matches: boolean }) => void,
  ) => void;
  fire: (matches: boolean) => void;
}

function makeFakeMedia(matches: boolean): FakeMedia {
  const m: FakeMedia = {
    matches,
    listeners: [],
    addEventListener: (_event, cb) => {
      m.listeners.push(cb);
    },
    removeEventListener: (_event, cb) => {
      m.listeners = m.listeners.filter((l) => l !== cb);
    },
    fire: (next) => {
      m.matches = next;
      for (const l of m.listeners) l({ matches: next });
    },
  };
  return m;
}

describe("resolveTheme", () => {
  it("returns 'light' when explicit mode is 'light'", () => {
    expect(resolveTheme("light", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
  });

  it("returns 'dark' when explicit mode is 'dark'", () => {
    expect(resolveTheme("dark", true)).toBe("dark");
  });

  it("follows the OS preference when mode is 'system'", () => {
    expect(resolveTheme("system", true)).toBe("light");
    expect(resolveTheme("system", false)).toBe("dark");
  });
});

describe("installThemeWatcher", () => {
  let originalMatchMedia: typeof window.matchMedia;
  let media: FakeMedia;
  let cleanup: (() => void) | null = null;

  function install() {
    cleanup = installThemeWatcher();
  }

  beforeEach(() => {
    originalMatchMedia = window.matchMedia;
    useUIStore.setState({ theme: "system" });
    document.documentElement.removeAttribute("data-theme");
  });
  afterEach(() => {
    if (cleanup !== null) cleanup();
    cleanup = null;
    window.matchMedia = originalMatchMedia;
    document.documentElement.removeAttribute("data-theme");
    vi.restoreAllMocks();
  });

  it("applies the current theme to documentElement on install", () => {
    media = makeFakeMedia(true); // system prefers light
    window.matchMedia = (() => media) as unknown as typeof window.matchMedia;

    install();

    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("re-applies when the store theme changes", () => {
    media = makeFakeMedia(false);
    window.matchMedia = (() => media) as unknown as typeof window.matchMedia;
    install();

    useUIStore.getState().setTheme("light");

    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("flips to dark when the user picks dark even though system says light", () => {
    media = makeFakeMedia(true);
    window.matchMedia = (() => media) as unknown as typeof window.matchMedia;
    install();

    useUIStore.getState().setTheme("dark");

    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("follows OS-level appearance changes when in 'system' mode", () => {
    media = makeFakeMedia(false); // system: dark initially
    window.matchMedia = (() => media) as unknown as typeof window.matchMedia;
    install();
    expect(document.documentElement.dataset.theme).toBe("dark");

    media.fire(true); // OS flips to light

    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("does NOT follow OS-level changes when the user has pinned a mode", () => {
    media = makeFakeMedia(false);
    window.matchMedia = (() => media) as unknown as typeof window.matchMedia;
    install();
    useUIStore.getState().setTheme("dark");

    media.fire(true); // OS flips to light, but user pinned dark

    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("cleanup removes both subscriptions — store changes are ignored after", () => {
    media = makeFakeMedia(false);
    window.matchMedia = (() => media) as unknown as typeof window.matchMedia;
    install();

    cleanup!();
    cleanup = null;
    expect(media.listeners.length).toBe(0);

    useUIStore.getState().setTheme("light");
    media.fire(true);

    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
