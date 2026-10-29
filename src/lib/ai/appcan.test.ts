// Reform X1 (owner, 29 Oct, the chat's answer to "music helps me focus": "The app can't test it yet because there's no
// music tag. For better focus, add "music" to your check-in notes"). The chat now carries what the app can already do;
// these keep every line of it true. Known answers: a planted +2 focus after music, ticked as his own word, is found; the
// same days with "music" only in the note are not (notes aren't tested); nothing planted, nothing found.
import { describe, expect, it } from "vitest";
import { APP_CAN, SYSTEM } from "./tasks";
import { BETWEEN, between } from "../detectors/between";
import { DOING } from "../feel";
import { atMinute, addDays } from "../time";
import type { Entry } from "../types";

const NOW = atMinute("2026-10-29", 23 * 60);
/** 50 days of check-ins around 09, 13, 17, 21 (±40 min, like real ones); on about half the days the morning's work had
 * music (ticked at 13:00). */
function world({ lift, asTag, seed = 1 }: { lift: number; asTag: boolean; seed?: number }): Entry[] {
  let x = seed * 9301 + 49297;
  const r = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
  const g = () => (r() + r() + r() - 1.5) * 1.2;
  const out: Entry[] = [];
  for (let k = 50; k >= 1; k--) {
    const day = addDays("2026-10-29", -k), music = r() < 0.5;
    for (const h of [9, 13, 17, 21]) {
      const at = h === 13 && music, focus = Math.max(1, Math.min(10, Math.round(6 + g() + (at ? lift : 0))));
      out.push({ id: `f${k}-${h}`, kind: "feel", at: atMinute(day, h * 60 + Math.round((r() - 0.5) * 80)), focus, mood: 6, ...(h === 13 ? { doing: ["work", ...(at && asTag ? ["music"] : [])] } : {}), ...(at && !asTag ? { note: "music while working" } : {}) });
    }
  }
  return out;
}
const music = (entries: Entry[]) => between(entries, [], new Map(), NOW).find((b) => b.activity === "tag:music" && b.metric === "focus");

describe("what the chat is told the app can do", () => {
  it("the chat carries it", () => {
    expect(SYSTEM.chat).toContain(APP_CAN);
    expect(APP_CAN).toMatch(/Never tell them to put something in their notes so it can be compared/);
    expect(APP_CAN).toMatch(/Never promise a later comparison/);
  });
  it("its numbers and tag names are the code's", () => {
    expect(APP_CAN).toContain(`${BETWEEN.minWith} stretches between check-ins with the tag and ${BETWEEN.minWithout} without (last ${BETWEEN.days} days)`);
    expect(APP_CAN).toContain(`built-in tags (${DOING.map((d) => d.label).join(", ")})`);
  });
  it("planted: music ticked as his own word, +2 focus at the check-in after → the finder finds it, about +2", () => {
    const hits = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => music(world({ lift: 2, asTag: true, seed })));
    expect(hits.filter((h) => h?.found).length).toBeGreaterThanOrEqual(7);
    const found = hits.filter((h) => h?.found);
    expect(Math.abs(found.reduce((s, h) => s + h!.effect, 0) / found.length - 2)).toBeLessThan(0.6);
  });
  it("controls: the same lift with “music” only in the note → nothing to test; a tag with nothing behind it → not found", () => {
    expect([1, 2, 3, 4].map((seed) => music(world({ lift: 2, asTag: false, seed })))).toEqual([undefined, undefined, undefined, undefined]);
    expect([1, 2, 3, 4, 5, 6, 7, 8].filter((seed) => music(world({ lift: 0, asTag: true, seed }))?.found).length).toBeLessThanOrEqual(1);
  });
});
