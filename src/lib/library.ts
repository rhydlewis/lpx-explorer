import { Channel, invoke } from "@tauri-apps/api/core";

type ScanEvent =
  | { readonly type: "Project"; readonly path: string }
  | { readonly type: "Done" };

/**
 * Invoke the Rust `scan_folder` Tauri command. Discovered `.logicx`
 * bundles arrive incrementally via the `onProject` callback so callers
 * can render progressively. Resolves when the walk finishes; rejects
 * with a `ScanError` if the folder doesn't exist.
 */
export async function scanFolder(
  path: string,
  onProject: (path: string) => void = () => {
    // default no-op
  },
): Promise<void> {
  const channel = new Channel<ScanEvent>();
  channel.onmessage = (event) => {
    if (event.type === "Project") {
      onProject(event.path);
    }
  };
  await invoke<void>("scan_folder", { path, onEvent: channel });
}
