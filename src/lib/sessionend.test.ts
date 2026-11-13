// PLAN 216 — how a session ended. Each way, kept or (for older ones) worked out; the control: one you finished yourself.
import { describe, expect, it } from "vitest";
import { howItEnded, sessionParts } from "./sessionend";
import type { Workout } from "./types";

const t = (h: number, m = 0) => new Date(2026, 10, 12, h, m).getTime();
const cardio = (o: Partial<Workout>): Workout => ({ id: "c", template: "Cardio", kind: "cardio", startedAt: t(18), endedAt: t(18, 42), cardio: { what: "Incline walk" }, ...o });

describe("how a session ended (PLAN 216)", () => {
  it("your heart rate came down: the last working minute, the 15 minutes, when the app noticed", () => {
    const e = howItEnded(cardio({ autoEnded: true, ended: { by: "heart", noticed: t(21, 5), line: 96 } }), { others: [], lastSet: null })!;
    expect(e.by).toBe("heart");
    expect(e.words).toBe("Ended by itself: your heart rate was last at working level (96 bpm or more) at 18:41. After 15 minutes under it, the app counted the session over from 18:42. The app noticed at 21:05 — it checks only while it's open, then sets the end back to when it happened.");
  });
  it("older ones worked out: the 3-hour cap; the heart; an hour with no set; the next workout started", () => {
    expect(howItEnded(cardio({ autoEnded: true, endedAt: t(21) }), { others: [], lastSet: null })!.by).toBe("timer");
    expect(howItEnded(cardio({ autoEnded: true }), { others: [], lastSet: null, line: 96 })!.words).toMatch(/^Ended by itself: your heart rate was last at working level \(96 bpm or more\) at 18:41\. .* It checks only while the app is open, so it may have noticed later\.$/);
    const lift: Workout = { id: "l", template: "Upper A", startedAt: t(17), endedAt: t(18, 2) };
    expect(howItEnded(lift, { others: [], lastSet: t(18) })!.words).toBe("Ended by itself: no set for an hour, so it ended 2 minutes after your last one (18:00), at 18:02.");
    expect(howItEnded(cardio({}), { others: [{ id: "n", template: "Upper A", startedAt: t(18, 42), endedAt: null }], lastSet: null })!.by).toBe("next");
  });
  it("control: you finished it — said plainly, not as the app's doing", () => {
    const e = howItEnded(cardio({}), { others: [], lastSet: null })!;
    expect([e.by, e.auto, e.words]).toEqual(["you", false, "You finished it at 18:42."]);
  });
});

// PLAN 217 — a lifting session with cardio after, in its parts; the control: one without cardio stays one part
describe("a session's parts (PLAN 217)", () => {
  const lift = (o: Partial<Workout> = {}): Workout => ({ id: "l", template: "Upper A", startedAt: t(17), endedAt: t(18, 20), ...o });
  it("lifting, then the cardio after it, each with its own times", () => {
    expect(sessionParts(lift({ cardio: { what: "Stairmaster", startedAt: t(17, 40), done: true, at: t(18, 20) } }))).toEqual([
      { name: "Upper A", start: t(17), end: t(17, 40), cardio: false },
      { name: "Stairmaster", start: t(17, 40), end: t(18, 20), cardio: true },
    ]);
  });
  it("cardio started and never closed: it runs to the session's end, said as unsaved", () => {
    expect(sessionParts(lift({ endedAt: t(17, 32), cardio: { what: "Stairmaster", startedAt: t(17, 40) } }))).toEqual([
      { name: "Upper A", start: t(17), end: t(17, 40), cardio: false },
      { name: "Stairmaster", start: t(17, 40), end: t(17, 40), cardio: true, noEnd: true },
    ]);
    expect(sessionParts(lift({ cardio: { what: "Stairmaster", startedAt: t(17, 40) } }))[1]).toEqual({ name: "Stairmaster", start: t(17, 40), end: t(18, 20), cardio: true, noEnd: true });
  });
  it("control: no cardio, cardio planned but not started, skipped, or a cardio session: one part", () => {
    expect(sessionParts(lift())).toEqual([{ name: "Upper A", start: t(17), end: t(18, 20), cardio: false }]);
    expect(sessionParts(lift({ cardio: { what: "Stairmaster" } }))).toHaveLength(1);
    expect(sessionParts(lift({ cardio: { what: "Stairmaster", done: false, at: t(18) } }))).toHaveLength(1);
    expect(sessionParts(cardio({}))).toEqual([{ name: "Incline walk", start: t(18), end: t(18, 42), cardio: true }]);
  });
});
