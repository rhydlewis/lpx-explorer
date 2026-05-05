/**
 * Extract a human-readable project name from a `.logicx` bundle path.
 *
 * Strips a trailing slash if present, takes the last segment, and removes
 * the `.logicx` suffix (case-insensitive).
 */
export function projectNameOf(path: string): string {
  const trimmed = path.endsWith("/") ? path.slice(0, -1) : path;
  const segments = trimmed.split("/").filter(Boolean);
  const last = segments[segments.length - 1] ?? trimmed;
  return last.replace(/\.logicx$/i, "");
}

/**
 * Last path segment of a folder path (without the `.logicx` strip).
 */
export function folderNameOf(path: string): string {
  const trimmed = path.endsWith("/") ? path.slice(0, -1) : path;
  const segments = trimmed.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? trimmed;
}
