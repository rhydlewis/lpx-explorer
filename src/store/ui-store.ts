import { create } from "zustand";

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
}));
