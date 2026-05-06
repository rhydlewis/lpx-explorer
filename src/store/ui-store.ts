import { create } from "zustand";

/** Plug-in rail chip filter — narrows the project's deduped plug-in list. */
export type PluginRailChip = "all" | "installed" | "missing" | "duplicated";

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
}));
