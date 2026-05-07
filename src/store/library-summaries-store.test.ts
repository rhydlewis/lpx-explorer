import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseProject } from "../lib/parse";
import { makeSummary } from "../test/fixtures";

import { useLibrarySummariesStore } from "./library-summaries-store";

vi.mock("../lib/parse", () => ({
  parseProject: vi.fn(),
}));

const mockedParse = vi.mocked(parseProject);

describe("useLibrarySummariesStore", () => {
  beforeEach(() => {
    useLibrarySummariesStore.getState().clear();
    mockedParse.mockReset();
  });
  afterEach(() => {
    useLibrarySummariesStore.getState().clear();
    vi.restoreAllMocks();
  });

  it("starts with an empty cache", () => {
    const s = useLibrarySummariesStore.getState();
    expect(s.summaries.size).toBe(0);
    expect(s.has("/x.logicx")).toBe(false);
  });

  it("getOrParse parses on first call and caches the result", async () => {
    const summary = makeSummary({});
    mockedParse.mockResolvedValueOnce(summary);

    const result = await useLibrarySummariesStore
      .getState()
      .getOrParse("/x.logicx");

    expect(result).toBe(summary);
    expect(mockedParse).toHaveBeenCalledTimes(1);
    expect(useLibrarySummariesStore.getState().has("/x.logicx")).toBe(true);
  });

  it("getOrParse returns the cached summary on subsequent calls (no re-parse)", async () => {
    const summary = makeSummary({});
    mockedParse.mockResolvedValueOnce(summary);

    await useLibrarySummariesStore.getState().getOrParse("/x.logicx");
    const second = await useLibrarySummariesStore
      .getState()
      .getOrParse("/x.logicx");

    expect(second).toBe(summary);
    expect(mockedParse).toHaveBeenCalledTimes(1);
  });

  it("dedupes concurrent parses for the same path (single in-flight invocation)", async () => {
    let resolve!: (s: ReturnType<typeof makeSummary>) => void;
    mockedParse.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );

    const a = useLibrarySummariesStore.getState().getOrParse("/x.logicx");
    const b = useLibrarySummariesStore.getState().getOrParse("/x.logicx");

    // Flush microtasks so the parse closure (gated on acquireSlot) has
    // a chance to call parseProject and assign `resolve`.
    for (let i = 0; i < 10; i += 1) await Promise.resolve();

    const summary = makeSummary({});
    resolve(summary);

    expect(await a).toBe(summary);
    expect(await b).toBe(summary);
    expect(mockedParse).toHaveBeenCalledTimes(1);
  });

  it("getOrParse returns null and records the error when parse rejects", async () => {
    mockedParse.mockRejectedValueOnce(new Error("ProjectData not found"));

    const result = await useLibrarySummariesStore
      .getState()
      .getOrParse("/broken.logicx");

    expect(result).toBeNull();
    expect(useLibrarySummariesStore.getState().errors.get("/broken.logicx")).toMatch(
      /ProjectData not found/,
    );
    expect(useLibrarySummariesStore.getState().has("/broken.logicx")).toBe(false);
  });

  it("caps concurrent parses at PARSE_CONCURRENCY (=8)", async () => {
    // 12 paths submitted at once. Cap = 8 → only 8 parseProject calls
    // should fire on the first microtask wave; the remaining 4 wait
    // their turn and only start once earlier ones complete.
    const resolvers = new Map<string, (s: ReturnType<typeof makeSummary>) => void>();
    mockedParse.mockImplementation(
      (path: string) =>
        new Promise((resolve) => {
          resolvers.set(path, resolve);
        }),
    );

    const paths = Array.from({ length: 12 }, (_, i) => `/p${i + 1}.logicx`);
    const promises = paths.map((p) =>
      useLibrarySummariesStore.getState().getOrParse(p),
    );

    // Flush microtasks generously so all initial getOrParse closures
    // have run as far as their first await (acquireSlot).
    for (let i = 0; i < 10; i += 1) {
      await Promise.resolve();
    }
    expect(mockedParse).toHaveBeenCalledTimes(8);

    // Complete the first 8; the queue advances and the remaining 4 start.
    const firstEight = paths.slice(0, 8);
    for (const p of firstEight) {
      resolvers.get(p)!(makeSummary({}));
    }
    for (let i = 0; i < 10; i += 1) {
      await Promise.resolve();
    }
    expect(mockedParse).toHaveBeenCalledTimes(12);

    // Drain the rest so the test doesn't dangle.
    for (const p of paths.slice(8)) {
      resolvers.get(p)!(makeSummary({}));
    }
    await Promise.all(promises);
  });

  it("clear empties the cache + errors + in-flight tracking", async () => {
    const summary = makeSummary({});
    mockedParse.mockResolvedValueOnce(summary);
    await useLibrarySummariesStore.getState().getOrParse("/x.logicx");

    useLibrarySummariesStore.getState().clear();

    const s = useLibrarySummariesStore.getState();
    expect(s.summaries.size).toBe(0);
    expect(s.errors.size).toBe(0);
  });
});
