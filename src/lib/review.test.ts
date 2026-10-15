import { describe, expect, it } from "vitest";
import { dueReviews, mondayOf, weekFacts, weekLines } from "./review";
import { DEFAULT_SETTINGS } from "./store";
import { addDays, atMinute } from "./time";
import type { Entry } from "./types";

const at = (day: string, h: number, m = 0) => atMinute(day, h * 60 + m);

describe("when a read is due (PLAN 65)", () => {
  // Mon 19 Oct 2026; the week before is 12–18 Oct
  it("the week just gone: from Monday 06:00, not a minute before", () => {
    expect(mondayOf("2026-10-15")).toBe("2026-10-12");
    expect(dueReviews(at("2026-10-19", 5, 59), [])).toEqual([]);
    expect(dueReviews(at("2026-10-19", 6), [])).toEqual([{ kind: "week", key: "2026-10-12", from: "2026-10-12", to: "2026-10-18" }]);
  });
  it("opened later in the week: written then; once written, not again", () => {
    expect(dueReviews(at("2026-10-22", 21), []).map((d) => d.key)).toEqual(["2026-10-12"]);
    expect(dueReviews(at("2026-10-25", 23, 59), []).map((d) => d.key)).toEqual(["2026-10-12"]); // Sunday night: still last week's
    expect(dueReviews(at("2026-10-22", 21), ["week:2026-10-12"])).toEqual([]);
    expect(dueReviews(at("2026-10-26", 0, 1), ["week:2026-10-12"])).toEqual([]); // Monday after midnight: the next one waits for 06:00
    expect(dueReviews(at("2026-10-26", 6), ["week:2026-10-12"]).map((d) => d.key)).toEqual(["2026-10-19"]);
  });
  it("the month just gone: from the 1st 06:00, for a week; a Monday the 1st gets both", () => {
    expect(dueReviews(at("2026-11-01", 5), ["week:2026-10-19"])).toEqual([]);
    expect(dueReviews(at("2026-11-01", 6), ["week:2026-10-19"])).toEqual([{ kind: "month", key: "2026-10", from: "2026-10-01", to: "2026-10-31" }]);
    expect(dueReviews(at("2026-11-07", 12), ["week:2026-10-26"]).map((d) => d.key)).toEqual(["2026-10"]);
    expect(dueReviews(at("2026-11-08", 12), ["week:2026-10-26"])).toEqual([]);
    expect(dueReviews(at("2027-02-01", 7), []).map((d) => `${d.kind} ${d.from}–${d.to}`)).toEqual(["week 2027-01-25–2027-01-31", "month 2027-01-01–2027-01-31"]);
    expect(dueReviews(at("2027-01-01", 9), []).find((d) => d.kind === "month")).toMatchObject({ from: "2026-12-01", to: "2026-12-31", key: "2026-12" });
  });
});

describe("the week's numbers (PLAN 65)", () => {
  /** 10 weeks to Sun 18 Oct: mood about 6 a day, the last week 7.5; about 2,400 kcal a day (±120), the last Sunday 2,600; trained Mon/Thu. */
  function world() {
    const entries: Entry[] = [], workouts: { id: string; template: string; startedAt: number; endedAt: number }[] = [];
    let n = 0;
    for (let i = 69; i >= 0; i--) {
      const d = addDays("2026-10-18", -i), last = i < 7, wobble = [0.3, -0.2, 0.1, -0.4, 0.2, 0, -0.1][i % 7];
      entries.push({ id: `f${n++}`, kind: "feel", at: at(d, 14), mood: (last ? 7.5 : 6) + wobble } as Entry);
      entries.push({ id: `k${n++}`, kind: "food", at: at(d, 13), name: "x", grams: 100, macros: { kcal: d === "2026-10-18" ? 2600 : Math.round(2400 + ((((Math.sin(i * 12.9898) * 43758.5453) % 1) + 1) % 1 - 0.5) * 400), p: 150, c: 250, f: 80 } } as Entry);
      const dow = new Date(at(d, 12)).getDay();
      if (dow === 1 || dow === 4) {
        const id = `w${n++}`; workouts.push({ id, template: "Full", startedAt: at(d, 18), endedAt: at(d, 19) });
        for (let k = 0; k < 3; k++) entries.push({ id: `s${n++}`, kind: "set", at: at(d, 18, 5 + k), workoutId: id, exercise: "Bench press", kg: 80, reps: 5 } as Entry);
      }
    }
    return { entries, workouts };
  }
  const w = world();
  const f = weekFacts(w.entries, w.workouts as never, DEFAULT_SETTINGS, { kcal: 2400, p: 160, c: 300, f: 80 }, "2026-10-12", "2026-10-18");
  const row = (k: string) => f.rows.find((r) => r.k === k)!;

  it("planted: a mood week of 7.5 against a usual 6 reads higher, the better way, each day shaded better", () => {
    expect(row("mood").value).toBeCloseTo(7.5, 0);
    expect(row("mood").usual).toBeCloseTo(6, 0);
    expect([row("mood").state, row("mood").better]).toEqual(["hi", true]);
    expect(row("mood").shades.every((s) => s.tone === "better")).toBe(true);
  });
  it("the week is over: Sunday's calories count (At a glance would leave today's out)", () => {
    expect(row("kcal").days).toHaveLength(7);
    expect(row("kcal").days[6]).toBe(2600);
    expect(row("kcal").state).toBe("ok");
    expect(f.food).toMatchObject({ days: 7, onGoal: 7, proteinHit: 0 });
  });
  it("training, best and worst days, and the lines the AI gets", () => {
    expect(f.training).toMatchObject({ sessions: 2, sets: 6, usualSessions: 2 });
    expect(f.best).toBeNull(); // 7.1–7.8: no day a full point apart — nothing to call best and worst
    const lines = weekLines(f).join("\n");
    expect(lines).toContain("## The week 12 Oct–18 Oct");
    expect(lines).toMatch(/\[mood\] Mood: 7\.\d\/10 \(usual 6\.\d\), higher than usual — the better way; each day: Mon 7\.\d/);
    expect(lines).toMatch(/\[kcal\] Calories: 2,4\d\d kcal \(usual 2,[34]\d\d\), about usual; each day: Mon [\d,]+, .* Sun 2,600/);
    expect(lines).toContain("Training: 2 sessions, 6 working sets (usual 2.0 sessions a week)");
  });
});
