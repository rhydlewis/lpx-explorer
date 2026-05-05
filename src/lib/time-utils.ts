const SECOND = 1;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

/**
 * Human-friendly relative time vs `now`. Picks the coarsest unit that fits
 * (`9 months ago`, not `9 months 12 days ago`) and uses
 * `Intl.RelativeTimeFormat`'s `numeric:'auto'` so single-unit cases read
 * "yesterday" / "last week" / "last month" / "last year" instead of
 * "1 day ago" / "1 week ago" / etc.
 *
 * Future timestamps render with "in" — covers the rare case where a file's
 * mtime drifts ahead of system clock.
 */
export function formatRelative(unix: number, now: Date = new Date()): string {
  const diffSeconds = unix - Math.floor(now.getTime() / 1000);
  const abs = Math.abs(diffSeconds);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  const [value, unit] = pickUnit(diffSeconds, abs);
  return rtf.format(value, unit);
}

type Unit = Intl.RelativeTimeFormatUnit;

function pickUnit(signed: number, abs: number): readonly [number, Unit] {
  if (abs < MINUTE) {
    return [Math.round(signed / SECOND), "second"];
  }
  if (abs < HOUR) {
    return [Math.round(signed / MINUTE), "minute"];
  }
  if (abs < DAY) {
    return [Math.round(signed / HOUR), "hour"];
  }
  if (abs < WEEK) {
    return [Math.round(signed / DAY), "day"];
  }
  if (abs < MONTH) {
    return [Math.round(signed / WEEK), "week"];
  }
  if (abs < YEAR) {
    return [Math.round(signed / MONTH), "month"];
  }
  return [Math.round(signed / YEAR), "year"];
}
