import { describe, expect, it } from "vitest";
import { ANGLES, morningBrief, TRY } from "./brief";
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
