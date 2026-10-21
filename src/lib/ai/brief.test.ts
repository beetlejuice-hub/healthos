import { describe, expect, it } from "vitest";
import { ANGLES, eveningBrief, morningBrief, TRY } from "./brief";
import { checkDigest, SYSTEM } from "./tasks";
import { addDays } from "../time";

// Owner, 20 Oct: "can we make the digest messages more intereesting?" (PLAN 133) and "ai should look out for studies, workout
// splits, and supps, foods, everything and recommend me new stuff … or perhaps look at forums too" (PLAN 132).
const at = (d: string, hm = "08:00") => new Date(`${d}T${hm}:00`).getTime();
const split = [{ name: "Push" }, { name: "Pull" }, { name: "Legs" }];

describe("the morning's picks", () => {
  it("two mornings in a row never share an angle or a kind of new thing; every one comes round", () => {
    const days = Array.from({ length: 48 }, (_, k) => addDays("2026-10-01", k)), b = days.map((d) => morningBrief(d, [], [], at(d)));
    const angle = (l: string[]) => l[1], kind = (l: string[]) => l[2];
    for (let k = 1; k < b.length; k++) { expect(angle(b[k])).not.toBe(angle(b[k - 1])); expect(kind(b[k])).not.toBe(kind(b[k - 1])); }
    expect(new Set(b.map(angle)).size).toBe(ANGLES.length - 1); // no session due here: never the session angle
    expect(b.map(angle).join()).not.toMatch(/Today's session/);
    expect(new Set(b.map(kind)).size).toBe(TRY.length);
    // across a month change too
    expect(angle(morningBrief("2026-10-31", [], [], 0))).not.toBe(angle(morningBrief("2026-11-01", [], [], 0)));
  });
  it("the workout that's due, only when they've trained in the last 2 weeks; cardio isn't a split day", () => {
    const ws = [{ template: "Push", startedAt: at("2026-10-18", "18:00"), endedAt: at("2026-10-18", "19:00") }, { template: "Cardio", kind: "cardio", startedAt: at("2026-10-19", "18:00"), endedAt: at("2026-10-19", "18:40") }];
    expect(morningBrief("2026-10-20", split, ws, at("2026-10-20"))).toContain("- Today's plan: Pull is the workout that's due next");
    expect(morningBrief("2026-11-20", split, ws, at("2026-11-20")).join("\n")).not.toMatch(/Today's plan/);
  });
  it("the session angle only on a morning with a session due; otherwise the next angle", () => {
    const day = Array.from({ length: 8 }, (_, k) => addDays("2026-10-01", k)).find((d) => /Today's session/.test(morningBrief(d, split, [{ template: "Push", startedAt: at(d) - 864e5, endedAt: at(d) }], at(d))[1]))!;
    expect(morningBrief(day, split, [], at(day))[1]).toMatch(/Last night, decoded/);
  });
});

describe("the band's two in the morning's picks (PLAN 52: \"3\")", () => {
  const vo2 = (word: string) => ({ line: "VO2 max this week 44.0. +1.6 over 8 weeks, rising.", changes: [{ word: "up" }, { word }] });
  const days = Array.from({ length: 16 }, (_, k) => addDays("2026-10-01", k));
  it("a night check that's off is the angle, whatever the turn — the app's line quoted, never a diagnosis", () => {
    for (const d of days) {
      const a = morningBrief(d, [], [], at(d), { night: "Night check: skin 0.8 °C over your usual and breathing 1.9/min over your usual — together these go with getting ill.", vo2: vo2("up") })[1];
      expect(a).toMatch(/^- Angle for the "pattern" item: Last night's night check — the app flagged it: "Night check: skin 0\.8 °C/);
      expect(a).toMatch(/measure skin, breathing or oxygen/);
      expect(a).toMatch(/never a diagnosis or medical advice/);
    }
  });
  it("VO2 max takes \"One number that moved\"'s turn when it moved — every 8th morning, not every morning; steady never", () => {
    const with_ = days.map((d) => morningBrief(d, [], [], at(d), { night: null, vo2: vo2("up") })[1]);
    const plain = days.map((d) => morningBrief(d, [], [], at(d))[1]);
    const turns = plain.map((a, k) => (/One number that moved/.test(a) ? k : -1)).filter((k) => k >= 0);
    expect(turns).toHaveLength(2);
    with_.forEach((a, k) => expect(/Cardio fitness — their VO2 max moved: "VO2 max this week 44\.0/.test(a)).toBe(turns.includes(k)));
    with_.forEach((a, k) => { if (!turns.includes(k)) expect(a).toBe(plain[k]); });
    expect(days.map((d) => morningBrief(d, [], [], at(d), { night: null, vo2: vo2("steady") })[1])).toEqual(plain);
    expect(days.map((d) => morningBrief(d, [], [], at(d), { night: null, vo2: { line: "x", changes: [] } })[1])).toEqual(plain);
  });
});

describe("a \"New to try\" item", () => {
  const item = (url: string) => ({ type: "try" as const, title: "Try: cluster sets", text: "…", source: { title: "Study", url } });
  it("is kept with a real link and dropped without one — no source, no recommendation", () => {
    expect(checkDigest({ greeting: "Hi", items: [item("https://pubmed.ncbi.nlm.nih.gov/1/")] }).items).toHaveLength(1);
    expect(checkDigest({ greeting: "Hi", items: [item("")] }).items).toHaveLength(0);
    expect(checkDigest({ greeting: "Hi", items: [{ type: "try", title: "x", text: "y" }] }).items).toHaveLength(0);
  });
  it("the morning read is told to bring one, from the kind named, never already in the stack; forums as anecdotes", () => {
    expect(SYSTEM.digest).toMatch(/one "try" .* not in their stack, not already shown .* A forum find is anecdotes: say so/s);
    expect(SYSTEM.digest).toMatch(/Titles hook/);
  });
});

// PLAN 157 — owner, 21 Oct: "we should have the same studt, try, and notiiced session at Eod"
describe("the evening's picks", () => {
  it("tonight's \"try\" is never the same kind as this morning's", () => {
    for (let i = 0; i < 12; i++) {
      const d = addDays("2026-10-01", i), m = morningBrief(d, [], [], 0).find((l) => l.includes('"try" item today'))!, e = eveningBrief(d, [])[1];
      expect(e.slice(e.indexOf(":") + 2)).not.toBe(m.slice(m.indexOf(":") + 2));
    }
  });
  it("it's told what's been shown, so it never repeats a title", () => {
    expect(eveningBrief("2026-10-21", ["Glycine and deep sleep"])).toContain("## Already shown — never repeat these titles: Glycine and deep sleep");
    expect(eveningBrief("2026-10-21", []).some((l) => l.startsWith("## Already shown"))).toBe(false);
  });
});
