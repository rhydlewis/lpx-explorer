import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});

// Mock Tauri IPC at the test boundary so frontend tests never hit the runtime.
// Individual tests override this via `vi.mocked(invoke).mockImplementation(...)`.
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  // ProjectWindow uses this to turn a filesystem path into an
  // `asset://` URL the WebView can load. Deterministic stub lets tests
  // assert against the resulting `<img src>`.
  convertFileSrc: (path: string) => `asset://${path}`,
  Channel: class {
    onmessage: ((event: unknown) => void) | null = null;
  },
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {
    // no-op unlisten
  }),
}));

// jsdom does not implement window.matchMedia. The PluginRail
// "narrow window collapses rail to topbar toggle" path uses it; tests
// default to the wide branch (matches: false) and override per-test.
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}
