/**
 * Web-search engines offered for the "Search the web" plug-in action
 * (lpx-explorer-tmo).
 *
 * macOS has no way to ask "what is this user's default search engine".
 * `x-web-search://` — the usual suggestion — is registered by Safari
 * only, is absent entirely on some machines, and bypasses browser
 * routers like Finicky, so it would ignore the user's actual browser
 * choice rather than honour it. A stored preference is the one approach
 * that works regardless of which browser opens the URL.
 *
 * `tauri-plugin-opener::openUrl` already hands the URL to the system,
 * so the *browser* half was never the problem — only the engine.
 */
export interface SearchEngine {
  readonly id: SearchEngineId;
  readonly label: string;
  /** Query URL up to and including the `q=`; the term is appended encoded. */
  readonly queryPrefix: string;
}

export type SearchEngineId =
  | "google"
  | "duckduckgo"
  | "bing"
  | "kagi"
  | "brave"
  | "ecosia";

export const SEARCH_ENGINES: ReadonlyArray<SearchEngine> = [
  { id: "google", label: "Google", queryPrefix: "https://www.google.com/search?q=" },
  { id: "duckduckgo", label: "DuckDuckGo", queryPrefix: "https://duckduckgo.com/?q=" },
  { id: "bing", label: "Bing", queryPrefix: "https://www.bing.com/search?q=" },
  { id: "kagi", label: "Kagi", queryPrefix: "https://kagi.com/search?q=" },
  { id: "brave", label: "Brave", queryPrefix: "https://search.brave.com/search?q=" },
  { id: "ecosia", label: "Ecosia", queryPrefix: "https://www.ecosia.org/search?q=" },
];

/**
 * Status-quo default. Changing a user's search engine without being
 * asked would be its own kind of rude — the picker is the fix, not a
 * silent switch.
 */
export const DEFAULT_SEARCH_ENGINE: SearchEngineId = "google";

export function isSearchEngineId(value: unknown): value is SearchEngineId {
  return (
    typeof value === "string" &&
    SEARCH_ENGINES.some((engine) => engine.id === value)
  );
}

/**
 * Query URL for `term` on `engineId`. Unknown ids fall back to the
 * default rather than throwing — a preference written by a future build
 * and read by an older one must degrade, not break the action.
 */
export function searchUrlFor(engineId: SearchEngineId, term: string): string {
  const engine =
    SEARCH_ENGINES.find((e) => e.id === engineId) ??
    SEARCH_ENGINES.find((e) => e.id === DEFAULT_SEARCH_ENGINE);
  return `${engine?.queryPrefix ?? ""}${encodeURIComponent(term)}`;
}
