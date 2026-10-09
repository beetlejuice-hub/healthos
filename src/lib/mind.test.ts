import { describe, expect, it } from "vitest";
import { mindFactors, mindOutcomes, moodCourse, moodMonth, moodRhythm, sleepSlope, stepOf, thisMorning } from "./mind";
import { rng } from "./bench";
import { goesWith, type Evening, type Night } from "./sleep";
import { atMinute } from "./time";
import type { GlanceDay } from "./glance";
import type { Entry } from "./types";
import { addDays } from "./time";

const day = (d: string, mood: number | null, extra: Partial<GlanceDay> = {}): GlanceDay => ({ day: d, mood, energy: null, focus: null, stress: null, sleep: null, kcal: null, protein: null, cafBed: null, drinks: null, weight: null, trained: false, lateCaffeine: false, note: false, checkins: mood == null ? 0 : 1, ...extra });

describe("moodCourse", () => {
  const days = [day("2026-09-28", 6), day("2026-09-29", 8, { drinks: 2 }), day("2026-09-30", 4), day("2026-10-01", null), day("2026-10-02", 6)];
  const c = moodCourse(days, 4);
  it("measures each day against your average of every rated day", () => {
    expect(c.base).toBe(6);
    expect(c.days.map((d) => d.dev)).toEqual([2, -2, null, 0]);
    expect(c.above).toBe(1);
    expect(c.rated).toBe(3);
  });
  it("names the best and lowest day, and flags the day after drinks", () => {
    expect(c.best!.day).toBe("2026-09-29");
    expect(c.lowest!.day).toBe("2026-09-30");
    expect(c.days[1].drinksBefore).toBe(true); // the 30th follows the 29th's drinks
  });
  it("copes with no ratings", () => {
    const e = moodCourse([day("2026-10-01", null)], 7);
    expect(e.base).toBeNull(); expect(e.best).toBeNull(); expect(e.above).toBe(0);
  });
});

describe("moodRhythm", () => {
  const at = (iso: string, h: number) => new Date(`${iso}T${String(h).padStart(2, "0")}:15`).getTime();
  // Four weeks: mood 5 everywhere, but Monday evenings (18–21) are 8 — a planted rhythm.
  const es: Entry[] = []; let n = 0;
  for (let k = 0; k < 28; k++) {
    const d = addDays("2026-09-06", k), mon = new Date(`${d}T12:00`).getDay() === 1;
    for (const h of [9, 14, 19]) es.push({ id: String(n++), kind: "feel", at: at(d, h), mood: mon && h === 19 ? 8 : 5 });
  }
  const r = moodRhythm(es, 0);
  it("finds a planted best time: Monday 18–21", () => {
    expect(r.best).toMatchObject({ row: 0, col: 4, mean: 8, n: 4 });
    expect(r.n).toBe(84);
  });
  it("doesn't invent a lowest time when everything else is flat", () => {
    expect(r.lowest!.mean).toBe(5);
    expect(r.lo).toBe(5); expect(r.hi).toBe(8);
  });
  it("puts a 01:00 check-in in the evening before (Sunday 01:00 → Saturday 21–24)", () => {
    const x = moodRhythm([{ id: "x", kind: "feel", at: at("2026-10-04", 1), mood: 3 }], 0);
    expect(x.cells.find((c) => c.n)).toMatchObject({ row: 5, col: 5 });
  });
  it("leaves out check-ins before the window", () => {
    expect(moodRhythm(es, at("2026-10-04", 0)).n).toBe(0);
    expect(moodRhythm(es, at("2026-10-03", 0)).n).toBe(3);
  });
  it("steps colour between the grid's lowest and highest", () => {
    expect(stepOf(5, 5, 8)).toBe(0); expect(stepOf(8, 5, 8)).toBe(5); expect(stepOf(6.5, 5, 8)).toBe(2);
  });
});

/* ------------------------------------------------------------------ the band's side (PLAN 58) */

const D0 = "2026-09-08";
/** A night from the evening `i` days after D0, 23:00 to 07:00 unless told otherwise. */
function night(i: number, o: Partial<Night> = {}): Night {
  const eve = addDays(D0, i), d = addDays(D0, i + 1), bed = atMinute(eve, 23 * 60), up = atMinute(d, 7 * 60);
  return { id: eve, day: d, eve, bed, up, onset: bed, wake: up, asleep: 450, deep: 80, rem: 90, light: 280, awake: 20, wakes: 2, latency: 10, stages: [], low: 50, lowAt: null, hrv: 45, rhr: 52, nap: null, ...o };
}
const evening = (o: Partial<Evening> = {}): Evening => ({ drinks: [], caffeineAtBed: 0, trained: false, ateLate: false, rating: null, ...o });

/** 30 nights and days; planted: the day after drinks mood −0.9, a short night energy −1.2. */
function world(seed: number, plant = true, trainedStress = 0) {
  const { r, g } = rng(seed), ns: Night[] = [], evs: Evening[] = [], byDay = new Map<string, GlanceDay>(), trained = new Set<string>();
  for (let i = 0; i < 30; i++) {
    const drinks = r() < 0.33, asleep = 420 + g() * 35, n = night(i, { asleep, hrv: 46 + g() * 4 });
    ns.push(n); evs.push(evening({ drinks: drinks ? [atMinute(n.eve, 21 * 60)] : [], caffeineAtBed: r() < 0.3 ? 60 : 0 }));
    if (r() < 0.4) trained.add(n.day);
    const short = asleep < 390;
    byDay.set(n.day, day(n.day, 6.3 + g() * 0.4 - (plant && drinks ? 0.9 : 0), { energy: 5.8 + g() * 0.4 - (plant && short ? 1.2 : 0), stress: 4 + g() * 0.5 + (trained.has(n.day) ? trainedStress : 0), focus: 5.5 + g() * 0.5 }));
  }
  return { ns, evs, byDay, trainedOn: (d: string) => trained.has(d) };
}

describe("what goes with how you felt that day", () => {
  it("finds the planted drinks → mood and short night → energy, clear and toward worse; nothing else clear", () => {
    const w = world(4), cells = goesWith(w.ns, w.evs, { factors: mindFactors(w.ns, w.trainedOn), outcomes: mindOutcomes(w.byDay) });
    const cell = (f: string, o: string) => cells.find((c) => c.factor === f && c.outcome === o)!;
    expect(cell("drinks", "mood")).toMatchObject({ sure: "clear", toward: "worse" });
    expect(cell("drinks", "mood").diff!).toBeLessThan(-0.6);
    expect(cell("short", "energy")).toMatchObject({ sure: "clear", toward: "worse" });
    expect(cells.filter((c) => c.sure === "clear").map((c) => `${c.factor}×${c.outcome}`).sort()).toEqual(["drinks×mood", "short×energy"]);
  });
  it("less stress is the better way; the columns are the day the night ends on", () => {
    const o = mindOutcomes(new Map([[addDays(D0, 1), day(addDays(D0, 1), 7, { stress: 3 })], [D0, day(D0, 2, { stress: 9 })]]));
    expect(o.find((x) => x.id === "stress")!.better).toBe(-1);
    expect(o.find((x) => x.id === "mood")!.of(night(0), evening())).toBe(7);
  });
  it("rows: HRV's lowest quarter among the nights (needs 8), bed after 00:15, trained on the day itself", () => {
    const ns = Array.from({ length: 30 }, (_, i) => night(i, { hrv: 30 + i }));
    const f = mindFactors(ns, (d) => d === addDays(D0, 1)), has = (id: string, n: Night) => f.find((x) => x.id === id)!.has(n, evening());
    expect(ns.filter((n) => has("lowhrv", n)).length).toBe(8);
    expect(mindFactors(ns.slice(0, 7), () => false).find((x) => x.id === "lowhrv")!.has(ns[0], evening())).toBe(false);
    expect(has("latebed", night(0, { bed: atMinute(D0, 24 * 60 + 20) }))).toBe(true);
    expect(has("latebed", night(0, { bed: atMinute(D0, 24 * 60 + 10) }))).toBe(false);
    expect(has("trained", night(0))).toBe(true); // the night of the 8th ends on the 9th, the day trained
    expect(has("trained", night(1))).toBe(false);
  });
  it("this morning's line: only what's known by the morning, only clear or likely, surest first", () => {
    const w = world(4), f = mindFactors(w.ns, () => true), cells = goesWith(w.ns, w.evs, { factors: f, outcomes: mindOutcomes(w.byDay) });
    const morning = night(40, { asleep: 300 }), e = evening({ drinks: [atMinute(addDays(D0, 40), 21 * 60)] });
    const links = thisMorning(morning, e, f, cells);
    expect(links.map((l) => `${l.factor.id}×${l.cell.outcome}`)).toEqual(expect.arrayContaining(["drinks×mood", "short×energy"]));
    expect(links.every((l) => l.factor.when !== "the day" && (l.cell.sure === "clear" || l.cell.sure === "likely"))).toBe(true);
    expect(links.map((l) => l.cell.p!)).toEqual([...links.map((l) => l.cell.p!)].sort((a, b) => a - b));
    expect(thisMorning(night(40), evening(), f, cells)).toEqual([]);
  });
  it("…and leaves out the day's own rows even when they're clear: training is later than the morning", () => {
    const w = world(4, true, 1.5), morning = night(40, { asleep: 300 });
    const f = mindFactors(w.ns, (d) => w.trainedOn(d) || d === morning.day), cells = goesWith(w.ns, w.evs, { factors: f, outcomes: mindOutcomes(w.byDay) });
    expect(cells.find((c) => c.factor === "trained" && c.outcome === "stress")!.sure).toBe("clear");
    const links = thisMorning(morning, evening(), f, cells);
    expect(links.length).toBeGreaterThan(0);
    expect(links.some((l) => l.factor.id === "trained")).toBe(false);
  });
});

describe("steps in the mind grid (PLAN 66)", () => {
  it("finds a planted +0.8 mood on days with more steps than usual; days the band was off are left out", () => {
    const { g } = rng(8), ns: Night[] = [], evs: Evening[] = [], byDay = new Map<string, GlanceDay>(), steps = new Map<string, number>();
    const st = Array.from({ length: 30 }, () => Math.round(7000 + g() * 2500)), mid = [...st].sort((a, b) => a - b)[15];
    for (let i = 0; i < 30; i++) {
      const n = night(i, { asleep: 430 + g() * 20 }); ns.push(n); evs.push(evening());
      if (i % 7 !== 3) steps.set(n.day, st[i]);
      byDay.set(n.day, day(n.day, 6.2 + g() * 0.4 + (st[i] > mid ? 0.8 : 0), { energy: 6 + g() * 0.4, stress: 4 + g() * 0.5, focus: 5.5 + g() * 0.5 }));
    }
    const f = mindFactors(ns, () => false, steps), cells = goesWith(ns, evs, { factors: f, outcomes: mindOutcomes(byDay) });
    const c = cells.find((x) => x.factor === "steps" && x.outcome === "mood")!;
    expect(c.nWith + c.nWithout).toBe(26);
    expect(c).toMatchObject({ sure: "clear", toward: "better" });
    expect(cells.filter((x) => x.factor === "steps" && x.outcome !== "mood").every((x) => x.sure !== "clear")).toBe(true);
    expect(f.find((x) => x.id === "steps")!.when).toBe("the day"); // so this morning's line never uses it
  });
  it("without steps the row is there but says too few", () => {
    const w = world(4), cells = goesWith(w.ns, w.evs, { factors: mindFactors(w.ns, w.trainedOn), outcomes: mindOutcomes(w.byDay) });
    expect(cells.filter((c) => c.factor === "steps").every((c) => c.sure === "too few")).toBe(true);
  });
});

describe("a feeling against hours asleep", () => {
  const nights = (seed: number, k: number) => { const { g } = rng(seed); return Array.from({ length: 30 }, (_, i) => { const a = 420 + g() * 45; return { n: night(i, { asleep: a }), v: 5.8 + k * (a / 60 - 7) + g() * 0.5 }; }); };
  it("finds a planted +0.9 energy per hour asleep, clear", () => {
    const w = nights(2, 0.9), s = sleepSlope(w.map((x) => x.n), (n) => w.find((x) => x.n === n)!.v);
    expect(s.sure).toBe("clear");
    expect(s.slope!).toBeGreaterThan(0.6); expect(s.slope!).toBeLessThan(1.2);
  });
  it("with nothing planted, 12 worlds: never clear, likely at most once", () => {
    let clear = 0, likely = 0;
    for (let k = 1; k <= 12; k++) { const w = nights(50 + k, 0), s = sleepSlope(w.map((x) => x.n), (n) => w.find((x) => x.n === n)!.v, { perms: 1000 }); if (s.sure === "clear") clear++; if (s.sure === "likely") likely++; }
    expect(clear).toBe(0); expect(likely).toBeLessThanOrEqual(1);
  });
  it("four feelings to pick from, so the bars are four times stricter: a chance slope at p 0.03 is not clear", () => {
    const w = nights(50, 0), s = sleepSlope(w.map((x) => x.n), (n) => w.find((x) => x.n === n)!.v);
    expect(s.p!).toBeGreaterThan(0.0125); expect(s.p!).toBeLessThan(0.05);
    expect(s.sure).toBe("not clear");
  });
  it("under 10 days, or every night the same length: too few", () => {
    const w = nights(2, 0.9);
    expect(sleepSlope(w.slice(0, 9).map((x) => x.n), () => 5).sure).toBe("too few");
    expect(sleepSlope(Array.from({ length: 12 }, (_, i) => night(i)), (n) => n.asleep).sure).toBe("too few");
  });
});

describe("the month as a calendar", () => {
  const ds = ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07"].map((d, i) => day(d, [6, 7, 6.2, 5.6, 7.5, null, 4.6][i], { drinks: i === 0 || i === 3 ? 2 : 0, trained: i === 4 }));
  const m = moodMonth(ds, 6, (d) => (d === "2026-10-03" ? 330 : d === "2026-10-07" ? null : 450));
  it("your usual is the middle of the days shown; each day a step from it (±0.3, 0.7, 1.2)", () => {
    expect(m.days.map((d) => d.day)).toEqual(ds.slice(1).map((d) => d.day));
    expect(m.usual).toBe(6.2);
    expect(m.days.map((d) => d.step)).toEqual([2, 0, -1, 3, null, -3]);
  });
  it("drinks the evening before — the day before the window counts too — a short night from the band, training", () => {
    expect(m.days.map((d) => d.drinksBefore)).toEqual([true, false, false, true, false, false]);
    expect(m.days.map((d) => d.short)).toEqual([false, true, false, false, false, null]);
    expect(m.days.map((d) => d.trained)).toEqual([false, false, false, true, false, false]);
    expect(moodMonth(ds.slice(0, 4), 4, () => null).usual).toBeNull();
  });
});
