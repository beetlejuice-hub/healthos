// One engine, one set of words (PLAN 188 phase 2; owner, 3 Nov: "1 and 2"). On the sample's planted worlds (alcohol → that
// night's rating and next-day energy, late caffeine → next-day energy and caffeine at bed → that night's rating) the
// engine finds them; with nothing planted it calls nothing clear; Connections' rows that ask the same thing say exactly
// what the engine says; a clear row becomes the record's claim under Noticed's own id.
import { describe, expect, it } from "vitest";
import { makeSample } from "./sample";
import { dailyFacts } from "./insights";
import { glanceDays } from "./glance";
import { DEFAULT_SETTINGS } from "./store";
import { comparisons } from "./connections";
import { evidence, evidenceClaim, twinOf, wordOf } from "./evidence";
import { effectFindings } from "./detectors/effects";
import { noticedClaim } from "./record";
import { addDays, localDay } from "./time";
import type { Supplement } from "./types";

const NOW = new Date("2026-10-31T21:00:00").getTime();
const SUPPS = [["creatine", "Creatine"], ["mag", "Magnesium"]].map(([id, name]) => ({ id, name, dose: "1", slot: id === "mag" ? "evening" : "morning", at: 480, active: true }) as unknown as Supplement);
function world(seed: number, effects: boolean) {
  const { entries, workouts } = makeSample(NOW, 60, { effects, seed });
  const to = addDays(localDay(NOW), -1), from = addDays(to, -59);
  const facts = dailyFacts(entries, workouts, DEFAULT_SETTINGS, from, to), days = glanceDays(entries, workouts, DEFAULT_SETTINGS, from, to);
  const ev = evidence(facts, SUPPS);
  return { facts, ev, rows: comparisons(days, SUPPS, ev) };
}

describe("one engine (PLAN 188 phase 2)", () => {
  const N = 12, fx = Array.from({ length: N }, (_, s) => world(4000 + s, true)), ctl = Array.from({ length: N }, (_, s) => world(4000 + s, false));
  const clear = (w: ReturnType<typeof world>, key: string) => w.ev.get(key)?.word === "clear";
  it("planted: alcohol → that night's sleep and next-day energy found clear in most worlds; nothing planted: rarely anything clear", () => {
    expect(fx.filter((w) => clear(w, "alc:sleep") || clear(w, "alc:energy")).length).toBeGreaterThanOrEqual(10);
    expect(ctl.filter((w) => [...w.ev.values()].some((e) => e.word === "clear")).length).toBeLessThanOrEqual(3);
  });
  it("Connections says what the engine says: every row with a twin takes its word, and 'clear' only when the engine says clear", () => {
    for (const w of [...fx, ...ctl]) for (const r of w.rows) {
      const key = twinOf(r.id), e = key ? w.ev.get(key) : undefined;
      if (!e) continue;
      expect(r.word).toBe(e.word);
      if (r.diff) expect(r.diff.clear).toBe(e.word === "clear");
    }
    // the rows that have a twin: drinks, late caffeine, training, each supplement
    expect(fx[0].rows.filter((r) => r.twin).map((r) => r.id).sort()).toEqual(["caf-energy", "caf-sleep", "drinks-energy", "drinks-mood", "drinks-sleep", "supp-creatine-energy", "supp-creatine-mood", "supp-mag-energy", "supp-mag-mood", "supp-mag-sleep", "train-energy", "train-mood", "train-sleep", "train-stress"]);
  });
  it("no supplement does anything in the sample: a supplement row is clear in at most 2 of 24 worlds", () => {
    expect([...fx, ...ctl].filter((w) => w.rows.some((r) => r.id.startsWith("supp-") && r.word === "clear")).length).toBeLessThanOrEqual(2);
  });
  it("a clear row is the record's claim under the id Noticed's card gets", () => {
    const w = fx.find((x) => clear(x, "alc:sleep") || clear(x, "alc:energy"))!, key = clear(w, "alc:sleep") ? "alc:sleep" : "alc:energy";
    const c = evidenceClaim(key, w.ev.get(key)!, "Drinks → sleep")!;
    const f = effectFindings(w.facts, SUPPS).found.find((x) => x.id === `fx-${key.replace(":", "-")}`);
    expect(c.id).toBe(`noticed:${key}`);
    if (f) expect(noticedClaim(f, "")!.id).toBe(c.id);
  });
  it("the words: clear, likely, early, no effect", () => {
    const base = { status: "checking", b: 0.8, enough: true, p: 0.03, replicated: true, o: { minEffect: 0.5 } } as unknown as Parameters<typeof wordOf>[0];
    expect(wordOf({ ...base, status: "found" })).toBe("clear");
    expect(wordOf(base)).toBe("likely");
    expect(wordOf({ ...base, replicated: false })).toBe("early");
    expect(wordOf({ ...base, p: 0.2 })).toBe("early");
    expect(wordOf({ ...base, status: "none" })).toBe("no effect");
    expect([twinOf("supp-mag-sleep"), twinOf("weekend-mood"), twinOf("caf-sleep")]).toEqual(["supp-mag:sleep", null, "late-caf:sleep"]);
  });
});
