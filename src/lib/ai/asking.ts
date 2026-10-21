/**
 * The questions (PLAN 156; owner, 21 Oct: "got the same questions. Please dont make it generic, make them actually usable,
 * clever, creative, can be playfully worded sometimes, but it should still have a reason. like its tracking something,
 * tracking mental health even, or just the ai doing an investigation between a connection in noticed, asking a question
 * cause it saw a study … can recommedn new supplements based on what it sees, can ask me about unrelated things, that i
 * didnt even log, it just want to make sure whether i have X or not").
 *
 * They come with the reads — 1–2 in the morning, 1–2 in the evening — so the model that writes them has the day and the
 * web. The app picks each read's kinds in turn so two days don't ask alike; what it tracks comes back re-worded, never
 * word for word (that's what "the same questions" was), and no sooner than every few days. Pure.
 */

import type { Entry } from "../types";
import { DAY } from "../time";
import type { QKind } from "./tasks";

/** What each kind is, as the read is told. */
export const KIND_BRIEF: Record<QKind, string> = {
  tracking: "tracking — a measure worth following over days (mental health too: mood, stress, motivation, social battery). Re-use a key from \"Tracking you follow\" when one is due, re-worded so it never reads the same, or start one new key that the data says is worth following",
  investigate: "investigating — a connection: a note from \"Things I noticed about myself\", a \"Worth a look\" pattern or a finding; ask what would explain it (what came before, when, how often)",
  study: "a study — something recent from the web on food, a supplement, sleep or training that fits what you see in their data, asked as a question (\"ever tried…?\", \"do you…?\"); may suggest a supplement that's not in their stack, with how sure the evidence is. Needs its source",
  check: "a check — something they don't log that the data hints at, to make sure whether they have it or not (a cold coming on, allergies, a stressful week, screens in bed, a sore joint…), with the hint in \"why\"",
  followup: "a follow-up — did they try what a read suggested (\"Suggested to you lately\"), and how it went",
  checkup: "the check-up — how they've been this week, or whether they've noticed the marker that moved (\"## Check-up due\")",
};
/** Labels on the card. */
export const KIND_LABEL: Record<QKind, string> = { tracking: "Tracking", investigate: "Investigating", study: "Saw a study", check: "Quick check", followup: "Follow-up", checkup: "Check-up" };

/** In turn: the morning looks ahead and out (studies, checks), the evening back at the day (investigating, tracking). */
const POOL: Record<"morning" | "evening", QKind[]> = {
  morning: ["study", "check", "tracking", "followup"],
  evening: ["investigate", "tracking", "check", "study"],
};
/** A tracking key comes back no sooner than this. */
export const TRACK_EVERY_DAYS = 3;

const dayNo = (day: string) => Math.round(Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10)) / 86_400_000);

/** This read's kinds: two, different, in turn; the check-up first when due; a follow-up only when there's one to follow. */
export function questionKinds(day: string, when: "morning" | "evening", has: { checkup: boolean; followup: boolean }): QKind[] {
  const pool = POOL[when].filter((k) => k !== "followup" || has.followup);
  const n = dayNo(day) + (when === "evening" ? 1 : 0), start = n % pool.length;
  const turn = [pool[start], pool[(start + 1) % pool.length]];
  return has.checkup ? ["checkup", turn[0]] : turn;
}

export type Tracked = { key: string; text: string; why: string };
export type TrackLine = { key: string; what: string; last: number | null; answers: string[]; due: boolean };

/** What's tracked, when each was last answered, its last answers, and whether it's due again. */
export function tracking(tracked: Tracked[], entries: Entry[], now: number): TrackLine[] {
  return tracked.map((t) => {
    const mine = entries.filter((e): e is Extract<Entry, { kind: "answer" }> => e.kind === "answer" && e.key === t.key).sort((a, b) => a.at - b.at);
    const last = mine.length ? mine[mine.length - 1].at : null;
    return { key: t.key, what: t.why || t.text, last, answers: mine.slice(-3).map((e) => e.answer), due: last == null || now - last >= TRACK_EVERY_DAYS * DAY - 6 * 3_600_000 };
  });
}

/** The section the read gets: its kinds, what's tracked, what to follow up, what not to ask again. */
export function askLines(kinds: QKind[], track: TrackLine[], followup: string[], asked: string[], dayOf: (t: number) => string): string[] {
  return [
    "## Questions this time (the app's picks, so days differ)",
    ...kinds.map((k) => `- ${KIND_BRIEF[k]}`),
    ...(track.length ? ["Tracking you follow (key — what it tracks · last answered · last answers):", ...track.map((t) => `- ${t.key} — ${t.what} · ${t.last ? dayOf(t.last) : "not answered yet"}${t.answers.length ? ` · ${t.answers.join(" / ")}` : ""}${t.due ? "" : " · not due yet"}`)] : []),
    ...(followup.length ? ["Suggested to you lately (for a follow-up):", ...followup.map((f) => `- ${f}`)] : []),
    ...(asked.length ? [`Already asked — never the same words again: ${asked.slice(-25).join(" | ")}`] : []),
  ];
}
