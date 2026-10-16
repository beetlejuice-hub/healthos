/**
 * How ready you are today, out of 100 (owner, 14 Oct: "also readiness score?? can check net for reference"). Pure. Built the
 * way Oura's Readiness, Fitbit's Daily Readiness and Whoop's Recovery are — this morning's heart against your own recent
 * normal, last night and the week's sleep, recent load — with each part shown, its points and why:
 *
 *   HRV this morning 20   against 4 weeks of mornings ending a week ago, on the log scale HRV research uses: full down to
 *                         half an SD under your usual (smaller changes are noise — the "smallest worthwhile change" of
 *                         HRV-guided training), none 2 SD under (the SD never under ±5 %, a band's day-to-day noise).
 *   HRV this week 10      the 7-day average against the same 4 weeks (the HRV-guided-training way: Plews; Kiviniemi):
 *                         full within half an SD below, none 1.5 SD below.
 *   Resting HR 20         this morning's against the same 4 weeks: full up to half an SD over your usual, none 2 SD over
 *                         (the SD never under 2 bpm: +1 costs nothing, +4 all of it).
 *   Last night 25         the sleep score (lib/sleepscore), as it stands.
 *   Sleep this week 15    the last 7 nights' average asleep: full from 7 h, none at 5 h.
 *   Training 10           working sets in the last 2 days against your usual 2 days (the last 4 weeks): full up to a
 *                         quarter over, none at two and a half times. Kept small, and no injury talk — the "acute to
 *                         chronic load" ratio behind such numbers is disputed (Impellizzeri 2020).
 *
 * The heart parts need 10 mornings in the 4 weeks (Oura takes about 2 weeks to learn you); a part that isn't known is left
 * out, named, and the rest scaled to 100. Words as Oura's bands: 85+ ready, 70+ good, 60+ fair, under that "take it easier".
 *
 * Weakest link (owner, 15 Oct: "Charge6 app says 16 readiness … after drinking a bottle of wine … it days readiness 68 and
 * doesn't highlight eniugh that i slept poorly"): added up, a week of good sleep and easy training made up for a heart
 * still working off the night. The way Whoop's Recovery is mostly HRV, the heart sets how high it can go — at most
 * 20 + 90 × the heart parts' share (both gone: 20; one gone: 65; nothing off past 90 % of each: no cap) — and so does last
 * night, at most 20 + 0.9 × its score (a 50 night: 65; 89 and up: no cap). The parts still show what they add to; the
 * cap is said with its reason.
 *
 * Short nights (owner, 16 Oct: "still dont know why readiness is so high every day even when wrecked sleep"): a 5-hour night
 * with the heart as usual added to 79, "good" — the heart's usual is your own recent weeks (a run of short nights is
 * "usual"), and a 5 h night still scores 66 for sleep (it was otherwise calm). One short night costs attention and mood
 * however calm the heart is (Lim & Dinges 2010, Van Dongen 2003), so the hours asleep cap it too: 7 h and up nothing,
 * 6 h 75, 5 h 55, 4 h 35, 3 h 20 (straight lines between).
 */

import type { Night } from "./sleep";
import { sleepScore, NEED_H } from "./sleepscore";
import { addDays, DAY } from "./time";

export type RPart = { id: "hrv" | "hrv7" | "rhr" | "sleep" | "balance" | "load"; name: string; got: number; max: number; why: string; zone: "ideal" | "fair" | "poor" };
export type Readiness = {
  score: number; parts: RPart[]; left: { id: RPart["id"]; name: string; max: number }[]; word: string; day: string;
  /** What the parts add to, and the cap that held it lower, with why (null when nothing did). */
  added: number; cap: { to: number; why: string } | null; sleep: number;
  /** Last night's minutes asleep. */
  asleep: number;
};

export const BASE_DAYS = 28, BASE_MIN = 10;
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
const sd = (v: number[]) => { const m = mean(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / Math.max(1, v.length - 1)); };
const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
const hm = (min: number) => `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, "0")}`;
const ok = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);

/** How high readiness can go after this many minutes asleep (100: no cap). */
export function shortNightCap(asleepMin: number): number {
  const h = asleepMin / 60, pts: [number, number][] = [[3, 20], [4, 35], [5, 55], [6, 75], [7, 100]];
  if (h >= 7) return 100;
  if (h <= 3) return Math.max(10, 20 - 10 * (3 - h));
  const i = pts.findIndex(([x]) => x > h), [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
  return y0 + ((h - x0) / (x1 - x0)) * (y1 - y0);
}

export const readyWord = (s: number) => (s >= 85 ? "ready" : s >= 70 ? "good" : s >= 60 ? "fair" : "take it easier");

/**
 * Today's readiness: `ns` the band's nights (today's is the one whose morning is `day`), `rating` this morning's sleep
 * rating, `sets` your logged sets, `now` for the last 2 days. Null when the band has no night for today yet.
 */
export function readiness(day: string, ns: Night[], rating: number | null | undefined, sets: { at: number; warmup?: boolean }[], now: number, daily: { hrv: Record<string, number>; rhr: Record<string, number> }): Readiness | null {
  const n = ns.find((x) => x.day === day);
  if (!n) return null;
  const parts: RPart[] = [], left: Readiness["left"] = [];
  const part = (id: RPart["id"], name: string, max: number, frac: number | null, why: string) => {
    if (frac == null || !Number.isFinite(frac)) left.push({ id, name, max });
    else parts.push({ id, name, max, got: Math.round(max * clamp(frac) * 10) / 10, why, zone: frac >= 0.8 ? "ideal" : frac >= 0.6 ? "fair" : "poor" });
  };
  // your normal: 4 weeks of mornings ending a week ago — a dip lasting days shouldn't become its own usual (the way Oura
  // sets a recent 2 weeks against a longer stretch). From the band's daily values, which come for every day, not from the
  // nights held (Today holds a week of them — found in the e2e).
  const inBase = (d: string) => d < addDays(day, -7) && d >= addDays(day, -7 - BASE_DAYS);
  const pick = (rec: Record<string, number>) => Object.entries(rec).filter(([d, v]) => inBase(d) && ok(v)).map(([, v]) => v);
  const hrvs = pick(daily.hrv).filter((v) => v > 0), rhrs = pick(daily.rhr);
  const hrvToday = daily.hrv[day] ?? n.hrv, rhrToday = daily.rhr[day] ?? n.rhr;
  const lnH = hrvs.map(Math.log), mH = lnH.length >= BASE_MIN ? mean(lnH) : null, sH = lnH.length >= BASE_MIN ? Math.max(0.05, sd(lnH)) : null; // floors: ±5 % HRV, ±2 bpm, a band's day-to-day noise
  const usualH = mH == null ? null : Math.exp(mH);
  part("hrv", "HRV this morning", 20, ok(hrvToday) && hrvToday > 0 && mH != null && sH != null ? 1 - Math.max(0, -(Math.log(hrvToday) - mH) / sH - 0.5) / 1.5 : null,
    ok(hrvToday) && usualH != null ? `${Math.round(hrvToday)} ms · usual ${Math.round(usualH)}` : "");
  const week = Object.entries(daily.hrv).filter(([d, v]) => d <= day && d > addDays(day, -7) && ok(v) && v > 0).map(([, v]) => v);
  const z7 = week.length >= 4 && mH != null && sH != null ? (mean(week.map(Math.log)) - mH) / sH : null;
  part("hrv7", "HRV this week", 10, z7 == null ? null : 1 - Math.max(0, -z7 - 0.5), z7 == null ? "" : `7-day average ${Math.round(Math.exp(mean(week.map(Math.log))))} ms · usual ${Math.round(usualH!)}`);
  const mR = rhrs.length >= BASE_MIN ? mean(rhrs) : null, sR = rhrs.length >= BASE_MIN ? Math.max(2, sd(rhrs)) : null;
  part("rhr", "Resting HR", 20, ok(rhrToday) && mR != null && sR != null ? 1 - Math.max(0, (rhrToday - mR) / sR - 0.5) / 1.5 : null,
    ok(rhrToday) && mR != null ? `${Math.round(rhrToday)} bpm · usual ${Math.round(mR)}` : "");
  const sc = sleepScore(n, rating, ns);
  // the hours first: they're what a short night is (16 Oct)
  part("sleep", "Last night", 25, sc.score / 100, `${ok(n.asleep) ? `${hm(n.asleep)} asleep · ` : ""}sleep score ${sc.score}${sc.left.some((l) => l.id === "rating") ? " (not rated yet)" : ""}`);
  const last7 = ns.filter((x) => x.day <= day && x.day > addDays(day, -7)).map((x) => x.asleep).filter(ok);
  part("balance", "Sleep this week", 15, last7.length >= 4 ? (mean(last7) / 60 - 5) / (NEED_H - 5) : null, last7.length >= 4 ? `${hm(mean(last7))} a night, ${last7.length} nights` : "");
  // training: working sets in the 2 days before now, against the same 2-day window on each of the 4 weeks' days
  const work = sets.filter((s) => !s.warmup), in2 = (t: number) => work.filter((s) => s.at > t - 2 * DAY && s.at <= t).length;
  const before = work.filter((s) => s.at <= now - 2 * DAY && s.at > now - (BASE_DAYS + 2) * DAY).length;
  const usual2 = median(Array.from({ length: BASE_DAYS }, (_, k) => in2(now - (k + 1) * DAY)));
  const cur = in2(now);
  part("load", "Training", 10, before === 0 ? null : cur === 0 ? 1 : 1 - Math.max(0, cur / Math.max(usual2, 3) - 1.25) / 1.25,
    before === 0 ? "" : `${cur} working sets in 2 days · usual ${Math.round(usual2)}`);
  const got = parts.reduce((a, p) => a + p.got, 0), max = parts.reduce((a, p) => a + p.max, 0);
  const added = max ? (got / max) * 100 : 0;
  // the weakest link: the heart and last night each set how high it can go
  const share = (id: RPart["id"]) => { const p = parts.find((x) => x.id === id); return p ? p.got / p.max : null; };
  const h = share("hrv"), r = share("rhr"), heart = [h, r].filter(ok);
  const caps: { to: number; why: string }[] = [{ to: 20 + 0.9 * sc.score, why: `${sc.score < 60 ? "a poor night" : "last night"} — sleep score ${sc.score}` }];
  if (ok(n.asleep) && n.asleep < 7 * 60) caps.push({ to: shortNightCap(n.asleep), why: `${hm(n.asleep)} asleep — a short night costs focus and mood however calm the heart is` });
  const well = (f: number | null) => (f != null && f < 0.5 ? "well " : "");
  if (heart.length) caps.push({ to: 20 + 90 * mean(heart), why: h != null && r != null && h < 0.5 && r < 0.5 ? "HRV and resting heart rate both well off your usual"
    : (h ?? 1) <= (r ?? 1) ? `HRV ${well(h)}under your usual` : `resting heart rate ${well(r)}over your usual` });
  const cap = caps.reduce((a, c) => (c.to < a.to ? c : a));
  const score = Math.round(Math.min(added, cap.to));
  return { score, parts, left, word: readyWord(score), day, added: Math.round(added), cap: cap.to < added && Math.round(cap.to) < Math.round(added) ? { to: Math.round(cap.to), why: cap.why } : null, sleep: sc.score, asleep: n.asleep };
}

