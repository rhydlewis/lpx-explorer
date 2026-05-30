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
  save: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {
    // no-op unlisten
  }),
}));

// wavesurfer.js needs Web Audio API + canvas, neither of which jsdom
// implements. Stub the constructor with a minimal event-bus shim that
// satisfies WaveformPlayer's create/on/destroy contract — the
// component's behaviour (data-now-playing-src wrapper, play/pause
// button visibility, error fallback) is what tests assert against,
// not the decoded audio. Real playback is verified manually in the
// running app.
vi.mock("wavesurfer.js", () => {
  class StubWaveSurfer {
    private handlers: Record<string, Array<(...args: unknown[]) => void>> = {};
    static create() {
      return new StubWaveSurfer();
    }
    on(event: string, cb: (...args: unknown[]) => void) {
      const bucket = this.handlers[event] ?? [];
      bucket.push(cb);
      this.handlers[event] = bucket;
      return () => {
        this.handlers[event] = (this.handlers[event] ?? []).filter(
          (h) => h !== cb,
        );
      };
    }
    getDuration() {
      return 0;
    }
    getCurrentTime() {
      return 0;
    }
    playPause() {
      return Promise.resolve();
    }
    play() {
      return Promise.resolve();
    }
    pause() {
      // no-op
    }
    destroy() {
      this.handlers = {};
    }
  }
  return { default: StubWaveSurfer };
});

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
