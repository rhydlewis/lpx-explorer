import { create } from "zustand";

/** Plug-in rail chip filter — narrows the project's deduped plug-in list. */
export type PluginRailChip = "all" | "installed" | "missing" | "duplicated";

/**
 * `<PluginRail />` scope. `'project'` shows the currently-loaded
 * project's plug-ins (the original behaviour); `'library'` rolls up
 * every plug-in across `useLibraryStore.recent` + every project under
 * `useLibraryStore.folders`. Per lpx-explorer-185.
 */
export type PluginRailScope = "project" | "library";

export interface UIState {
  railVisible: boolean;
  setRailVisible: (visible: boolean) => void;
  toggleRail: () => void;
  /**
   * When true, `<TrackList>` renders routing kinds (master/output/bus/aux/
   * input) alongside user-visible tracks. Default false: most users care
   * about audio + instrument + folder + summing-stack only. In-session
   * state — does not persist across launches (per the v1 persistence
   * decision; revisit when bead `lpx-explorer-nxt` lands).
   */
  pluginChainsShowAll: boolean;
  setPluginChainsShowAll: (showAll: boolean) => void;
  togglePluginChainsShowAll: () => void;
  /** Text filter on the right-rail plug-in list (substring, case-insensitive). */
  pluginRailFilter: string;
  setPluginRailFilter: (q: string) => void;
  /** Chip filter on the right-rail plug-in list. */
  pluginRailChip: PluginRailChip;
  setPluginRailChip: (chip: PluginRailChip) => void;
  /** Per-project vs library-wide scope on the right-rail plug-in list. */
  pluginRailScope: PluginRailScope;
  setPluginRailScope: (scope: PluginRailScope) => void;
  /**
   * Bump-counter the Compatibility pill increments to ask the rail to
   * scroll/highlight its first missing plug-in. PluginRail subscribes
   * via useEffect on this nonce. (Counter rather than boolean because
   * back-to-back clicks need to fire the effect each time.)
   */
  pluginRailJumpToMissingNonce: number;
  requestJumpToMissing: () => void;
  /**
   * In-session toggle for the right rail visibility at narrow window
   * widths. Above the breakpoint the rail is always visible; below it,
   * this controls whether the rail (and its topbar toggle button shows
   * it) is shown. Defaults closed so narrow first launches don't paint
   * a rail-over-main collision.
   */
  pluginRailOpen: boolean;
  setPluginRailOpen: (open: boolean) => void;
  togglePluginRailOpen: () => void;
  /**
   * Project-level expand/collapse for all TrackRow disclosure widgets.
   * `tracksAllExpanded` is the headline state (drives the toggle label);
   * `tracksExpansionNonce` increments on each request so TrackRow's
   * useEffect fires even when the value didn't change. Same pattern as
   * `pluginRailJumpToMissingNonce`.
   */
  tracksAllExpanded: boolean;
  tracksExpansionNonce: number;
  expandAllTracks: () => void;
  collapseAllTracks: () => void;
  toggleAllTracks: () => void;
  /**
   * App-wide text zoom multiplier. 1.0 is default; clamped to
   * [TEXT_ZOOM_MIN, TEXT_ZOOM_MAX] so users can't shrink the UI past
   * legibility or balloon it past the layout's tolerance. Persisted
   * across launches via `lib/persistence.ts`.
   */
  textZoom: number;
  setTextZoom: (z: number) => void;
  bumpTextZoom: (delta: number) => void;
  resetTextZoom: () => void;
}

export const TEXT_ZOOM_MIN = 0.75;
export const TEXT_ZOOM_MAX = 2.0;
export const TEXT_ZOOM_STEP = 0.1;
export const TEXT_ZOOM_DEFAULT = 1.0;

function clampZoom(z: number): number {
  if (Number.isNaN(z)) return TEXT_ZOOM_DEFAULT;
  return Math.min(TEXT_ZOOM_MAX, Math.max(TEXT_ZOOM_MIN, z));
}

export const useUIStore = create<UIState>((set) => ({
  railVisible: false,
  setRailVisible: (visible: boolean) => set({ railVisible: visible }),
  toggleRail: () => set((s) => ({ railVisible: !s.railVisible })),
  pluginChainsShowAll: false,
  setPluginChainsShowAll: (showAll: boolean) =>
    set({ pluginChainsShowAll: showAll }),
  togglePluginChainsShowAll: () =>
    set((s) => ({ pluginChainsShowAll: !s.pluginChainsShowAll })),
  pluginRailFilter: "",
  setPluginRailFilter: (q: string) => set({ pluginRailFilter: q }),
  pluginRailChip: "all",
  setPluginRailChip: (chip: PluginRailChip) => set({ pluginRailChip: chip }),
  pluginRailScope: "project",
  setPluginRailScope: (scope: PluginRailScope) => set({ pluginRailScope: scope }),
  pluginRailJumpToMissingNonce: 0,
  requestJumpToMissing: () =>
    set((s) => ({
      // Bump a nonce — PluginRail subscribes and scrolls/highlights its
      // first 'missing' row each time it changes. Also force-reset the
      // chip + filter so the missing row is in fact visible.
      pluginRailJumpToMissingNonce: s.pluginRailJumpToMissingNonce + 1,
      pluginRailChip: "missing",
      pluginRailFilter: "",
      // If the rail is closed at narrow width, open it so the user can
      // see the row we just scrolled to.
      pluginRailOpen: true,
    })),
  pluginRailOpen: false,
  setPluginRailOpen: (open: boolean) => set({ pluginRailOpen: open }),
  togglePluginRailOpen: () =>
    set((s) => ({ pluginRailOpen: !s.pluginRailOpen })),
  tracksAllExpanded: false,
  tracksExpansionNonce: 0,
  expandAllTracks: () =>
    set((s) => ({
      tracksAllExpanded: true,
      tracksExpansionNonce: s.tracksExpansionNonce + 1,
    })),
  collapseAllTracks: () =>
    set((s) => ({
      tracksAllExpanded: false,
      tracksExpansionNonce: s.tracksExpansionNonce + 1,
    })),
  toggleAllTracks: () =>
    set((s) => ({
      tracksAllExpanded: !s.tracksAllExpanded,
      tracksExpansionNonce: s.tracksExpansionNonce + 1,
    })),
  textZoom: TEXT_ZOOM_DEFAULT,
  setTextZoom: (z: number) => set({ textZoom: clampZoom(z) }),
  bumpTextZoom: (delta: number) =>
    set((s) => ({ textZoom: clampZoom(s.textZoom + delta) })),
  resetTextZoom: () => set({ textZoom: TEXT_ZOOM_DEFAULT }),
}));
