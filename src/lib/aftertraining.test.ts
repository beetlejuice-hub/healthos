import { describe, expect, it } from "vitest";
import { AFTER_FACTORS, AFTER_OUTCOMES, afterDays, heavyFlags, HEAVY_NEED, recovery, trainingWeeks, weeksLink, type AfterDay } from "./aftertraining";
import { goesWith, type Night } from "./sleep";
import type { Session } from "./liftstrength";
import type { HrMinute } from "./band";
import { rng } from "./bench";
import { localDay } from "./time";
import type { Entry } from "./types";

const D = 86_400_000, H = 3_600_000, MIN = 60_000;
const BASE: Record<string, number> = { Push: 9000, Pull: 11000, Legs: 14000 };
const at = (k: number, h = 0) => new Date(2026, 6, 20 + k).getTime() + h * H; // day k from Mon 20 Jul, local

/**
 * 12 weeks: Push / Pull / Legs on Mon, Wed, Fri and some Saturdays, mornings or from 18:00, kg lifted rising 0.6 % a week
 * with ±10 % session to session; the band's night after every day; two check-ins a day. Planted on request:
 *  - hrv: a heavy session (more kg than that template's usual) → that night's HRV −6 ms (the board's planted effect);
 *  - weeks: a week's energy rises 0.15 per 1,000 kg lifted that week;
 *  - back: minutes back to usual after a session fall 1 a week (38 → 27), else ~32 ± 3 throughout (needs `hr`). The board's
 *    0.6 a week came out at p ≈ 0.02 here: a reading every minute, ±1 bpm, puts ±4 min on each session's number.
 *  - drift: everyday heart rate falls 0.5 bpm a week (getting fitter), recovery unchanged.
 */
function world(seed: number, plant: { hrv?: boolean; weeks?: boolean; back?: boolean; drift?: boolean } = {}, withHr = false) {
  const { r, g } = rng(seed), ss: Session[] = [], entries: Entry[] = [], ns: Night[] = [], backOf = new Map<string, number>();
  let n = 0;
  for (let k = 0; k < 84; k++) {
    const dow = new Date(at(k)).getDay(), wk = Math.floor(k / 7);
    if (!(dow === 1 || dow === 3 || dow === 5 || (dow === 6 && r() < 0.35))) continue;
    const tpl = ["Push", "Pull", "Legs"][n++ % 3], late = r() < 0.5, start = at(k, late ? 18 + r() : 8 + r()), id = `w${k}`;
    ss.push({ id, template: tpl, startedAt: start, endedAt: start + H, sets: [], volume: BASE[tpl] * (1 + 0.006 * wk) * (1 + 0.1 * g()), workingSets: 12, pct: null, lifts: [] });
    backOf.set(id, plant.back ? 38 - wk + g() : 32 + 3 * g());
  }
  const heavy = heavyFlags(ss), heavyDays = new Set(ss.filter((_, i) => heavy[i]).map((s) => localDay(s.startedAt)));
  const weeks = trainingWeeks(ss, [], at(84)), mkg = weeks.reduce((a, w) => a + w.kg, 0) / weeks.length;
  for (let k = 0; k < 84; k++) {
    const eve = localDay(at(k)), bed = at(k, 23), wkKg = weeks[Math.floor(k / 7)].kg;
    ns.push({ id: `n${k}`, day: localDay(at(k + 1)), eve, bed, up: bed + 8 * H, onset: bed + 12 * MIN, wake: bed + 7.8 * H, asleep: 420 + 40 * g(), deep: 75 + 10 * g(), rem: 90, light: 220, awake: 15, wakes: 2, latency: 12,
      stages: [], low: 50, lowAt: null, hrv: 46 + 3.5 * g() - (plant.hrv && heavyDays.has(eve) ? 6 : 0), rhr: 53 + 0.9 * g(), nap: null });
    for (const h of [10, 16]) {
      const e = 6.5 + 0.8 * g() + (plant.weeks ? 0.15 * (wkKg - mkg) / 1000 : 0);
      entries.push({ id: `f${k}-${h}`, kind: "feel", at: at(k, h), energy: Math.max(1, Math.min(10, Math.round(e))), mood: Math.max(1, Math.min(10, Math.round(6.6 + 0.8 * g()))) });
    }
  }
  const hr: HrMinute[] = [];
  if (withHr) {
    // from 15 days before the first session (a usual needs the days before), every minute: a daily rhythm, and after
    // each session a fall back to it — 50 bpm above, coming down so it's within 3 bpm at the planted minute
    const byStart = [...ss];
    for (let t = at(-15), i = 0; t < at(84); t += MIN) {
      while (i < byStart.length && byStart[i].endedAt! + 3 * H < t) i++;
      let v = 62 - (plant.drift ? (0.5 * (t - at(0))) / (7 * D) : 0) + 8 * Math.sin((2 * Math.PI * ((t - at(-15)) / D - 0.3))) + g();
      const s = byStart[i];
      if (s && t >= s.startedAt && t < s.endedAt!) v = 130 + 3 * g();
      else if (s && t >= s.endedAt!) { const tau = backOf.get(s.id)! / Math.log(50 / 3); v += 50 * Math.exp(-(t - s.endedAt!) / MIN / tau); }
      hr.push([t, Math.round(v), Math.round(v) - 2, Math.round(v) + 2]);
    }
  }
  return { ss, entries, ns, hr, heavy };
}
const grid = (w: ReturnType<typeof world>, seed = 7) => { const a = afterDays(w.ss, w.ns, w.entries); return goesWith<Night, AfterDay>(a.ns, a.days, { factors: AFTER_FACTORS, outcomes: AFTER_OUTCOMES, seed }); };
const cellOf = (cells: ReturnType<typeof grid>, f: string, o: string) => cells.find((c) => c.factor === f && c.outcome === o)!;

describe("Training C · what training goes with afterwards (PLAN 64)", () => {
  it("finds the planted heavy session → that night's HRV −6 ms, at about its size", () => {
    const c = cellOf(grid(world(41, { hrv: true })), "heavy", "hrv");
    expect(["clear", "likely"]).toContain(c.sure); expect(c.toward).toBe("worse");
    expect(c.diff!).toBeLessThan(-3.5); expect(c.diff!).toBeGreaterThan(-8.5);
  });
  it("…and nothing clear where nothing was planted (sleep, resting HR, the next day)", () => {
    const cells = grid(world(41, { hrv: true }));
    expect(cells.filter((c) => c.outcome !== "hrv" && c.sure === "clear")).toEqual([]);
  });
  it("nothing planted at all: at most one clear cell across 10 worlds", () => {
    let clear = 0;
    for (let s = 800; s < 810; s++) clear += grid(world(s), s).filter((c) => c.sure === "clear").length;
    expect(clear).toBeLessThanOrEqual(1);
  });
  it("heavy: against the same template's last sessions, unknown until it has 3; rest days and those left out of its row", () => {
    const w = world(41), firsts = new Set<string>(), count = new Map<string, number>();
    w.ss.forEach((s) => { const c = (count.get(s.template) ?? 0) + 1; count.set(s.template, c); if (c <= HEAVY_NEED) firsts.add(s.id); });
    w.ss.forEach((s, i) => expect(w.heavy[i] == null).toBe(firsts.has(s.id)));
    // rising 0.6 % a week doesn't make every later session "heavy": about half are
    const known = w.heavy.filter((h) => h != null), share = known.filter(Boolean).length / known.length;
    expect(share).toBeGreaterThan(0.3); expect(share).toBeLessThan(0.75);
    const a = afterDays(w.ss, w.ns, w.entries), c = cellOf(grid(w), "heavy", "asleep");
    expect(c.nWith + c.nWithout).toBe(a.days.filter((d) => d.heavy != null).length);
    expect(a.days.filter((d) => !d.trained).every((d) => d.heavy == null)).toBe(true);
    const late = cellOf(grid(w), "late", "asleep");
    expect(late.nWith + late.nWithout).toBe(a.days.filter((d) => d.trained).length);
  });
  it("starts at the first logged session: earlier days aren't known rest days; no check-in the next day → no energy", () => {
    const w = world(41), early: Night = { ...w.ns[0], id: "early", eve: localDay(w.ss[0].startedAt - 5 * D), bed: w.ss[0].startedAt - 5 * D };
    const a = afterDays(w.ss, [early, ...w.ns], w.entries.filter((e) => localDay(e.at) !== w.ns[10].day));
    expect(a.ns.some((n) => n.id === "early")).toBe(false);
    expect(a.days.find((d) => d.day === w.ns[10].eve)!.energy).toBeNull();
    expect(a.days.find((d) => d.day === w.ns[11].eve)!.energy).not.toBeNull();
  });
  it("weeks: Monday weeks to this one (so far), kg lifted summed, average energy", () => {
    const w = world(41), now = at(80, 12), ws = trainingWeeks(w.ss, w.entries, now);
    expect(ws.length).toBe(12); expect(new Date(ws[0].from).getDay()).toBe(1); expect(ws.at(-1)!.partial).toBe(true);
    expect(ws.filter((x) => x.partial).length).toBe(1);
    expect(Math.round(ws.reduce((a, x) => a + x.kg, 0))).toBe(Math.round(w.ss.filter((s) => s.startedAt < now).reduce((a, s) => a + s.volume, 0)));
    expect(ws.at(-1)!.checkins).toBe(w.entries.filter((e) => e.at >= ws.at(-1)!.from && e.at <= now).length);
  });
  it("weeks: a planted link (more kg, more energy) is found; none planted, not clear", () => {
    const wy = world(41, { weeks: true }), yes = weeksLink(trainingWeeks(wy.ss, wy.entries, at(84)));
    expect(["clear", "likely"]).toContain(yes.sure); expect(yes.slope!).toBeGreaterThan(0);
    let clear = 0;
    for (let s = 800; s < 810; s++) { const w = world(s); if (weeksLink(trainingWeeks(w.ss, w.entries, at(84))).sure === "clear") clear++; }
    expect(clear).toBeLessThanOrEqual(1);
  });
  it("recovery: minutes back to usual falling 1 a week is found, about 11 min over the 12 weeks", () => {
    const w = world(41, { back: true }, true), rc = recovery(w.ss, w.hr, w.ss.map((s) => ({ start: s.startedAt, end: s.endedAt! })));
    expect(rc.pts.length).toBeGreaterThanOrEqual(35);
    expect(["clear", "likely"]).toContain(rc.slope.sure);
    expect(rc.change!).toBeLessThan(-6); expect(rc.change!).toBeGreaterThan(-16);
    // each session measured near its planted minute (the 5-reading run lands it a few minutes after)
    const mid = rc.pts.map((p) => p.backMin).sort((a, b) => a - b)[rc.pts.length >> 1];
    expect(mid).toBeGreaterThan(28); expect(mid).toBeLessThan(42);
  }, 30_000);
  it("recovery: nothing planted → not clear; no heart rate after a session → left out, not counted as slow", () => {
    const w = world(41, {}, true), spans = w.ss.map((s) => ({ start: s.startedAt, end: s.endedAt! }));
    expect(recovery(w.ss, w.hr, spans).slope.sure).not.toBe("clear");
    const cut = w.ss[20].endedAt!, hr = w.hr.filter((m) => m[0] < cut || m[0] > cut + 3 * H), rc = recovery(w.ss, hr, spans);
    expect(rc.pts.some((p) => p.id === w.ss[20].id)).toBe(false); expect(rc.notBack).toBe(0);
    // the band on for the 2 h after but never back down: counted as not back, not dropped quietly
    const high = w.hr.map((m): HrMinute => (m[0] >= cut && m[0] < cut + 2.5 * H ? [m[0], 120, 118, 122] : m));
    expect(recovery(w.ss, high, spans).notBack).toBe(1);
    // …and taken off 10 minutes after: not known
    const off = w.hr.filter((m) => m[0] < cut + 10 * MIN || m[0] > cut + 3 * H).map((m): HrMinute => (m[0] >= cut && m[0] < cut + 10 * MIN ? [m[0], 120, 118, 122] : m));
    expect(recovery(w.ss, off, spans).notBack).toBe(0);
  }, 30_000);
  it("recovery: everyday heart rate falling 6 bpm over the weeks isn't read as recovering slower or faster", () => {
    // each session against its own two weeks before; one usual for all would make July's sessions look slow
    const w = world(41, { drift: true }, true), rc = recovery(w.ss, w.hr, w.ss.map((s) => ({ start: s.startedAt, end: s.endedAt! })));
    expect(rc.slope.sure).not.toBe("clear"); expect(Math.abs(rc.change!)).toBeLessThan(4);
  }, 30_000);
});
