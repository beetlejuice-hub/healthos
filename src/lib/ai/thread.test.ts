import { describe, expect, it } from "vitest";
import { byDay, foldLine } from "./thread";

// owner, 16 Oct: "also i feel like chats should be deleted? or like collapsed or whatever"
const at = (d: string, hm: string) => new Date(`2026-10-${d}T${hm}:00`).getTime();
const item = (d: string, hm: string, seen = true) => ({ at: at(d, hm), seen });

describe("the AI tab folds old days", () => {
  const now = at("16", "09:00");
  it("today open; older days folded; in time order, one group a day", () => {
    const g = byDay([item("16", "08:10"), item("14", "10:00"), item("14", "10:05"), item("15", "12:00")], now, (x) => !x.seen);
    expect(g.map((x) => [x.day, x.open, x.items.length])).toEqual([["2026-10-14", false, 2], ["2026-10-15", false, 1], ["2026-10-16", true, 1]]);
  });
  it("a day with something you haven't seen stays open", () => {
    expect(byDay([item("14", "10:00", false), item("15", "12:00")], now, (x) => !x.seen).map((x) => x.open)).toEqual([true, false]);
  });
  it("a chat that ran past midnight stays open the next morning (the last 6 hours)", () => {
    expect(byDay([item("15", "23:40"), item("16", "00:10")], at("16", "01:00"), () => false).map((x) => x.open)).toEqual([true, true]);
    expect(byDay([item("15", "23:40")], at("16", "09:00"), () => false)[0].open).toBe(false);
  });
});

describe("a folded day's line", () => {
  it("what you asked first, short; else how it started; Markdown off", () => {
    expect(foldLine([{ mine: false, text: "📰 **Creatine** and sleep" }, { mine: true, text: "why am I flat in the afternoon when I sleep 7 hours and eat well?" }])).toBe("why am I flat in the afternoon when I sleep 7…");
    expect(foldLine([{ mine: false, text: "📰 **Creatine and sleep loss**" }])).toBe("📰 Creatine and sleep loss");
    expect(foldLine([])).toBe("");
  });
});
