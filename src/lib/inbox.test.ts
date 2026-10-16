import { describe, expect, it } from "vitest";
import { askable, DAILY_CAP, diffWords, findingNotice, findings, pickNew, raisedNotice, readinessNotice, type Notice } from "./inbox";
import type { Readiness } from "./readiness";
import type { Cell } from "./sleep";
import { raisedStretches, whyRaised } from "./heart";
import { usualByHour } from "./hrusual";
import { rng } from "./bench";
import { FACTORS, goesWith, OUTCOMES, type Evening, type Night } from "./sleep";
import { addDays, atMinute, localDay } from "./time";
import type { HrMinute } from "./band";

const MIN = 60_000, H = 3_600_000, TODAY = "2026-10-15";
const at = (day: string, h: number) => atMinute(day, Math.round(h * 60));

/**
 * 15 days of a band's minutes, 08:00–22:00, around 66 bpm. Today, planted: +18 from 14:10 to 14:50 (a "very" stretch),
 * +7 from 10:00 to 10:25 (slight and short), +8 from 16:00 to 16:50 (slight but long).
 */
function band(seed = 4) {
  const { g } = rng(seed), hr: HrMinute[] = [];
  for (let k = 14; k >= 0; k--) {
    const day = addDays(TODAY, -k);
    for (let t = at(day, 8); t < at(day, k === 0 ? 20 : 22); t += MIN) {
      const h = (t - at(day, 0)) / H, plant = k === 0 ? (h >= 14 + 10 / 60 && h < 14 + 50 / 60 ? 18 : h >= 10 && h < 10 + 25 / 60 ? 7 : h >= 16 && h < 16 + 50 / 60 ? 8 : 0) : 0;
      const v = Math.round(66 + g() * 2 + plant);
      hr.push([t, v, v - 2, v + 2]);
    }
  }
  return hr;
}
function stretches(hr: HrMinute[], now: number) {
  return raisedStretches(hr, [], [], usualByHour(hr, [], TODAY), at(TODAY, 0), now);
}

describe("heart-rate asks (owner, 15 Oct: \"hey your heart rate was pretty elevated in this time range, what were you doing\")", () => {
  const hr = band(), now = at(TODAY, 20), latest = hr.at(-1)![0], rs = stretches(hr, now);
  const find = (h: number) => rs.find((r) => Math.abs(r.start - at(TODAY, h)) < 10 * MIN)!;
  it("the planted stretches are found by the Heart page's own path", () => {
    expect([find(14.17)?.level, find(10)?.level, find(16)?.level]).toEqual(["very", "slightly", "slightly"]);
  });
  it("asked: the very one and the long slight one; not the short slight one", () => {
    expect([askable(find(14.17), [], latest, now), askable(find(16), [], latest, now), askable(find(10), [], latest, now)]).toEqual([true, true, false]);
  });
  it("not asked when something explains it: you said what you were doing, a coffee, a meal", () => {
    const r = find(14.17);
    expect(askable(r, whyRaised(r, [{ kind: "feel", at: r.start + 20 * MIN, doing: ["walk"] }]), latest, now)).toBe(false);
    expect(askable(r, whyRaised(r, [{ kind: "drink", at: r.start - 30 * MIN, caffeineMg: 95, alcoholG: 0 }]), latest, now)).toBe(false);
  });
  it("not while it may still be going (the band's last reading within 20 min of its end), nor a day later", () => {
    const r = find(16);
    expect(askable(r, [], r.end + 10 * MIN, now)).toBe(false);
    expect(askable(r, [], latest, r.end + 25 * H)).toBe(false);
  });
  it("in words: when, how much, and the question; \"yesterday\" after midnight", () => {
    const n = raisedNotice(find(14.17), now);
    expect(n.title).toMatch(/^Heart rate up 14:1\d–14:5\d$/);
    expect(n.text).toMatch(/^\+1[6-9] bpm over your usual for then, peak \d+, and nothing logged around it\. What were you doing\?$/);
    expect(raisedNotice(find(14.17), at(addDays(TODAY, 1), 8)).title).toMatch(/^Heart rate up yesterday 14:1\d/);
    expect(n.id).toBe(`raised:${find(14.17).start}`);
  });
});

describe("new findings (owner: \"new findings that i can comment on, like not x caused y, but i was doing z\")", () => {
  /** 30 nights; drinks on about a third, planted: HRV −9 ms and the lowest heart rate +5 on those nights. Nothing else. */
  function world(seed: number, effect = true) {
    const { r, g } = rng(seed), ns: Night[] = [], evs: Evening[] = [];
    for (let k = 0; k < 30; k++) {
      const eve = addDays("2026-09-10", k), day = addDays(eve, 1), bed = at(eve, 23.5), d = r() < 0.35, asleep = 450 + g() * 20;
      ns.push({ id: `n${k}`, day, eve, bed, onset: bed + 12 * MIN, wake: bed + (asleep + 20) * MIN, up: bed + (asleep + 30) * MIN, asleep, deep: 70 + g() * 8, rem: 100 + g() * 10, light: asleep - 170,
        awake: 12 + g() * 3, wakes: 2, latency: 12 + g() * 3, stages: [], low: 50 + g() + (effect && d ? 5 : 0), lowAt: bed + (4 + g() * 0.3) * H, hrv: 48 + g() * 3 - (effect && d ? 9 : 0), rhr: 54 + g(), nap: null });
      evs.push({ drinks: d ? [bed - 2 * H] : [], caffeineAtBed: 0, trained: k % 3 === 0, ateLate: k % 4 === 0, rating: Math.round(7 + g()) });
    }
    return { ns, evs };
  }
  it("planted drinks → HRV and lowest heart rate: both found, in words, and nothing that wasn't planted", () => {
    const w = world(11), cells = goesWith(w.ns, w.evs), fs = findings("sleep", cells, FACTORS, OUTCOMES, Date.now());
    expect(fs.map((f) => f.id).sort()).toEqual(["finding:sleep:drinks|hrv|worse", "finding:sleep:drinks|low|worse"]);
    const hrv = fs.find((f) => f.id.includes("|hrv|"))!;
    expect(hrv.text).toMatch(/^Drinks that evening → HRV −(8|9|10)\.\d ms, on \d+ nights with it against \d+ without\. Goes with, not proof of why — anything else going on those nights\?$/);
    expect(hrv.title).toBe("New finding · sleep");
  });
  it("no effect planted: no findings across 10 different months", () => {
    let n = 0;
    for (let s = 1; s <= 10; s++) { const w = world(100 + s, false); n += findings("sleep", goesWith(w.ns, w.evs), FACTORS, OUTCOMES, 0).length; }
    expect(n).toBeLessThanOrEqual(1);
  });
  it("differences in words, every unit", () => {
    expect([diffWords(-8.94, "ms"), diffWords(24.4, "min"), diffWords(90, "clock"), diffWords(-25, "clock"), diffWords(1.25, "/10"), diffWords(0.02, "bpm"), diffWords(1.4, "×")])
      .toEqual(["−8.9 ms", "+24 min", "1 h 30 later", "25 min earlier", "+1.3 points", "±0.0 bpm", "+1.4 times"]);
  });
});

describe("a low morning (owner, 15 Oct: \"can do\")", () => {
  const R = (score: number, cap: Readiness["cap"]): Readiness => ({ score, word: "", day: TODAY, added: 58, sleep: 80, asleep: 460, left: [], cap, parts: [
    { id: "hrv", name: "HRV this morning", got: 0, max: 20, why: "33 ms · usual 47", zone: "poor" }, { id: "rhr", name: "Resting HR", got: 0, max: 20, why: "62 bpm · usual 54", zone: "poor" },
    { id: "sleep", name: "Last night", got: 20, max: 25, why: "sleep score 80", zone: "ideal" }] });
  it("held low: says why, what stood out last night, and asks", () => {
    const n = readinessNotice(R(20, { to: 20, why: "HRV and resting heart rate both well off your usual" }), { label: "4 drinks" }, at(TODAY, 9))!;
    expect([n.id, n.kind, n.day, n.title]).toEqual([`readiness:${TODAY}`, "readiness", TODAY, "Readiness 20 this morning"]);
    expect(n.text).toBe("HRV and resting heart rate both well off your usual. Last night: 4 drinks. What happened yesterday?");
  });
  it("low without a cap names the weakest part (the bigger one on a tie); nothing stood out → not said", () => {
    expect(readinessNotice(R(55, null), null, 0)!.text).toBe("HRV this morning: 33 ms · usual 47. What happened yesterday?");
  });
  it("60 and up (fair or better): not asked", () => {
    expect(readinessNotice(R(60, null), null, 0)).toBeNull();
    expect(readinessNotice(R(59, null), null, 0)).not.toBeNull();
  });
});

describe("findings from the Mind and Training pages too (owner, 15 Oct: \"can do\")", () => {
  const cell = (factor: string, outcome: string, diff: number, nWith = 8, nWithout = 20): Cell => ({ factor, outcome, diff, nWith, nWithout, p: 0.001, sure: "clear", toward: diff < 0 ? "worse" : "better" });
  it("each page's words: days, sessions; a training finding says Training", () => {
    expect(findingNotice("mind", cell("drinks", "mood", -2), { id: "drinks", name: "Drinks the evening before" }, { id: "mood", name: "Mood", unit: "/10" }, 0).text)
      .toBe("Drinks the evening before → mood that day −2.0 points, on 8 days with it against 20 without. Goes with, not proof of why — anything else going on those days?");
    const st = findingNotice("strength", cell("carbs", "pct", 3.14, 6, 14), { id: "carbs", name: "Carbs in the 4 h before" }, { id: "pct", name: "Strength", unit: "%" }, 0);
    expect([st.title, st.text.split(",")[0]]).toEqual(["New finding · training", "Carbs in the 4 h before → strength against your trend +3.1 %"]);
    expect(st.text).toMatch(/on 6 sessions with it against 14 without/);
    expect(findingNotice("after", cell("heavy", "energy", -1.1), { id: "heavy", name: "Heavy session" }, { id: "energy", name: "Energy next day", unit: "/10" }, 0).text).toMatch(/^Heavy session → energy the next day −1\.1 points, on 8 days/);
  });
  it("what the Sleep and Heart grids already say isn't said again from Training's: trained → asleep, deep, HRV, resting HR", () => {
    const fs = [{ id: "trained", name: "Trained that day" }, { id: "heavy", name: "Heavy session" }], os = [{ id: "hrv", name: "HRV", unit: "ms" as const }, { id: "mood", name: "Mood next day", unit: "/10" as const }];
    expect(findings("after", [cell("trained", "hrv", 4), cell("trained", "mood", 0.8), cell("heavy", "hrv", -5)], fs, os, 0).map((n) => n.id).sort())
      .toEqual(["finding:after:heavy|hrv|worse", "finding:after:trained|mood|better"]);
  });
});

describe("a few a day, never repeated", () => {
  const now = at(TODAY, 18);
  const r = (k: number): Notice => ({ id: `raised:${k}`, kind: "raised", at: now, title: "", text: "" });
  const f = (k: number): Notice => ({ id: `finding:sleep:${k}`, kind: "finding", at: now, title: "", text: "" });
  it(`at most ${DAILY_CAP} new a day, counting what was already written today; heart asks first`, () => {
    expect(pickNew([f(1), f(2), r(1), r(2), f(3)], [], [], now).map((n) => n.id)).toEqual(["raised:1", "raised:2", "finding:sleep:1"]);
    expect(pickNew([f(1), f(2)], [{ ...r(9), at: now - H }, { ...f(9), at: now - 2 * H }], [], now).map((n) => n.id)).toEqual(["finding:sleep:1"]);
    expect(pickNew([f(1)], [r(7), r(8), r(9)], [], now)).toEqual([]);
    expect(pickNew([f(1)], [{ ...r(7), at: now - 24 * H }, { ...r(8), at: now - 24 * H }, { ...r(9), at: now - 24 * H }], [], now).map((n) => n.id)).toEqual(["finding:sleep:1"]); // yesterday's don't count
  });
  it("order: heart asks, then a low morning, then findings", () => {
    const low: Notice = { id: "readiness:x", kind: "readiness", at: now, title: "", text: "" };
    expect(pickNew([f(1), low, r(1), f(2)], [], [], now).map((n) => n.id)).toEqual(["raised:1", "readiness:x", "finding:sleep:1"]);
  });
  it("never the same one twice: not if it's in the inbox, not if it was sent and since removed, not twice in one batch", () => {
    expect(pickNew([f(1), r(1), f(1)], [f(2)], ["raised:1"], now).map((n) => n.id)).toEqual(["finding:sleep:1"]);
    expect(pickNew([f(2)], [{ ...f(2), at: now - 9 * 24 * H }], [], now)).toEqual([]);
  });
  it("today is the local day", () => { expect(localDay(now)).toBe(TODAY); });
});
