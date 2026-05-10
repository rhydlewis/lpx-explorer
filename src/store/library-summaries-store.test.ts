import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseProject, projectDataStat } from "../lib/parse";
import {
  deleteParseCacheEntry,
  persistParseCacheEntry,
} from "../lib/persistence";
import { makeSummary } from "../test/fixtures";

import {
  isScanPaused,
  queuedParseCount,
  setScanPaused,
  useLibrarySummariesStore,
} from "./library-summaries-store";

vi.mock("../lib/parse", () => ({
  parseProject: vi.fn(),
  projectDataStat: vi.fn(),
}));

vi.mock("../lib/persistence", () => ({
  persistParseCacheEntry: vi.fn().mockResolvedValue(undefined),
  deleteParseCacheEntry: vi.fn().mockResolvedValue(undefined),
}));

const mockedParse = vi.mocked(parseProject);
const mockedStat = vi.mocked(projectDataStat);
const mockedPersist = vi.mocked(persistParseCacheEntry);
const mockedDelete = vi.mocked(deleteParseCacheEntry);

describe("useLibrarySummariesStore", () => {
  beforeEach(() => {
    useLibrarySummariesStore.getState().clear();
    mockedParse.mockReset();
    mockedStat.mockReset();
    mockedPersist.mockClear();
    mockedDelete.mockClear();
    // Default: stat returns a stable value so cache writes don't blow
    // up. Tests that care about the stat path override this.
    mockedStat.mockResolvedValue({ mtime_unix: 1000, size_bytes: 100 });
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

  // ── lpx-explorer-aay: stat-keyed parse cache ────────────────────────

  it("hydrateCache pre-fills summaries without parsing", () => {
    const summary = makeSummary({});
    const cache = new Map([
      [
        "/x.logicx",
        { parser_version: 2, mtime_unix: 100, size_bytes: 50, summary },
      ],
    ]);

    useLibrarySummariesStore.getState().hydrateCache(cache);

    expect(useLibrarySummariesStore.getState().has("/x.logicx")).toBe(true);
    expect(mockedParse).not.toHaveBeenCalled();
  });

  it("getOrParse stat-validates a hydrated entry and serves the cache when fresh", async () => {
    const summary = makeSummary({});
    useLibrarySummariesStore.getState().hydrateCache(
      new Map([["/x.logicx", { parser_version: 2, mtime_unix: 100, size_bytes: 50, summary }]]),
    );
    mockedStat.mockResolvedValueOnce({ mtime_unix: 100, size_bytes: 50 });

    const result = await useLibrarySummariesStore
      .getState()
      .getOrParse("/x.logicx");

    expect(result).toBe(summary);
    expect(mockedParse).not.toHaveBeenCalled();
    expect(mockedStat).toHaveBeenCalledTimes(1);
  });

  it("getOrParse re-parses when the stat shows the file changed (mtime mismatch)", async () => {
    const oldSummary = makeSummary({});
    useLibrarySummariesStore
      .getState()
      .hydrateCache(
        new Map([
          ["/x.logicx", { parser_version: 2, mtime_unix: 100, size_bytes: 50, summary: oldSummary }],
        ]),
      );
    mockedStat.mockResolvedValueOnce({ mtime_unix: 200, size_bytes: 50 }); // changed
    mockedStat.mockResolvedValueOnce({ mtime_unix: 200, size_bytes: 50 }); // for cache write
    const newSummary = makeSummary({});
    mockedParse.mockResolvedValueOnce(newSummary);

    const result = await useLibrarySummariesStore
      .getState()
      .getOrParse("/x.logicx");

    expect(result).toBe(newSummary);
    expect(mockedParse).toHaveBeenCalledTimes(1);
    expect(mockedDelete).toHaveBeenCalledWith("/x.logicx");
  });

  it("getOrParse re-parses when the file size changed", async () => {
    const oldSummary = makeSummary({});
    useLibrarySummariesStore
      .getState()
      .hydrateCache(
        new Map([
          ["/x.logicx", { parser_version: 2, mtime_unix: 100, size_bytes: 50, summary: oldSummary }],
        ]),
      );
    mockedStat.mockResolvedValueOnce({ mtime_unix: 100, size_bytes: 200 });
    mockedStat.mockResolvedValueOnce({ mtime_unix: 100, size_bytes: 200 });
    const newSummary = makeSummary({});
    mockedParse.mockResolvedValueOnce(newSummary);

    const result = await useLibrarySummariesStore
      .getState()
      .getOrParse("/x.logicx");

    expect(result).toBe(newSummary);
    expect(mockedParse).toHaveBeenCalledTimes(1);
  });

  it("getOrParse only stat-validates once per session per path", async () => {
    const summary = makeSummary({});
    useLibrarySummariesStore.getState().hydrateCache(
      new Map([["/x.logicx", { parser_version: 2, mtime_unix: 100, size_bytes: 50, summary }]]),
    );
    mockedStat.mockResolvedValueOnce({ mtime_unix: 100, size_bytes: 50 });

    await useLibrarySummariesStore.getState().getOrParse("/x.logicx");
    await useLibrarySummariesStore.getState().getOrParse("/x.logicx");
    await useLibrarySummariesStore.getState().getOrParse("/x.logicx");

    expect(mockedStat).toHaveBeenCalledTimes(1);
    expect(mockedParse).not.toHaveBeenCalled();
  });

  it("a successful fresh parse persists to the cache with current stats", async () => {
    const summary = makeSummary({});
    mockedParse.mockResolvedValueOnce(summary);
    mockedStat.mockResolvedValueOnce({ mtime_unix: 555, size_bytes: 1234 });

    await useLibrarySummariesStore.getState().getOrParse("/x.logicx");

    expect(mockedPersist).toHaveBeenCalledWith("/x.logicx", {
      mtime_unix: 555,
      size_bytes: 1234,
      summary,
    });
  });

  // ── lpx-explorer-fz4: idle-gated scan ───────────────────────────────

  it("setScanPaused(true) holds the queue; new getOrParse calls do not reach parseProject", async () => {
    setScanPaused(true);
    const summary = makeSummary({});
    mockedParse.mockResolvedValueOnce(summary);

    void useLibrarySummariesStore.getState().getOrParse("/x.logicx");
    for (let i = 0; i < 10; i += 1) await Promise.resolve();

    expect(mockedParse).not.toHaveBeenCalled();
    expect(queuedParseCount()).toBe(1);
    expect(isScanPaused()).toBe(true);
  });

  it("setScanPaused(false) drains the queue and parses begin", async () => {
    setScanPaused(true);
    const summary = makeSummary({});
    mockedParse.mockResolvedValueOnce(summary);

    const promise = useLibrarySummariesStore
      .getState()
      .getOrParse("/x.logicx");
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
    expect(mockedParse).not.toHaveBeenCalled();

    setScanPaused(false);
    const result = await promise;

    expect(mockedParse).toHaveBeenCalledTimes(1);
    expect(result).toBe(summary);
  });
});
