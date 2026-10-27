// PLAN 176 — owner, 27 Oct: "Rn it just summarizes my day and tells me to eat more protein and sleep better basically" ·
// "really have to make ai smarter. more likely for graphs and connections between things and research/studies".
import { describe, expect, it } from "vitest";
import { feelWorld, rng } from "../bench";
import { scout, signals } from "../scout";
import type { DayFacts } from "../insights";
import { LEAD, leadLines, leadSeries, pickLead, withLead } from "./lead";
import { addDays } from "../time";
import { morningBrief } from "./brief";
import { SYSTEM, type DigestItem } from "./tasks";

/** A fake person where big meals pull next-day mood down by `drop` points (as scout.test's). */
function bigMealWorld(seed: number, drop: number, days = 90): DayFacts[] {
  const f = feelWorld({ seed, days });
  f.forEach((d, i) => { d.day = addDays("2026-07-29", i); }); // real dates (the bench's are "d0", "d1"…)
  const { r } = rng(seed + 1000);
  f.forEach((d) => { if (d.kcal != null) d.bigMealKcal = Math.round(500 + r() * 800); });
  for (let i = 1; i < f.length; i++) if (f[i - 1].bigMealKcal != null && f[i - 1].bigMealKcal! > 1000 && f[i].mood != null) f[i].mood = Math.max(1, f[i].mood! - drop);
  return f;
}

describe("today's lead (PLAN 176)", () => {
  const f = bigMealWorld(3, 2), today = f.at(-1)!.day, patterns = scout(f, []);
  const planted = (p: { a: { id: string }; b: { id: string }; lag: number } | null) => p?.a.id === "bigMeal" && p.b.id === "mood" && p.lag === 1;

  it("planted: big meals → worse mood the next day is the lead, said with its numbers and what the read must do with it", () => {
    const p = pickLead(patterns, [], today)!;
    expect(planted(p)).toBe(true);
    const lines = leadLines(p).join("\n");
    expect(lines).toMatch(/^## Today's lead — a link the app found and tested in their own data/);
    expect(lines).toMatch(/rank correlation -0\.\d\d over \d+ days \(p [<\d.]/);
    expect(p.p).toBeLessThan(LEAD.maxP);
    expect(lines).toMatch(/held on \d+ of \d+ days/);
    expect(lines).toContain("biggest meal one day, mood the next.");
    expect(lines).toContain("Search the web for WHY it might happen");
  });
  it("a lead featured in the last 3 weeks rests; after that it can lead again", () => {
    const p = pickLead(patterns, [], today)!;
    const rested = pickLead(patterns, [{ id: p.id, day: today }], today);
    expect(rested?.id).not.toBe(p.id);
    expect(pickLead(patterns, [{ id: p.id, day: "2000-01-01" }], today)!.id).toBe(p.id);
  });
  it("planted, across 30 people: the link leads for nearly all of them (90 days)", () => {
    let found = 0;
    for (let seed = 1; seed <= 30; seed++) if (planted(pickLead(scout(bigMealWorld(seed, 2), []), [], "2026-10-27"))) found++;
    expect(found).toBeGreaterThanOrEqual(26);
  });
  it("control: nothing planted, 100 people — a chance lead for at most a few (scout alone flags one for about half)", () => {
    let leads = 0, flagged = 0;
    for (let seed = 1; seed <= 100; seed++) { const ps = scout(bigMealWorld(seed, 0), []); if (ps.length) flagged++; const p = pickLead(ps, [], "2026-10-27"); if (p) leads++; expect(planted(p)).toBe(false); }
    expect(leads).toBeLessThanOrEqual(5);
    expect(flagged).toBeGreaterThan(leads * 3); // the bar is what keeps them out
  });
  it("its chart: biggest meal each day, mood the next — the planted days line up", () => {
    const p = pickLead(patterns, [], today)!, yesterday = f.at(-1)!.day;
    const s = leadSeries({ id: p.id, a: p.a.id, b: p.b.id, lag: p.lag }, f, signals([]), yesterday)!;
    expect(s.days).toHaveLength(14);
    expect(s.days.at(-1)).toBe(f.at(-2)!.day); // a's last day is the day before yesterday; b is yesterday's
    const pairs = s.a.vals.map((v, i) => [v, s.b.vals[i]] as const).filter(([a, b]) => a != null && b != null);
    const hi = pairs.filter(([a]) => a! > 1000).map(([, b]) => b!), lo = pairs.filter(([a]) => a! <= 1000).map(([, b]) => b!);
    if (hi.length && lo.length) expect(hi.reduce((x, y) => x + y, 0) / hi.length).toBeLessThan(lo.reduce((x, y) => x + y, 0) / lo.length);
  });
  it("the read's connection item gets the lead (so the app draws it); none without a connection or pattern", () => {
    const p = pickLead(patterns, [], today)!;
    const items = [{ type: "try", title: "t", text: "" }, { type: "connection", title: "c", text: "" }, { type: "study", title: "s", text: "" }] as DigestItem[];
    expect(withLead(items, p).map((i) => i.lead?.id ?? null)).toEqual([null, p.id, null]);
    expect(withLead([{ type: "pattern", title: "p", text: "" }] as DigestItem[], p)[0].lead).toEqual({ id: p.id, a: "bigMeal", b: "mood", lag: 1 });
    expect(withLead([{ type: "try", title: "t", text: "" }] as DigestItem[], p)[0].lead).toBeUndefined();
  });
  it("the morning's pattern item is the lead — or its third, on a morning the night check flagged", () => {
    const plain = morningBrief("2026-10-27", [], [], Date.parse("2026-10-27T08:00:00"), { night: null, vo2: null }, true).join("\n");
    expect(plain).toMatch(/Angle for the "pattern" item: Today's lead — a "connection"/);
    const flagged = morningBrief("2026-10-27", [], [], Date.parse("2026-10-27T08:00:00"), { night: "breathing 2 above usual", vo2: null }, true).join("\n");
    expect(flagged).toMatch(/Angle for the "pattern" item: Last night's night check/);
    expect(flagged).toMatch(/Third item today: Today's lead/);
    expect(morningBrief("2026-10-27", [], [], Date.parse("2026-10-27T08:00:00")).join("\n")).not.toContain("Today's lead");
  });
});

describe("never the obvious; the chat goes deep (PLAN 176)", () => {
  it("every task is told: no protein-and-sleep advice without something they didn't know", () => {
    for (const t of ["digest", "night", "chat", "dive", "supplement", "review"] as const) expect(SYSTEM[t]).toContain("Never the obvious");
    expect(SYSTEM.digest).toContain("would a friend who listens to health podcasts already know this?");
  });
  it("the chat: short for quick questions, 150–350 words with studies and how to test it for habits, supplements, foods, protocols", () => {
    expect(SYSTEM.chat).not.toContain("Keep replies under 120 words unless they ask for detail");
    expect(SYSTEM.chat).toMatch(/gets a real one, 150–350 words/);
    expect(SYSTEM.chat).toMatch(/search the web — cite 1–3 with their links/);
  });
});
