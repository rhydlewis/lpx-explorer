import { useUIStore, type ThemeMode } from "../store/ui-store";

const SYSTEM_LIGHT_QUERY = "(prefers-color-scheme: light)";

/**
 * Resolve a `ThemeMode` to the concrete theme that should appear on
 * documentElement. 'system' delegates to `prefers-color-scheme`;
 * explicit modes pass through.
 */
export function resolveTheme(
  mode: ThemeMode,
  systemPrefersLight: boolean,
): "light" | "dark" {
  if (mode === "light") return "light";
  if (mode === "dark") return "dark";
  return systemPrefersLight ? "light" : "dark";
}

/**
 * Mirror the theme store onto `documentElement.dataset.theme` and keep
 * it in sync with both store changes and OS-level appearance changes
 * when the store is in 'system' mode (lpx-explorer-klh). Returns a
 * cleanup thunk that unsubscribes both listeners.
 *
 * Idempotent: applies the current theme on install so the first paint
 * is correct without a flash. Safe to call inside a React effect.
 */
export function installThemeWatcher(): () => void {
  const media = window.matchMedia(SYSTEM_LIGHT_QUERY);
  const apply = (mode: ThemeMode) => {
    const resolved = resolveTheme(mode, media.matches);
    document.documentElement.dataset.theme = resolved;
  };

  // Initial apply.
  apply(useUIStore.getState().theme);

  const unsubscribeStore = useUIStore.subscribe((state, prev) => {
    if (state.theme !== prev.theme) {
      apply(state.theme);
    }
  });

  // OS appearance change — only relevant when the store is in 'system'.
  // We still listen unconditionally; the resolveTheme call ignores
  // matches when the explicit mode is set.
  const onSystemChange = () => {
    if (useUIStore.getState().theme === "system") {
      apply("system");
    }
  };
  media.addEventListener("change", onSystemChange);

  return () => {
    unsubscribeStore();
    media.removeEventListener("change", onSystemChange);
  };
}
