/** Local-time helpers. Days are local `YYYY-MM-DD`, never `toISOString()` (that's UTC). */

export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

const pad = (n: number) => String(n).padStart(2, "0");

export function localDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local midnight of the day `ms` falls on. */
export function startOfDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** A local day plus a clock time (minutes from midnight) → epoch ms. */
export function atMinute(day: string, minute: number): number {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d, 0, minute).getTime();
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return localDay(new Date(y, m - 1, d + n).getTime());
}

/** 14:05 */
export function clock(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function minuteOfDay(ms: number): number {
  const d = new Date(ms);
  return d.getHours() * 60 + d.getMinutes();
}

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Tue 29 Sep" */
export function dayLabel(ms: number): string {
  const d = new Date(ms);
  return `${WD[d.getDay()]} ${d.getDate()} ${MO[d.getMonth()]}`;
}

/** Down to the quarter hour, local: a time to say to a person ("before 14:00", not "before 14:01"). */
export function quarterDown(ms: number): number {
  const d = new Date(ms);
  d.setMinutes(Math.floor(d.getMinutes() / 15) * 15, 0, 0);
  return d.getTime();
}

/** When something was, said from `now`: "14:05" today, else "yesterday 14:05", else "Tue 29 Sep 14:05". */
export function stamp(at: number, now: number): string {
  const d = localDay(at), today = localDay(now);
  return d === today ? clock(at) : d === addDays(today, -1) ? `yesterday ${clock(at)}` : `${dayLabel(at)} ${clock(at)}`;
}
