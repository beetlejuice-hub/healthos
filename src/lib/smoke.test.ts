// PLAN 177 — owner, 27 Oct: "a small tick that says cigarettes...or like a better way to track smoking days and not" —
// "cigarettes lets do B" ("i may not log them immediately"): one question at night, the morning catch-up if missed.
import { describe, expect, it } from "vitest";
import type { Entry } from "./types";
import { atMinute, addDays } from "./time";
import { SMOKE_UNSURE, smokeAsk, smokeEntry, smokeSaid } from "./smoke";
import { dailyFacts } from "./insights";
import { DEFAULT_SETTINGS } from "./store";
import { scout } from "./scout";
import { feelWorld, rng } from "./bench";
import { leadTest } from "./ai/lead";
import { dayLine } from "./ai/context";

const D = "2026-10-27";
const at = (day: string, hm: string) => atMinute(day, Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3)));
const said = (day: string, band: Parameters<typeof smokeEntry>[1], id = `s${day}`): Entry => ({ id, ...smokeEntry(day, band) });

describe("cigarettes, one question a day", () => {
  it("asked from 20:00 about today; past midnight still about the evening ending; the morning about yesterday; not in the afternoon", () => {
    expect(smokeAsk([], at(D, "19:59"))).toBeNull();
    expect(smokeAsk([], at(D, "20:00"))).toEqual({ day: D, when: "tonight" });
    expect(smokeAsk([], at(D, "01:30"))).toEqual({ day: addDays(D, -1), when: "tonight" });
    expect(smokeAsk([], at(D, "09:00"))).toEqual({ day: addDays(D, -1), when: "yesterday" });
    expect(smokeAsk([], at(D, "15:00"))).toBeNull();
  });
  it("never twice: answered tonight, it's gone tonight and tomorrow morning", () => {
    const es = [said(D, "3-5")];
    expect(smokeAsk(es, at(D, "22:00"))).toBeNull();
    expect(smokeAsk(es, at(addDays(D, 1), "08:00"))).toBeNull();
    expect(smokeAsk(es, at(addDays(D, 1), "21:00"))).toEqual({ day: addDays(D, 1), when: "tonight" });
  });
  it("answered after midnight, it's kept on the evening's day; the latest answer wins", () => {
    expect(smokeEntry(addDays(D, -1), "1-2").at).toBe(at(addDays(D, -1), "21:00"));
    expect(smokeSaid([said(D, "1-2", "a"), { ...said(D, "6+", "b"), at: at(D, "21:05") }]).get(D)).toBe("6+");
  });
  it("in the day's facts as a number (the band's middle); a day not answered is unknown, not smoke-free", () => {
    const f = dailyFacts([said(D, "3-5"), said(addDays(D, -1), "0")], [], DEFAULT_SETTINGS, addDays(D, -2), D);
    expect(f.map((d) => d.cigs)).toEqual([null, 0, 4]);
  });
  it("“Don't remember” (reform T1): not asked again, and the day stays unknown — never smoke-free", () => {
    const es = [said(addDays(D, -1), SMOKE_UNSURE)];
    expect(smokeAsk(es, at(D, "09:00"))).toBeNull();
    expect(smokeSaid(es).has(addDays(D, -1))).toBe(false);
    expect(dailyFacts(es, [], DEFAULT_SETTINGS, addDays(D, -1), addDays(D, -1))[0].cigs).toBeNull();
  });
  it("the AI reads it plainly", () => {
    const [none, some] = dailyFacts([said(D, "3-5"), said(addDays(D, -1), "0")], [], DEFAULT_SETTINGS, addDays(D, -1), D);
    expect(dayLine(none, new Map())).toContain("no cigarettes");
    expect(dayLine(some, new Map())).toContain("cigarettes 3–5");
  });

  // planted: smoking days (answered 3–5) and a lower energy the next day; control: the same answers, no effect
  function smokeWorld(seed: number, drop: number) {
    const f = feelWorld({ seed, days: 90 });
    const { r } = rng(seed + 9);
    let smoked = false;
    for (const d of f) { if (smoked && d.energy != null) d.energy = Math.max(1, d.energy - drop); smoked = r() < 0.3; d.cigs = smoked ? 4 : 0; }
    return f;
  }
  it("planted: the pattern finder finds smoking → next-day energy, and Test it is 'No cigarettes'; control: not found", () => {
    let found = 0, control = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const p = scout(smokeWorld(seed, 2), []).find((x) => x.a.id === "smoke" && x.b.id === "energy" && x.lag === 1);
      if (p) { found++; expect(leadTest(p)).toMatchObject({ name: "No cigarettes — does energy lift?", measure: "energy" }); }
      if (scout(smokeWorld(seed, 0), []).some((x) => x.a.id === "smoke" && x.b.id === "energy")) control++;
    }
    expect(found).toBeGreaterThanOrEqual(17);
    expect(control).toBeLessThanOrEqual(2);
  });
});
