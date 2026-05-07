import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
  // Pre-bundle deps that emit hundreds of small modules. lucide-react
  // is the offender on cold start: every icon is a separate module, so
  // without this hint vite makes a fetch-per-icon and the webview
  // sits dark for 15s+ while the bundle resolves
  // (lpx-explorer triage 2026-05-08). Pinning these tells vite to
  // bundle them once with esbuild and serve a single chunk.
  optimizeDeps: {
    include: [
      "lucide-react",
      "react",
      "react-dom",
      "react-dom/client",
      "zustand",
      "@tauri-apps/api/core",
      "@tauri-apps/api/event",
      "@tauri-apps/api/webview",
      "@tauri-apps/plugin-dialog",
      "@tauri-apps/plugin-opener",
      "@tauri-apps/plugin-store",
    ],
  },
}));
