import { describe, expect, it } from "vitest";

import { formatRelative } from "./time-utils";

const NOW_UNIX = 1777889700; // arbitrary fixed reference for deterministic tests
const now = new Date(NOW_UNIX * 1000);

describe("formatRelative", () => {
  it("renders 'today' for now-ish timestamps", () => {
    expect(formatRelative(NOW_UNIX, now)).toMatch(/today|now|seconds/i);
  });

  it("renders 'yesterday' for ~1 day ago", () => {
    expect(formatRelative(NOW_UNIX - 86400, now)).toBe("yesterday");
  });

  it("renders '5 days ago' for under a week", () => {
    expect(formatRelative(NOW_UNIX - 5 * 86400, now)).toBe("5 days ago");
  });

  it("renders 'last week' for ~7 days ago", () => {
    expect(formatRelative(NOW_UNIX - 7 * 86400, now)).toBe("last week");
  });

  it("renders weeks ago for under a month", () => {
    expect(formatRelative(NOW_UNIX - 14 * 86400, now)).toBe("2 weeks ago");
  });

  it("renders 'last month' for ~30 days ago", () => {
    expect(formatRelative(NOW_UNIX - 30 * 86400, now)).toBe("last month");
  });

  it("renders months ago for under a year", () => {
    expect(formatRelative(NOW_UNIX - 270 * 86400, now)).toBe("9 months ago");
  });

  it("renders 'last year' for ~365 days ago", () => {
    expect(formatRelative(NOW_UNIX - 365 * 86400, now)).toBe("last year");
  });

  it("renders years ago for older timestamps", () => {
    expect(formatRelative(NOW_UNIX - 3 * 365 * 86400, now)).toBe("3 years ago");
  });

  it("supports timestamps in the future", () => {
    expect(formatRelative(NOW_UNIX + 5 * 86400, now)).toBe("in 5 days");
  });
});
