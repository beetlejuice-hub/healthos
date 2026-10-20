import { describe, expect, it } from "vitest";
import { noticeLines } from "./notices";
import { checkupLines } from "./ai/checkup";
import { checkQuestions, SYSTEM } from "./ai/tasks";
import { addDays } from "./time";
import type { Entry } from "./types";

// Owner, 20 Oct: "a small text box where i can write things like I went downstairs to do something … came back up and
// realized i didnt do what i wanted. This happens often … The app can make an understanding of this … dive deep into it"
const at = (d: string, hm: string) => new Date(`2026-10-${d}T${hm}:00`).getTime();
let k = 0;
const id = () => `e${k++}`;

describe("what each notice goes to the AI with", () => {
  const es: Entry[] = [
    { id: id(), kind: "sleep", at: at("19", "07:30"), rating: 4 },
    { id: id(), kind: "drink", at: at("19", "08:00"), name: "Coffee", ml: 250, caffeineMg: 95, alcoholG: 0, kcal: 2 },
    { id: id(), kind: "drink", at: at("19", "11:00"), name: "Coffee", ml: 250, caffeineMg: 95, alcoholG: 0, kcal: 2 },
    { id: id(), kind: "feel", at: at("19", "12:00"), stress: 7, focus: 3 },
    { id: id(), kind: "notice", at: at("19", "15:20"), text: "went downstairs, forgot why" },
    { id: id(), kind: "drink", at: at("19", "16:00"), name: "Coffee", ml: 250, caffeineMg: 95, alcoholG: 0, kcal: 2 }, // after: not counted
    { id: id(), kind: "notice", at: at("20", "09:10"), text: "eyelid twitching" },
    { id: id(), kind: "notice", at: new Date("2026-09-10T09:10:00").getTime(), text: "too old" }, // 40 days back
  ];
  it("that day up to the moment: last night's rating, caffeine so far, the last check-in — nothing from after", () => {
    expect(noticeLines(es, at("20", "12:00"))).toEqual([
      'Mon 19 Oct 15:20: "went downstairs, forgot why" (last night rated 4/10; 190 mg caffeine so far; last check-in 12:00: focus 3, stress 7)',
      'Tue 20 Oct 09:10: "eyelid twitching" (0 mg caffeine so far)',
    ]);
  });
  it("the night read-back and the questions are told how to treat them: curious, informal, never a diagnosis", () => {
    expect(SYSTEM.night).toMatch(/noticed about myself" line in the day is theirs, like a note .* never a diagnosis/s);
    expect(SYSTEM.questions).toMatch(/one question may dig into it — what usually comes before it.* never a diagnosis/s);
  });
});

describe("a check-up now and then", () => {
  const now = at("20", "08:00");
  // planted: resting HR 55 for 4 weeks, then 59 the last week; HRV 48 → 40
  const rhr: Record<string, number> = {}, hrv: Record<string, number> = {};
  for (let d = 1; d <= 35; d++) { const day = addDays("2026-10-20", -d); rhr[day] = d <= 7 ? 59 : 55; hrv[day] = d <= 7 ? 40 : 48; }
  it("due with nothing answered yet: the markers that moved, this week against the 4 before", () => {
    expect(checkupLines([], { rhr, hrv }, now)).toEqual([
      "## Check-up due (none yet)",
      "- Markers, the last 7 days against the 4 weeks before: resting heart rate 59 vs 55 bpm (+4); HRV 40 vs 48 ms (−8)",
    ]);
  });
  it("answered 3 days ago: not due; 8 days ago: due again", () => {
    const ans = (d: number): Entry => ({ id: id(), kind: "answer", at: now - d * 864e5, key: "checkup_week", question: "How have you been?", answer: "Fine" });
    expect(checkupLines([ans(3)], { rhr, hrv }, now)).toEqual([]);
    expect(checkupLines([ans(8)], { rhr, hrv }, now)[0]).toBe("## Check-up due (last one answered 8 days ago)");
  });
  it("without the band or enough days: still due, says there's no data to go on", () => {
    expect(checkupLines([], null, now)[1]).toBe("- Markers, the last 7 days against the 4 weeks before: not enough data yet");
  });
  it("the questions are told to lead with it, keyed checkup_", () => {
    expect(SYSTEM.questions).toMatch(/when "## Check-up due" is at the end of the context, the first question is the check-up .* its key starts "checkup_"/s);
    expect(checkQuestions({ questions: [{ id: "", text: "How have you been this week?", why: "resting HR +4", options: ["Good", "Run down"], key: "checkup_week", repeat: "once" }] }).questions[0].key).toBe("checkup_week");
  });
});
