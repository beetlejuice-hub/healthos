import { describe, expect, it } from "vitest";
import { isSaved, savedFollowups, SAVED, toggleSaved } from "./saved";
import type { DigestItem } from "./tasks";
import { DAY } from "../time";

// PLAN 159 — owner, 21 Oct: "liked the study, thing to try … can make it better if possible".
const NOW = new Date(2026, 9, 21, 9, 0).getTime();
const item = (title: string, more: Partial<DigestItem> = {}): DigestItem => ({ type: "try", title, text: "…", ...more });

describe("saved for later", () => {
  it("a tap saves it, the same title again unsaves it; newest first", () => {
    let l = toggleSaved([], item("Glycine before bed", { tip: "Try 3 g tonight" }), "morning", "2026-10-21", NOW);
    l = toggleSaved(l, item("Box breathing"), "evening", "2026-10-21", NOW + 1);
    expect(l.map((s) => s.title)).toEqual(["Box breathing", "Glycine before bed"]);
    expect(l[1]).toMatchObject({ from: "morning", day: "2026-10-21", savedAt: NOW, tip: "Try 3 g tonight" });
    expect(isSaved(l, { title: " glycine BEFORE bed " })).toBe(true);
    expect(toggleSaved(l, item("Glycine before bed"), "morning", "2026-10-22", NOW + 2).map((s) => s.title)).toEqual(["Box breathing"]);
  });
  it("keeps the newest 30", () => {
    let l: ReturnType<typeof toggleSaved> = [];
    for (let i = 0; i < SAVED.max + 5; i++) l = toggleSaved(l, item(`Item ${i}`), "morning", "2026-10-21", NOW + i);
    expect(l).toHaveLength(SAVED.max);
    expect(l[0].title).toBe(`Item ${SAVED.max + 4}`);
  });
  it("a follow-up only for one not tried, saved 2+ days ago — given a chance first", () => {
    const l = [
      { ...item("Fresh"), id: "a", savedAt: NOW - 1 * DAY, from: "morning" as const, day: "x" },
      { ...item("Glycine before bed", { tip: "Try 3 g tonight" }), id: "b", savedAt: new Date(2026, 9, 18, 8, 0).getTime(), from: "morning" as const, day: "x" },
      { ...item("Already tried"), id: "c", savedAt: NOW - 5 * DAY, from: "evening" as const, day: "x", tried: NOW - DAY },
    ];
    expect(savedFollowups(l, NOW)).toEqual(['you saved this Sun 18 Oct: Glycine before bed — "Try 3 g tonight"']);
    expect(savedFollowups(undefined, NOW)).toEqual([]);
  });
});
