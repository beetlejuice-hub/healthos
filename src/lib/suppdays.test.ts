import { describe, expect, it } from "vitest";
import { suppAnswers, suppByDay } from "./suppdays";
import { dailyFacts, suppDay, suppEffects } from "./insights";
import { DEFAULT_SETTINGS } from "./store";
import type { Entry, Supplement } from "./types";

// Owner, 20 Oct: "if i dont take a supp, like not log it, it should be taken as if i did not take it. if i click in the
// followup that i took it, data should be modified accordingly".
const at = (d: string, hm: string) => new Date(`2026-10-${d}T${hm}:00`).getTime();
let n = 0;
const supp = (d: string, id: string, status: "taken" | "skipped" = "taken", hm = "08:00"): Entry => ({ id: `s${n++}`, kind: "supp", at: at(d, hm), suppId: id, status });
const feel = (d: string, mood: number, hm = "18:00"): Entry => ({ id: `f${n++}`, kind: "feel", at: at(d, hm), mood });
const food = (d: string): Entry => ({ id: `e${n++}`, kind: "food", at: at(d, "12:30"), name: "Oats", grams: 80, macros: { kcal: 300, p: 10, c: 50, f: 6 } });

describe("not logged = not taken", () => {
  const es: Entry[] = [
    food("10"),                       // before magnesium was ever logged: unknown, not "without"
    supp("11", "mag"), feel("11", 7),
    food("12"),                       // used the app, didn't log magnesium → not taken
    supp("13", "mag", "skipped"),     // said "didn't" → not taken
    // 14th: nothing logged at all → unknown
    supp("15", "mag", "skipped", "08:00"), supp("15", "mag", "taken", "21:00"), // skipped, then took it later → taken
    food("16"),                       // used the app, nothing for magnesium → not taken
    supp("17", "mag", "taken", "09:00"),
  ];
  it("each day: taken, not taken, or unknown", () => {
    const m = suppByDay(es);
    expect(["10", "11", "12", "13", "14", "15", "16", "17"].map((d) => m.get(`2026-10-${d}`)?.get("mag") ?? null)).toEqual([null, true, false, false, null, true, false, true]);
  });
  it("only one inferred \"didn't\" per day, at noon, marked as inferred", () => {
    const inf = suppAnswers(es).filter((a) => a.inferred);
    expect(inf.map((a) => new Date(a.at).getDate())).toEqual([12, 16]);
    expect(inf.every((a) => a.status === "skipped" && new Date(a.at).getHours() === 12)).toBe(true);
  });
  it("the follow-up's \"took it\" for yesterday (logged at yesterday's time) turns that day into taken", () => {
    const fixed = [...es, supp("16", "mag", "taken", "21:30")];
    expect(suppByDay(fixed).get("2026-10-16")?.get("mag")).toBe(true);
    expect(suppAnswers(fixed).filter((a) => a.inferred).map((a) => new Date(a.at).getDate())).toEqual([12]);
  });
});

describe("the engines see the unlogged days as days without", () => {
  // Saffron logged on 10 days, the app used but saffron not logged on 10 others; mood 2 points higher on saffron days.
  const STACK: Supplement[] = [{ id: "saf", name: "Saffron", dose: "30 mg", slot: "evening", at: 1290, active: true }];
  const es: Entry[] = [];
  for (let i = 0; i < 20; i++) {
    const d = String(1 + i).padStart(2, "0"), on = i % 2 === 0;
    if (on) es.push(supp(d, "saf", "taken", "20:00"));
    es.push(feel(d, 5, "09:00"), food(d));
    es.push(feel(String(2 + i).padStart(2, "0"), on ? 8 : 6, "10:00"));
  }
  const facts = dailyFacts(es, [], DEFAULT_SETTINGS, "2026-10-01", "2026-10-21");
  it("day facts: 10 taken, 11 not taken — the 21st too, its check-in means the app was used (were unknown before)", () => {
    const v = facts.map((f) => suppDay(f, "saf"));
    expect([v.filter((x) => x === true).length, v.filter((x) => x === false).length]).toEqual([10, 11]);
  });
  it("on vs off now has its off days, and finds the planted lift", () => {
    const e = suppEffects(facts, STACK).find((x) => x.metric === "mood")!;
    expect([e.on, e.off, e.need]).toEqual([10, 10, 0]);
    expect(e.diff!.value).toBeGreaterThan(0.8); // +2 on one of the day's two check-ins: about +1 on the day's average
  });
});
