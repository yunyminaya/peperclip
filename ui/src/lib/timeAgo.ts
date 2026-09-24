const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;

export function timeAgo(date: Date | string): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const seconds = Math.round((now - then) / 1000);

  if (seconds < MINUTE) return "ahora mismo";
  if (seconds < HOUR) {
    const m = Math.floor(seconds / MINUTE);
    return `hace ${m} min`;
  }
  if (seconds < DAY) {
    const h = Math.floor(seconds / HOUR);
    return `hace ${h} h`;
  }
  if (seconds < WEEK) {
    const d = Math.floor(seconds / DAY);
    return `hace ${d} d`;
  }
  if (seconds < MONTH) {
    const w = Math.floor(seconds / WEEK);
    return `hace ${w} sem`;
  }
  const mo = Math.floor(seconds / MONTH);
  return `hace ${mo} meses`;
}
