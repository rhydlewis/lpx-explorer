import { describe, expect, it } from "vitest";

import {
  DEFAULT_SEARCH_ENGINE,
  SEARCH_ENGINES,
  isSearchEngineId,
  searchUrlFor,
  type SearchEngineId,
} from "./search-engines";

describe("searchUrlFor", () => {
  it("builds a Google query", () => {
    expect(searchUrlFor("google", "EchoBoy")).toBe(
      "https://www.google.com/search?q=EchoBoy",
    );
  });

  it("builds a DuckDuckGo query", () => {
    expect(searchUrlFor("duckduckgo", "EchoBoy")).toBe(
      "https://duckduckgo.com/?q=EchoBoy",
    );
  });

  it("percent-encodes spaces and punctuation", () => {
    // Plug-in names are full of these: 'CLA Bass (m->s)', 'kHs 3-Band EQ'.
    expect(searchUrlFor("google", "CLA Bass (m->s)")).toBe(
      "https://www.google.com/search?q=CLA%20Bass%20(m-%3Es)",
    );
  });

  it("encodes an ampersand so it cannot inject a second query param", () => {
    const url = searchUrlFor("google", "Waves & Co");

    expect(url).toBe("https://www.google.com/search?q=Waves%20%26%20Co");
    expect(url.split("?")[1]?.split("&")).toHaveLength(1);
  });

  it("covers every engine in the picker with a usable https URL", () => {
    for (const engine of SEARCH_ENGINES) {
      const url = searchUrlFor(engine.id, "Phase Plant");

      expect(url.startsWith("https://"), `${engine.id} must be https`).toBe(true);
      expect(url).toContain("Phase%20Plant");
    }
  });

  it("falls back to the default engine for an unrecognised id", () => {
    // A preference file hand-edited or written by an older build must not
    // strand the action with a broken URL.
    const rogue = "askjeeves" as SearchEngineId;

    expect(searchUrlFor(rogue, "EchoBoy")).toBe(
      searchUrlFor(DEFAULT_SEARCH_ENGINE, "EchoBoy"),
    );
  });
});

describe("isSearchEngineId", () => {
  it("accepts every id offered in the picker", () => {
    for (const engine of SEARCH_ENGINES) {
      expect(isSearchEngineId(engine.id)).toBe(true);
    }
  });

  it("rejects unknown values and non-strings", () => {
    expect(isSearchEngineId("askjeeves")).toBe(false);
    expect(isSearchEngineId(null)).toBe(false);
    expect(isSearchEngineId(42)).toBe(false);
  });
});
