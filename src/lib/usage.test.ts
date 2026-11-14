import { describe, expect, it } from "vitest";
import { record, report, USAGE, type Usage } from "./usage";

// Item 15 (owner, 14 Nov: "good idea but lmk before deleting").
const D = 86_400_000;
describe("which cards he uses", () => {
  it("seen and used, counted per card", () => {
    let u: Usage = {};
    u = record(u, "Why today", "seen", 0); u = record(u, "Why today", "seen", 1); u = record(u, "Why today", "used", 2);
    expect(u["Why today"]).toEqual({ seen: 2, used: 1, firstAt: 0, lastUsed: 2 });
  });
  it("never touched: seen 10+ times over 2 weeks and never used — not before two weeks, not when used once", () => {
    let u: Usage = {};
    for (let i = 0; i < 12; i++) { u = record(u, "A pattern", "seen", i * D); u = record(u, "How you compare", "seen", i * D); u = record(u, "Your brief", "seen", i * D); }
    u = record(u, "Your brief", "used", 3 * D);
    expect(report(u, 13 * D).quiet).toEqual([]);
    const r = report(u, 15 * D);
    expect(r.quiet.map((x) => x.key)).toEqual(["A pattern", "How you compare"]);
    expect(r.used.map((x) => x.key)).toEqual(["Your brief"]);
    expect(r.since).toBe(0);
  });
  it("names trimmed; the list capped, the least used going first", () => {
    let u: Usage = { kept: { seen: 1, used: 5, firstAt: 0 } };
    for (let i = 0; i < USAGE.maxKeys + 5; i++) u = record(u, ` card ${i} `, "seen", i);
    expect(Object.keys(u)).toHaveLength(USAGE.maxKeys);
    expect(u.kept).toBeDefined();
    expect(u["card 0"]).toBeUndefined();
  });
});
