export type DropAction =
  | { readonly kind: "open-project"; readonly path: string }
  | { readonly kind: "open-folder"; readonly path: string }
  | { readonly kind: "unsupported"; readonly reason: string };

/**
 * Decide what to do with one or more file/folder paths dropped onto
 * the window.
 *
 *   - `.logicx` (case-insensitive)        → `open-project`
 *   - any other path that is a directory  → `open-folder`
 *   - everything else                     → `unsupported`
 *
 * `isDir` is asynchronous because it usually delegates to a Tauri
 * command. Tests can pass a mock `(path) => Promise<boolean>`.
 */
export async function routeDrop(
  paths: readonly string[],
  isDir: (path: string) => Promise<boolean>,
): Promise<DropAction> {
  if (paths.length === 0) {
    return { kind: "unsupported", reason: "Nothing to open." };
  }
  if (paths.length > 1) {
    return {
      kind: "unsupported",
      reason: "Drop one project or folder at a time.",
    };
  }

  const raw = paths[0]!;
  const path = raw.endsWith("/") ? raw.slice(0, -1) : raw;

  if (path.toLowerCase().endsWith(".logicx")) {
    return { kind: "open-project", path };
  }

  if (await isDir(path)) {
    return { kind: "open-folder", path };
  }

  return {
    kind: "unsupported",
    reason: "Drop a .logicx project or a folder of projects.",
  };
}
