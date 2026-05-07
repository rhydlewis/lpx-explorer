import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import { installDevLogBridge } from "./lib/dev-log";
import "./styles/tokens.css";

// Forward JS errors / unhandled rejections / console.* to the Rust
// process's stderr (the `tauri dev` terminal). Installed BEFORE React
// mounts so bundle-time exceptions surface even when the app never
// paints. No-op when the IPC bridge isn't available (production
// release builds without `tauri dev` will just no-op).
installDevLogBridge();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
