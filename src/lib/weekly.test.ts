import { describe, expect, it } from "vitest";
import { weekly } from "./weekly";
import { betweenWorld } from "./bench";
import { atMinute, addDays } from "./time";
import type { Entry } from "./types";

const LAST = "2026-10-01", NOW = atMinute(LAST, 23 * 60);
const feel = (day: string, h: number, mood: number, extra: Partial<Extract<Entry, { kind: "feel" }>> = {}): Entry => ({ id: `${day}-${h}`, kind: "feel", at: atMinute(day, h * 60), mood, ...extra });

describe("weekly mood summary", () => {
  it("waits for two weeks of check-ins and says when it starts", () => {
    const es = [0, 1, 2, 3, 4].flatMap((i) => [feel(addDays(LAST, -i), 9, 6), feel(addDays(LAST, -i), 17, 7)]);
    const w = weekly(es, [], new Map(), NOW);
    expect(w.ready).toBe(false);
    expect(!w.ready && w.startsOn).toBe(addDays(addDays(LAST, -4), 13));
  });

  it("this week vs last: a clear rise is 'up', a wobble is 'about the same'", () => {
    const es: Entry[] = [];
    for (let i = 0; i < 14; i++) {
      const day = addDays(LAST, -i), thisWeek = i < 7;
      es.push(feel(day, 9, thisWeek ? 8 : 5, { energy: 6 + (i % 2) }), feel(day, 17, thisWeek ? 7 : 5, { energy: 7 - (i % 2) }));
    }
    const w = weekly(es, [], new Map(), NOW);
    expect(w.ready).toBe(true);
    if (!w.ready) return;
    const mood = w.week.avgs.find((a) => a.k === "mood")!, energy = w.week.avgs.find((a) => a.k === "energy")!;
    expect(mood).toMatchObject({ now: 7.5, before: 5, dir: "up" });
    expect(energy.dir).toBe("same");
    expect(w.week.best?.name).toBe("mornings");
    expect(w.week.worst?.name).toBe("afternoons");
  });

  it("best and lowest day come with what happened on them", () => {
    const es: Entry[] = [];
    for (let i = 0; i < 14; i++) es.push(feel(addDays(LAST, -i), 12, 6));
    es.push(feel(addDays(LAST, -2), 19, 10, { doing: ["outside"] }));
    es.push(feel(addDays(LAST, -3), 19, 2), { id: "beer", kind: "drink", at: atMinute(addDays(LAST, -3), 18 * 60), name: "Beer", ml: 500, caffeineMg: 0, alcoholG: 20, kcal: 215 });
    const w = weekly(es, [{ id: "g", template: "A", startedAt: atMinute(addDays(LAST, -2), 15 * 60), endedAt: null }], new Map(), NOW);
    if (!w.ready) throw new Error("not ready");
    expect(w.week.bestDay).toMatchObject({ day: addDays(LAST, -2), what: ["gym", "outside"] });
    expect(w.week.lowDay).toMatchObject({ day: addDays(LAST, -3), what: ["alcohol"] });
  });

  it("top connection: the gym lift, from the engine (bench month)", () => {
    const { entries, workouts } = betweenWorld({ seed: 1, gymMood: 2.5, lastDay: LAST });
    const w = weekly(entries, workouts, new Map(), NOW);
    if (!w.ready) throw new Error("not ready");
    expect(w.week.top).toMatchObject({ sure: true, r: { activity: "gym", metric: "mood" } });
  });
});
