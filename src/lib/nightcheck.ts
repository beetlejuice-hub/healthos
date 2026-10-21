/**
 * The night check (PLAN 52; owner, 21 Oct: "1 good / 2 line"): last night's skin temperature, breathing rate and blood
 * oxygen from the band, each against your own usual — a line under readiness when one is off, the score unchanged. Pure.
 *
 * Why these three: each is steady for one person from night to night, and they move before you feel unwell — skin
 * temperature and breathing rate rose a day or more before symptoms in band studies (Natarajan 2020, Fitbit; Miller 2020,
 * Whoop; Mason 2022, Oura) — and with drinks, a late meal or a hard day. One alone means little; together they mean more.
 *
 *   Usual     the median of the 4 weeks of nights ending a week ago — readiness's window (lib/readiness), so a few
 *             unwell days don't become their own usual. Needs 10 nights.
 *   Off       skin temperature 0.5 °C or more over, breathing 1 a minute or more over, blood oxygen 1.5 points or
 *             more under — and at least 2× your own night-to-night spread, so a restless person isn't flagged for
 *             their ordinary nights. Only that direction: a cool room or slower breathing is no warning.
 *   Spread    the median distance from your usual × 1.48 (an SD that one odd night can't inflate), never under a
 *             band's noise: 0.2 °C, 0.4 a minute, 0.6 points.
 */

import { addDays } from "./time";
import { BASE_DAYS, BASE_MIN, type Readiness } from "./readiness";

export type NightKey = "skin" | "breath" | "spo2";
export type NightDaily = Partial<Record<NightKey, Record<string, number>>>;
export type NightSignal = { id: NightKey; name: string; value: number; usual: number | null; diff: number | null; off: boolean };
export type NightCheck = { day: string; signals: NightSignal[]; off: NightSignal[]; line: string | null };

type Rule = { name: string; short: string; unit: string; dp: number; dir: 1 | -1; min: number; floor: number; ok: (v: number) => boolean };
export const NIGHT: Record<NightKey, Rule> = {
  skin: { name: "Skin temperature", short: "skin", unit: " °C", dp: 1, dir: 1, min: 0.5, floor: 0.2, ok: (v) => v > 25 && v < 42 },
  breath: { name: "Breathing", short: "breathing", unit: "/min", dp: 1, dir: 1, min: 1, floor: 0.4, ok: (v) => v > 4 && v < 40 },
  spo2: { name: "Blood oxygen", short: "blood oxygen", unit: " %", dp: 0, dir: -1, min: 1.5, floor: 0.6, ok: (v) => v > 70 && v <= 100 },
};
const KEYS: NightKey[] = ["skin", "breath", "spo2"];
const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
const fmt = (v: number, dp: number) => (dp ? v.toFixed(dp) : String(Math.round(v)));
const signed = (k: NightKey, d: number) => `${d >= 0 ? "+" : "−"}${fmt(Math.abs(d), NIGHT[k].dp || 1)}${NIGHT[k].unit}`;

/** Your usual for one signal on `day`, and how far it ordinarily wanders; null under 10 nights. */
export function nightUsual(rec: Record<string, number> | undefined, day: string, k: NightKey): { usual: number; spread: number; n: number } | null {
  const from = addDays(day, -7 - BASE_DAYS), to = addDays(day, -7);
  const v = Object.entries(rec ?? {}).filter(([d, x]) => d >= from && d < to && NIGHT[k].ok(x)).map(([, x]) => x);
  if (v.length < BASE_MIN) return null;
  const u = median(v);
  return { usual: u, spread: Math.max(NIGHT[k].floor, 1.4826 * median(v.map((x) => Math.abs(x - u)))), n: v.length };
}

/** One signal in words against its usual: "skin 0.6 °C over your usual", "blood oxygen 1.8 points under your usual". */
export const offWords = (s: NightSignal) =>
  `${NIGHT[s.id].short} ${fmt(Math.abs(s.diff ?? 0), NIGHT[s.id].dp || 1)}${s.id === "spo2" ? " points" : NIGHT[s.id].unit} ${(s.diff ?? 0) >= 0 ? "over" : "under"} your usual`;

/**
 * The night that ended on `day`'s morning. `alsoOff`: the heart's own signs this morning (readiness's HRV or resting heart
 * rate well off), which make two things together — never a line on their own (readiness already says them).
 */
export function nightCheck(day: string, daily: NightDaily, alsoOff: string[] = []): NightCheck {
  const signals: NightSignal[] = [];
  for (const k of KEYS) {
    const v = daily[k]?.[day];
    if (v == null || !NIGHT[k].ok(v)) continue;
    const u = nightUsual(daily[k], day, k), diff = u ? v - u.usual : null;
    const off = !!u && diff != null && NIGHT[k].dir * diff >= Math.max(NIGHT[k].min, 2 * u.spread);
    signals.push({ id: k, name: NIGHT[k].name, value: v, usual: u?.usual ?? null, diff, off });
  }
  const off = signals.filter((s) => s.off);
  if (!off.length) return { day, signals, off, line: null };
  const all = [...off.map(offWords), ...alsoOff], list = all.length > 1 ? `${all.slice(0, -1).join(", ")} and ${all.at(-1)}` : all[0];
  const line = all.length > 1
    ? `Night check: ${list} — together these go with getting ill, or a body still working off drinks or a hard day. Worth taking it easier.`
    : `Night check: ${list}. On its own it also goes with a warm room, drinks or a late meal — worth seeing if it's still there tomorrow.`;
  return { day, signals, off, line };
}

/** Readiness's heart parts that are poor this morning, in words — they count with the night check, never alone. */
export const heartSigns = (r: Pick<Readiness, "parts"> | null): string[] =>
  (r?.parts ?? []).filter((p) => p.zone === "poor" && (p.id === "hrv" || p.id === "rhr")).map((p) => (p.id === "hrv" ? "HRV under your usual" : "resting heart rate over your usual"));

/** The three for one night, short, for the AI's list of nights: "skin +0.2 °C vs usual, breathing 14.6/min, blood oxygen 96 %". */
export function nightBits(day: string, daily: NightDaily): string[] {
  return nightCheck(day, daily).signals.map((s) => (s.id === "skin" && s.diff != null ? `skin temperature ${signed("skin", s.diff)} vs usual`
    : `${NIGHT[s.id].short} ${fmt(s.value, NIGHT[s.id].dp)}${NIGHT[s.id].unit}`));
}

/** For the AI: last night's three against your usual, and the line when there is one. */
export function nightCheckLines(c: NightCheck): string[] {
  if (!c.signals.length) return [];
  const each = c.signals.map((s) => `${s.name} ${fmt(s.value, NIGHT[s.id].dp)}${NIGHT[s.id].unit}${s.usual != null ? ` (usual ${fmt(s.usual, NIGHT[s.id].dp)}, ${signed(s.id, s.diff!)})` : " (usual not known yet)"}${s.off ? " — off" : ""}`);
  return [`Last night from the band: ${each.join("; ")}.`, ...(c.line ? [c.line] : [])];
}
