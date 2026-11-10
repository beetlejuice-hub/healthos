// Owner, 3 Nov: "Morning and night read should include a bit more, based on what happened to me, how i slept, how i felt
// thoughout the day, some funny or interesting or helpful advice it should give me, w a summary". Both reads ask for the
// day around their items; what comes back is kept short and only when written; an older read without it is as it was.
import { describe, expect, it } from "vitest";
import { checkDay, checkDigest, checkNight, SYSTEM } from "./tasks";

const item = { type: "pattern", title: "Beer nights cost you a point of sleep", text: "6.1 after drinks vs 7.2 without.", sure: "yours", measure: "sleep" };

describe("the day around the reads' items", () => {
  // PLAN 202 — owner, 10 Nov: "we should cut the summary, i never read … not the boring things i already know like calories
  // ate, workout, etc. i want to hear how my day was compared to others": no recap asked for; "vs" from the app's numbers
  it("no recap: neither read asks for a summary of the day, last night or how it felt; both ask for 'vs', from the app's numbers only", () => {
    expect(SYSTEM.digest).toMatch(/NOTHING THEY ALREADY KNOW[\s\S]*never restate what they logged[\s\S]*"vs": their day against everyone else[\s\S]*Never make up a comparison[\s\S]*"fun": one line/);
    expect(SYSTEM.digest).toContain('{"greeting":"one short line","vs":"","fun":""');
    expect(SYSTEM.digest).not.toMatch(/"summary": 2–3 short sentences|"slept":|"felt":/);
    expect(SYSTEM.night).toMatch(/NOTHING THEY ALREADY KNOW[\s\S]*"summary" is ONE line[\s\S]*never a recap[\s\S]*"happened": \[\][\s\S]*"vs": their day against everyone else/);
    expect(SYSTEM.night).toContain('{"summary":"","vs":"","fun":""');
    expect(SYSTEM.night).not.toMatch(/"slept":|"felt":/);
  });
  it("kept: trimmed, one line, short; the empty ones left out", () => {
    expect(checkDay({ summary: "  Slept 6 h 40.\n Felt flat after lunch.  ", slept: "6 h 40 · rated 7", felt: "", fun: "x".repeat(400) }, true))
      .toEqual({ summary: "Slept 6 h 40. Felt flat after lunch.", slept: "6 h 40 · rated 7", fun: "x".repeat(240) });
    expect(checkDay({ vs: "  More steps than about 85 %\n of 717,527 people  " }, false)).toEqual({ vs: "More steps than about 85 % of 717,527 people" });
    expect(checkDay({ summary: "the evening's own", slept: 7 as never }, false)).toEqual({});
  });
  it("the morning read carries them; an older one without them is as it was", () => {
    const d = checkDigest({ greeting: "Morning.", summary: "Short night, steady day.", slept: "6 h 10", felt: "energy 7 → 4 → 6", fun: "Your coffee peaks when your meetings do.", items: [item] } as never);
    expect([d.summary, d.slept, d.felt, d.fun]).toEqual(["Short night, steady day.", "6 h 10", "energy 7 → 4 → 6", "Your coffee peaks when your meetings do."]);
    const old = checkDigest({ greeting: "Morning.", items: [item] } as never);
    expect(["summary", "slept", "felt", "fun"].filter((k) => k in old)).toEqual([]);
  });
  it("the evening read carries last night, how today felt and the fun line beside its own summary", () => {
    const n = checkNight({ summary: "A good day.", happened: [], notes: "", change: [], remember: [], slept: "7 h 20 · rated 8", felt: "mood 6 → 8", fun: "Third day in a row your best hour was 11:00." } as never);
    expect([n.summary, n.slept, n.felt, n.fun]).toEqual(["A good day.", "7 h 20 · rated 8", "mood 6 → 8", "Third day in a row your best hour was 11:00."]);
  });
});
