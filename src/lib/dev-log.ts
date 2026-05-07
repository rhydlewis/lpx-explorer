import { invoke } from "@tauri-apps/api/core";

/**
 * Forward a structured log line to the Rust process's stderr (the
 * `tauri dev` terminal). Tauri's webview has its own console that
 * lives in Web Inspector — when the renderer is hung or never paints
 * we can't easily reach those logs, so this bridge gets the message
 * out via IPC instead. Fire-and-forget; failures are swallowed because
 * the only purpose of this function is diagnostic.
 */
export function devLog(level: "info" | "warn" | "error", message: string): void {
  void invoke("log_event", { level, message }).catch(() => {
    // intentionally swallow — the terminal is just a diagnostic surface
  });
}

let installed = false;

/**
 * Install global handlers that forward unhandled errors and promise
 * rejections to the dev terminal. Idempotent. Call once at app start
 * BEFORE rendering — that way bundle-time exceptions surface even when
 * React never paints.
 */
export function installDevLogBridge(): void {
  if (installed) return;
  installed = true;

  window.addEventListener("error", (event) => {
    const msg = event.error instanceof Error
      ? `${event.error.name}: ${event.error.message}\n${event.error.stack ?? ""}`
      : `window.onerror: ${event.message} @ ${event.filename}:${event.lineno}:${event.colno}`;
    devLog("error", msg);
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const msg = reason instanceof Error
      ? `unhandledrejection: ${reason.name}: ${reason.message}\n${reason.stack ?? ""}`
      : `unhandledrejection: ${String(reason)}`;
    devLog("error", msg);
  });

  // Mirror the existing console.error/warn calls so anything we already
  // log via console reaches the terminal too. Keep the originals so the
  // Web Inspector still shows them.
  const originalError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    devLog("error", args.map(formatArg).join(" "));
    originalError(...args);
  };
  const originalWarn = console.warn.bind(console);
  console.warn = (...args: unknown[]) => {
    devLog("warn", args.map(formatArg).join(" "));
    originalWarn(...args);
  };
  const originalInfo = console.info.bind(console);
  console.info = (...args: unknown[]) => {
    devLog("info", args.map(formatArg).join(" "));
    originalInfo(...args);
  };

  devLog("info", "[bridge] installed");
}

function formatArg(arg: unknown): string {
  if (arg instanceof Error) {
    return `${arg.name}: ${arg.message}\n${arg.stack ?? ""}`;
  }
  if (typeof arg === "object" && arg !== null) {
    try {
      return JSON.stringify(arg);
    } catch {
      return String(arg);
    }
  }
  return String(arg);
}
