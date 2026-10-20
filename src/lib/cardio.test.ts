import { describe, expect, it } from "vitest";
import { cardioHr, cardioKcal, cardioLine, cardioSpans, cardioWeekLines, kindOf, lastLike } from "./cardio";
import { nightContext } from "./ai/client";
import { DEFAULT_SETTINGS, EMPTY_AI, type State } from "./store";
import { DEFAULT_GOALS } from "./types";
import type { HrMinute } from "./band";
import type { Workout } from "./types";

// Owner, 20 Oct: "a button that i press and it strts w timer, then it logs as cardio sessions, reads and understands the
// heart bpm and other metrics … Cardio is important for my weight loss."
const at = (d: string, hm: string) => new Date(`2026-10-${d}T${hm}:00`).getTime();
const M = 60_000;
const own = (id: string, what: string, s: number, e: number | null, more: Partial<Workout> = {}): Workout => ({ id, template: "Cardio", kind: "cardio", startedAt: s, endedAt: e, cardio: { what, startedAt: s }, ...more });
/** A planted heart rate: `bpm` every minute from s to e (minute max = bpm + 6), 60 outside it. */
const beat = (s: number, e: number, bpm: number, from = s - 30 * M, to = e + 30 * M): HrMinute[] => {
  const out: HrMinute[] = [];
  for (let t = from; t < to; t += M) { const v = t >= s && t < e ? bpm : 60; out.push([t, v, v - 3, v + 6]); }
  return out;
};

describe("what kind, and the calories (Compendium MET × kg × hours)", () => {
  it("reads the kind from the words; uphill before plain walking", () => {
    expect(["20 min stairmaster", "25 min incline walk", "Spin bike", "Rower", "jog", "Cross trainer", "walk to work", "Zumba"].map((w) => kindOf(w)?.name ?? null))
      .toEqual(["Stairmaster", "Incline walk", "Bike", "Rower", "Run", "Elliptical", "Walk", null]);
  });
  it("known answers: 30 min stairmaster at 80 kg = 9 × 80 × 0.5 = 360; 45 min incline walk at 92.4 kg = 554", () => {
    expect(cardioKcal("Stairmaster", 30, 80)?.kcal).toBe(360);
    expect(cardioKcal("Incline walk", 45, 92.4)?.kcal).toBe(554);
  });
  it("no number without the kind or a weight", () => {
    expect(cardioKcal("Zumba", 30, 80)).toBeNull();
    expect(cardioKcal("Bike", 30, null)).toBeNull();
  });
});

describe("the band's heart rate inside a session", () => {
  it("finds the planted 140 inside, not the 60 around it; peak is the highest beat", () => {
    const s = at("15", "18:00"), e = at("15", "18:40");
    expect(cardioHr(beat(s, e, 140), s, e)).toEqual({ n: 40, avg: 140, peak: 146 });
  });
  it("too few minutes from the band (it's behind): nothing, not a made-up number", () => {
    const s = at("15", "18:00"), e = at("15", "18:40");
    expect(cardioHr(beat(s, e, 140, s - 30 * M, s + M), s, e)).toBeNull();
  });
});

describe("cardio stretches", () => {
  const ws: Workout[] = [
    own("c1", "Stairmaster", at("13", "18:00"), at("13", "18:35")),
    // lifting with cardio after: started, then Done
    { id: "l1", template: "Push", startedAt: at("14", "17:00"), endedAt: at("14", "18:20"), cardio: { what: "20 min incline walk", startedAt: at("14", "17:55"), done: true, at: at("14", "18:15") } },
    // ticked Done without a timer (before this): no span; skipped: no span
    { id: "l2", template: "Pull", startedAt: at("12", "17:00"), endedAt: at("12", "18:00"), cardio: { what: "20 min stairmaster", done: true, at: at("12", "18:00") } },
    { id: "l3", template: "Legs", startedAt: at("11", "17:00"), endedAt: at("11", "18:00"), cardio: { what: "bike", startedAt: at("11", "17:50"), done: false, at: at("11", "17:51") } },
    own("c2", "Stairmaster", at("15", "18:00"), null),
  ];
  const now = at("15", "18:25");
  it("sessions of their own and timed cardio after lifting; untimed or skipped left out; a running one runs to now", () => {
    expect(cardioSpans(ws, now).map((s) => [s.workoutId, s.what, (s.end - s.start) / M, s.own, s.running])).toEqual([
      ["c1", "Stairmaster", 35, true, false], ["l1", "20 min incline walk", 20, false, false], ["c2", "Stairmaster", 25, true, true],
    ]);
  });
  it("against the last of the same kind", () => {
    const sp = cardioSpans(ws, now);
    expect(lastLike(sp, sp[2])?.workoutId).toBe("c1");
    expect(lastLike(sp, sp[1])).toBeNull();
  });
  it("one line for the AI: minutes, the band's heart rate, the estimate and how it was made, last time", () => {
    const sp = cardioSpans([...ws.slice(0, 4), own("c2", "Stairmaster", at("15", "18:00"), at("15", "18:40"))], now);
    const hr = [...beat(at("13", "18:00"), at("13", "18:35"), 135), ...beat(at("15", "18:00"), at("15", "18:40"), 142)];
    expect(cardioLine(sp[2], sp, hr, 80)).toBe("Stairmaster 18:00–18:40 (40 min): heart rate avg 142, peak 148 bpm (band, 40 of 40 min); about 480 kcal (MET 9 × 80 kg) — last Stairmaster, Tue 13 Oct: 35 min, avg 135 bpm");
    expect(cardioLine(sp[1], sp, [], null)).toBe("20 min incline walk 17:55–18:15 (20 min), after lifting: no heart rate from the band for it — the first of its kind");
  });
  it("a timer left running says so", () => {
    const sp = cardioSpans([own("c9", "Bike", at("15", "07:00"), at("15", "10:00"), { autoEnded: true })], now);
    expect(cardioLine(sp[0], sp, [], 80)).toMatch(/^Bike 07:00–10:00 \(180 min, the timer was left running — ended by itself\)/);
  });
});

describe("the week's cardio, for the morning read and the chat", () => {
  // Tue 20 Oct 2026; weeks start Monday 19 Oct
  const ws = [own("a", "Stairmaster", at("20", "07:00"), at("20", "07:40")), own("b", "Bike", at("19", "18:00"), at("19", "18:30")),
    own("c", "Stairmaster", at("13", "18:00"), at("13", "18:45")), own("d", "Run", at("01", "08:00"), at("01", "08:20")), own("e", "Run", at("20", "19:00"), null)];
  it("this week against the weeks before (a running one isn't counted yet), then the last sessions, newest first", () => {
    const l = cardioWeekLines(cardioSpans(ws, at("20", "19:10")), [], 80, at("20", "19:10"));
    // 40 min × 9 MET × 80 kg = 480; 30 min × 7 × 80 = 280
    expect(l[0]).toBe("Cardio this week (from Mon 19 Oct): 2 sessions, 70 min, about 760 kcal; the 3 weeks before, newest first: 45 min, 0 min, 20 min");
    expect(l.slice(1).map((x) => x.split(" ")[1])).toEqual(["Stairmaster", "Bike", "Stairmaster"]);
  });
  it("nothing when there's no cardio", () => {
    expect(cardioWeekLines([], [], 80, at("20", "12:00"))).toEqual([]);
  });
});

describe("the night read-back on a cardio day (PLAN 130: \"later it can make it into the digest\")", () => {
  const st = { entries: [{ id: "w", kind: "weight", at: at("20", "07:00"), kg: 81 }], workouts: [own("c", "Stairmaster", at("13", "18:00"), at("13", "18:45")), own("t", "Stairmaster", at("20", "18:00"), at("20", "18:40"))],
    supplements: [], settings: DEFAULT_SETTINGS, profile: { conditions: [], meds: [], allergies: [], notes: "" }, goals: DEFAULT_GOALS, ai: EMPTY_AI, foods: [], drinks: [], templates: [], scout: {} } as unknown as State;
  it("gets the session, the estimate from his own weigh-in, last time, and the week so far", () => {
    const c = nightContext("2026-10-20", st, at("20", "21:30"));
    const w = c.slice(c.indexOf("## The workout that day")).split("\n");
    expect(w[1]).toBe("- Cardio: Stairmaster 18:00–18:40 (40 min): no heart rate from the band for it; about 486 kcal (MET 9 × 81 kg) — last Stairmaster, Tue 13 Oct: 45 min");
    expect(w[2]).toBe("- Cardio this week (from Mon 19 Oct): 1 session, 40 min, about 486 kcal; the 3 weeks before, newest first: 45 min, 0 min, 0 min");
    expect(c).toMatch(/18:00 cardio: Stairmaster \(40 min\)/);
  });
});
