import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Mock Tauri IPC at the test boundary so frontend tests never hit the runtime.
// Individual tests override this via `vi.mocked(invoke).mockImplementation(...)`.
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));
