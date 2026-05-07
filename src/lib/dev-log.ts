import { invoke } from "@tauri-apps/api/core";

/**
 * JS-side reference time. Captured at module load; every devLog
 * message includes the elapsed-ms-since-load so we can distinguish
 * 'JS reached this line at t' from 'Rust printed it at u' (the
 * difference is IPC bridge latency).
 */
const JS_START = (() => {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
})();

function jsElapsedMs(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return Math.round(performance.now() - JS_START);
  }
  return Math.round(Date.now() - JS_START);
}

/**
 * Forward a structured log line to the Rust process's stderr (the
 * `tauri dev` terminal). Tauri's webview has its own console that
 * lives in Web Inspector — when the renderer is hung or never paints
 * we can't easily reach those logs, so this bridge gets the message
 * out via IPC instead. Fire-and-forget; failures are swallowed because
 * the only purpose of this function is diagnostic.
 *
 * The message is prefixed with `[js+Nms]` (elapsed since JS module
 * load); the Rust side adds its own `[+Nms]` (elapsed since process
 * start). Two timestamps make IPC latency visible.
 */
export function devLog(level: "info" | "warn" | "error", message: string): void {
  const stamped = `[js+${jsElapsedMs()}ms] ${message}`;
  void invoke("log_event", { level, message: stamped }).catch(() => {
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
