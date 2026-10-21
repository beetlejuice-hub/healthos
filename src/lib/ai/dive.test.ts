import { describe, expect, it } from "vitest";
import { diveBrief, diveDue, diveKey } from "./dive";
import { checkDive, type DiveAnswer } from "./tasks";

// PLAN 160 — owner, 21 Oct: "do 2, 1, 3, 4" (3: a weekly deep dive) and "3: ai" (the AI picks the topic).
const at = (d: string, hm: string) => new Date(`${d}T${hm}:00`).getTime();
const logged = (days: number, end: number) => Array.from({ length: days }, (_, k) => ({ at: end - (k + 1) * 86_400_000 }));

describe("when the deep dive is due", () => {
  it("the week starts Sunday 09:00: before that it's still last week's", () => {
    expect(diveKey(at("2026-10-25", "08:59"))).toBe("2026-10-18"); // Sunday morning, early
    expect(diveKey(at("2026-10-25", "09:00"))).toBe("2026-10-25");
    expect(diveKey(at("2026-10-28", "20:00"))).toBe("2026-10-25"); // a Wednesday: the Sunday before
    expect(diveKey(at("2026-11-01", "10:00"))).toBe("2026-11-01"); // across a month
    expect(diveKey(at("2026-10-31", "23:59"))).toBe("2026-10-25");
  });
  it("once a week; missed Sunday → the first time the app's opened that week; not on an empty account", () => {
    const sun = at("2026-10-25", "10:00"), tue = at("2026-10-27", "19:00");
    expect(diveDue(sun, null, logged(12, sun))).toBe("2026-10-25");
    expect(diveDue(tue, { key: "2026-10-18" }, logged(12, tue))).toBe("2026-10-25"); // last week's is done, this week's isn't
    expect(diveDue(tue, { key: "2026-10-25" }, logged(12, tue))).toBeNull();
    expect(diveDue(sun, null, logged(5, sun))).toBeNull(); // under 10 days of anything logged in 4 weeks
  });
  it("its ask: never a past topic; on \"pick another\", not the ones skipped", () => {
    const b = diveBrief([{ topic: "Is magnesium doing anything for your sleep?" }], ["Do your late coffees cost you deep sleep?"]).join("\n");
    expect(b).toMatch(/^## This week's deep dive/);
    expect(b).toMatch(/never again: Is magnesium doing anything for your sleep\?/);
    expect(b).toMatch(/not "Do your late coffees cost you deep sleep\?" — pick something different/);
    expect(diveBrief([]).join("\n")).not.toMatch(/never again|another topic/);
  });
});

describe("a deep dive's answer", () => {
  const a = (more: Partial<DiveAnswer> = {}): DiveAnswer => ({ topic: "Is magnesium doing anything for your sleep?", why: "You've taken it 40 nights.", yourData: "6.4 with vs 6.6 without — not clear.", verdict: "Your data can't tell yet; studies show small effects at best.", sure: "weak",
    found: [{ title: "Magnesium and sleep, a meta-analysis", text: "Small effect on sleep onset.", source: { title: "BMC 2021", url: "https://pubmed.ncbi.nlm.nih.gov/1/" } }], ...more });
  it("needs its question and its verdict", () => {
    expect(() => checkDive(a({ topic: "" }))).toThrow(SyntaxError);
    expect(() => checkDive(a({ verdict: " " }))).toThrow(SyntaxError);
  });
  it("studies without a real link are left out; at most 3", () => {
    const f = (url: string) => ({ title: "x", text: "y", source: { title: "s", url } });
    expect(checkDive(a({ found: [f("https://a.org/1"), f("http://b.org/2"), f(""), f("https://c.org/3"), f("https://d.org/4"), f("https://e.org/5")] })).found.map((x) => x.source.url)).toEqual(["https://a.org/1", "https://c.org/3", "https://d.org/4"]);
  });
  it("how sure: strong / moderate, anything else weak; an experiment only when it's one the app can run", () => {
    expect(checkDive(a({ sure: "very" as never })).sure).toBe("weak");
    expect(checkDive(a({ experiment: { name: "No magnesium for 2 weeks", how: "Skip it, keep the rest the same", days: 14, measure: "sleep" } })).experiment).toEqual({ name: "No magnesium for 2 weeks", how: "Skip it, keep the rest the same", days: 14, measure: "sleep" });
    expect(checkDive(a({ experiment: { name: "x", how: "y", days: 400, measure: "sleep" } })).experiment).toBeUndefined();
    expect(checkDive(a({ experiment: { name: "x", how: "y", days: 14, measure: "deep sleep" as never } })).experiment).toBeUndefined();
  });
});
