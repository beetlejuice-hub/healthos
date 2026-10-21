import { describe, expect, it } from "vitest";
import { askLines, questionKinds, tracking, TRACK_EVERY_DAYS } from "./asking";
import type { Entry } from "../types";
import { addDays, DAY } from "../time";

// PLAN 156 — owner, 21 Oct: "got the same questions … make them actually usable, clever, creative … but it should still
// have a reason. like its tracking something … an investigation between a connection in noticed, asking a question cause
// it saw a study … ask me about unrelated things, that i didnt even log".
const none = { checkup: false, followup: false };

describe("which kinds a read asks", () => {
  it("two different kinds, in turn — two mornings in a row never ask alike", () => {
    for (let i = 0; i < 14; i++) {
      const d = addDays("2026-10-01", i), a = questionKinds(d, "morning", none), b = questionKinds(addDays(d, 1), "morning", none);
      expect(new Set(a).size).toBe(2);
      expect(a).not.toEqual(b);
    }
  });
  it("the morning looks out (studies, checks), the evening back at the day (investigating) — and they differ on a day", () => {
    const days = Array.from({ length: 8 }, (_, i) => addDays("2026-10-01", i));
    expect(days.flatMap((d) => questionKinds(d, "morning", none))).toContain("study");
    expect(days.flatMap((d) => questionKinds(d, "evening", none))).toContain("investigate");
    expect(days.flatMap((d) => questionKinds(d, "morning", none))).not.toContain("investigate");
    for (const d of days) expect(questionKinds(d, "morning", none)).not.toEqual(questionKinds(d, "evening", none));
  });
  it("the check-up first when it's due; a follow-up only when a read suggested something", () => {
    expect(questionKinds("2026-10-21", "morning", { checkup: true, followup: false })[0]).toBe("checkup");
    const days = Array.from({ length: 8 }, (_, i) => addDays("2026-10-01", i));
    expect(days.flatMap((d) => questionKinds(d, "morning", none))).not.toContain("followup");
    expect(days.flatMap((d) => questionKinds(d, "morning", { checkup: false, followup: true }))).toContain("followup");
  });
});

describe("what's tracked comes back re-worded, not before it's due", () => {
  const now = new Date(2026, 9, 21, 8, 0).getTime();
  const ans = (key: string, daysAgo: number, answer: string): Entry => ({ id: `${key}${daysAgo}`, kind: "answer", at: now - daysAgo * DAY, key, question: "…", answer });
  const t = tracking([{ key: "social_battery", text: "How full is your social battery?", why: "mood dips after busy social days" }, { key: "slump", text: "…", why: "the 3 pm dip" }],
    [ans("social_battery", 5, "Low"), ans("social_battery", 1, "Full"), ans("slump", TRACK_EVERY_DAYS + 1, "Lunch")], now);
  it("its last answers, when, and whether it's due (every 3 days)", () => {
    expect(t[0]).toMatchObject({ key: "social_battery", what: "mood dips after busy social days", answers: ["Low", "Full"], due: false });
    expect(t[1]).toMatchObject({ key: "slump", due: true });
  });
  it("the read is told the kinds, what's tracked, what to follow up, and never to repeat words", () => {
    const lines = askLines(["tracking", "followup"], t, ["2026-10-20 morning read: Protein coffee before 10"], ["Did you nap today?"], () => "Mon 20 Oct");
    const txt = lines.join("\n");
    expect(txt).toMatch(/^## Questions this time/);
    expect(txt).toMatch(/- tracking — .*re-worded so it never reads the same/);
    expect(txt).toMatch(/- social_battery — mood dips after busy social days · Mon 20 Oct · Low \/ Full · not due yet/);
    expect(txt).toMatch(/Suggested to you lately[\s\S]*Protein coffee before 10/);
    expect(txt).toMatch(/Already asked — never the same words again: Did you nap today\?/);
  });
});
