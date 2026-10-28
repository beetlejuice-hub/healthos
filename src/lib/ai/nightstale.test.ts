// The night read against what's logged since (owner, 28 Oct: "i ate around 1900 kcal (160 left), yet ai digest says i ate
// 650 something calories"). Planted: read written at 21:09 from 671 kcal; dinner logged after it with the "Dinner · 19:00"
// chip (timed before the read) — the old check (entries timed after the read) missed it; this one must not. Controls: a
// small snack isn't worth a line; nothing logged since says nothing; a read from before `tot` reads its own numbers.
import { describe, expect, it } from "vitest";
import { dayTotals, nightStale, STALE } from "./nightread";
import type { Entry } from "../types";

const at = (hm: string, day = "2026-10-28") => new Date(`${day}T${hm}:00`).getTime();
const food = (id: string, hm: string, kcal: number, p: number, day?: string): Entry => ({ id, kind: "food", at: at(hm, day), name: id, grams: 100, macros: { kcal, p, c: 0, f: 0 } });
const DAY = [food("oats", "08:30", 380, 14), food("tuna", "13:00", 291, 44)]; // 671 kcal, 58 g
const READ = { day: "2026-10-28", at: at("21:09"), tot: { kcal: 671, p: 58 } };

describe("the night read's numbers against the day now", () => {
  it("dinner logged after the read, timed 19:00: says so, with the day's numbers, and it's worth writing again", () => {
    const s = nightStale(READ, [...DAY, food("dinner", "19:00", 1330, 30)]);
    expect(s).toEqual({ now: { kcal: 2001, p: 88 }, kcal: 1330, p: 30, redo: true });
    // the old rule — anything timed after the read — sees nothing here: the bug
    expect([...DAY, food("dinner", "19:00", 1330, 30)].some((e) => e.at > READ.at)).toBe(false);
  });
  it("controls: nothing since → nothing; a 60 kcal snack → nothing; a 200 kcal one → a line, not a rewrite", () => {
    expect(nightStale(READ, DAY)).toBeNull();
    expect(nightStale(READ, [...DAY, food("plum", "21:30", 60, 1)])).toBeNull();
    expect(nightStale(READ, [...DAY, food("bar", "21:30", 200, 8)])).toMatchObject({ kcal: 200, redo: false });
  });
  it("the day runs 04:00 to 04:00, food and drinks, as Today counts them — a beer at 00:40 is that evening's, the next morning's breakfast isn't", () => {
    const beer: Entry = { id: "beer", kind: "drink", at: at("00:40", "2026-10-29"), name: "Beer", ml: 500, kcal: 215, p: 2, caffeineMg: 0, alcoholG: 20 } as Entry;
    expect(dayTotals([...DAY, beer, food("next", "08:00", 400, 20, "2026-10-29")], "2026-10-28")).toEqual({ kcal: 886, p: 60 });
  });
  it("a read from before the totals were kept: its own words are the numbers it was written from", () => {
    const old = { day: "2026-10-28", at: at("21:09"), summary: "Light eating day so far: 671 kcal and 58 g protein by 21:09, against goals of 2,160 and 160." };
    expect(nightStale(old, [...DAY, food("dinner", "19:00", 1330, 30)])).toMatchObject({ kcal: 1330, p: 30, redo: true });
    expect(nightStale({ ...old, summary: "A big day: 2,001 kcal and 88 g protein." }, [...DAY, food("dinner", "19:00", 1330, 30)])).toBeNull();
    expect(STALE.redoMax).toBe(1);
  });
});
