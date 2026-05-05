export type DropAction =
  | { readonly kind: "open-project"; readonly path: string }
  | { readonly kind: "unsupported"; readonly reason: string };

/**
 * Decide what to do with a set of file/folder paths dropped onto the window.
 *
 * Walking-skeleton scope (Epic A): only single `.logicx` drops are routed.
 * Folder drops are deferred until Epic D adds the library store; this
 * function returns an `unsupported` action with an explanatory reason in the
 * meantime.
 */
export function routeDrop(paths: readonly string[]): DropAction {
  if (paths.length === 0) {
    return { kind: "unsupported", reason: "Nothing to open." };
  }
  if (paths.length > 1) {
    return { kind: "unsupported", reason: "Drop one project at a time." };
  }

  const raw = paths[0]!;
  const path = raw.endsWith("/") ? raw.slice(0, -1) : raw;

  if (!path.toLowerCase().endsWith(".logicx")) {
    return {
      kind: "unsupported",
      reason: "Only .logicx project bundles are supported.",
    };
  }

  return { kind: "open-project", path };
}
