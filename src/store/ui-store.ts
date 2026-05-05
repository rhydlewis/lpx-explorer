import { create } from "zustand";

export interface UIState {
  railVisible: boolean;
  setRailVisible: (visible: boolean) => void;
  toggleRail: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  railVisible: false,
  setRailVisible: (visible: boolean) => set({ railVisible: visible }),
  toggleRail: () => set((s) => ({ railVisible: !s.railVisible })),
}));
