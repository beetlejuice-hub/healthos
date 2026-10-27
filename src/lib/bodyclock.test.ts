// PLAN 177, body lab 6 — owner, 27 Oct: body clock + slump ping "yea".
import { describe, expect, it } from "vitest";
import { bodyClock, clockOf, slumpOf } from "./bodyclock";
import type { Night } from "./sleep";
import { addDays, atMinute } from "./time";
import type { Entry } from "./types";

const today = "2026-10-27";
function rng(seed: number) {
  let s = seed >>> 0;
  const r = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { r, g: () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()) };
}
/** 30 days, 4 check-ins a day at random times 08:00–22:00. Planted: focus 10:00–12:00 +2; energy 15:00–16:00 −2.5. */
function checks(seed: number, plant: { focus?: boolean; slump?: boolean } = {}): Entry[] {
  const { r, g } = rng(seed), out: Entry[] = [];
  for (let i = 30; i >= 1; i--) for (let k = 0; k < 4; k++) {
    const m = 8 * 60 + Math.floor(r() * 14 * 60), h = Math.floor(m / 60), day = addDays(today, -i);
    const focus = Math.round(Math.max(1, Math.min(10, 6 + (plant.focus && h >= 10 && h < 12 ? 2 : 0) + g())));
    const energy = Math.round(Math.max(1, Math.min(10, 6.5 + (plant.slump && h === 15 ? -2.5 : 0) + g())));
    out.push({ id: `${i}-${k}`, kind: "feel", at: atMinute(day, m), focus, energy } as Entry);
  }
  return out;
}
const count = (f: (s: number) => boolean) => Array.from({ length: 20 }, (_, s) => f(s + 1)).filter(Boolean).length;

describe("the body clock (PLAN 177)", () => {
  it("sleep from the band: falling asleep ~00:40, waking ~08:20, the middle ~04:30, the night low ~04:10, weekends later", () => {
    const ns: Night[] = Array.from({ length: 30 }, (_, i) => {
      const eve = addDays(today, -i - 1), we = [5, 6].includes(new Date(`${eve}T12:00:00`).getDay()) ? 60 : 0;
      const onset = atMinute(addDays(eve, 1), 40 + we), wake = atMinute(addDays(eve, 1), 8 * 60 + 20 + we);
      return { id: eve, eve, day: addDays(eve, 1), onset, wake, lowAt: atMinute(addDays(eve, 1), 4 * 60 + 10) } as Night;
    });
    const c = bodyClock(ns, [], today);
    expect([clockOf(c.sleep!.onset), clockOf(c.sleep!.wake), clockOf(c.sleep!.mid), clockOf(c.low!)]).toEqual(["00:40", "08:20", "04:30", "04:10"]);
    expect(c.shift).toBe(60);
    expect(bodyClock(ns.slice(0, 5), [], today).sleep).toBeNull();
  });
  it("planted: focus best 10:00–12:00 (+2) — found in 19+ of 20; control: a window named (likely or clear) in at most 2 of 20", () => {
    const c = bodyClock([], checks(3, { focus: true }), today);
    expect([c.focus!.from, c.focus!.to]).toEqual([10, 12]); expect(c.focus!.mean - c.focus!.rest).toBeGreaterThan(1.5);
    expect(count((s) => { const f = bodyClock([], checks(s, { focus: true }), today).focus; return !!f && f.from === 10 && (f.sure === "clear" || f.sure === "likely"); })).toBeGreaterThanOrEqual(19);
    expect(count((s) => { const f = bodyClock([], checks(s + 100), today).focus; return !!f && (f.sure === "clear" || f.sure === "likely"); })).toBeLessThanOrEqual(2);
  });
  it("planted: energy dips 15:00–16:00 — the slump the ping uses, in 18+ of 20; control: none in 18+ of 20", () => {
    expect(slumpOf(checks(5, { slump: true }), today)).toMatchObject({ from: 15, to: 16 });
    expect(count((s) => slumpOf(checks(s, { slump: true }), today)?.from === 15)).toBeGreaterThanOrEqual(18);
    expect(count((s) => slumpOf(checks(s + 200), today) == null)).toBeGreaterThanOrEqual(18);
  });
  it("too few check-ins: no window, no slump", () => {
    const few = checks(7, { focus: true, slump: true }).slice(0, 15);
    expect([bodyClock([], few, today).focus, slumpOf(few, today)]).toEqual([null, null]);
  });
});
