/**
 * Roving-focus helper for the library rail. Up/Down arrows move focus
 * between elements marked with `data-rail-row="true"`. Home/End jump to
 * first/last. Other keys fall through.
 */

const NAV_KEYS = new Set(["ArrowUp", "ArrowDown", "Home", "End"]);

function nextIndexFor(
  key: string,
  currentIdx: number,
  total: number,
): number {
  if (key === "Home") {
    return 0;
  }
  if (key === "End") {
    return total - 1;
  }
  if (key === "ArrowDown") {
    return currentIdx === -1 ? 0 : Math.min(total - 1, currentIdx + 1);
  }
  // ArrowUp
  return currentIdx === -1 ? 0 : Math.max(0, currentIdx - 1);
}

export function handleRailKeyDown(
  event: KeyboardEvent | React.KeyboardEvent,
): void {
  if (!NAV_KEYS.has(event.key)) {
    return;
  }
  const target = event.target as HTMLElement | null;
  const container = event.currentTarget as HTMLElement | null;
  if (target === null || container === null) {
    return;
  }
  if (!target.dataset.railRow) {
    return;
  }

  const rows = Array.from(
    container.querySelectorAll<HTMLElement>('[data-rail-row="true"]'),
  );
  if (rows.length === 0) {
    return;
  }

  const currentIdx = rows.indexOf(target);
  const nextIdx = nextIndexFor(event.key, currentIdx, rows.length);
  if (nextIdx === currentIdx) {
    return;
  }

  // nextIdx is bounded to [0, rows.length - 1] by nextIndexFor, so the
  // element exists. TS doesn't have noUncheckedIndexedAccess, so the
  // type is HTMLElement (not HTMLElement | undefined).
  rows[nextIdx].focus();
  event.preventDefault();
}
