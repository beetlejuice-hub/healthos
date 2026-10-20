/**
 * What makes each morning read different (PLAN 133; owner, 20 Oct: "can we make the digest messages more intereesting?
 * brainstorm this pls") and what it brings that's new (PLAN 132: "ai should look out for studies, workout splits, and
 * supps, foods, everything and recommend me new stuff from these categories too…or perhaps look at forums too"). No call
 * of its own: the app picks this morning's angle and the kind of thing to bring, turn by turn, so two mornings in a row
 * never read the same; the morning read (which already searches the web) gets them as one more section. Pure.
 */

import { nextTemplate } from "../training";
import { DAY } from "../time";

/** The lens of the morning's own-data item, in turn. */
export const ANGLES = [
  "Last night, decoded — one number from last night's band data that stood out, in plain words: what it is and what goes with it in their own nights",
  "One number that moved — the measure that changed most against their usual this week, and what went with it",
  "Myth or evidence — one common belief about something they do (their training, food, or a supplement in their stack), and what the evidence says, with its source",
  "Their best days — what their best mood, energy or focus days of the last weeks had in common, from the context",
  "A food they eat often, decoded — one thing worth knowing about a food that keeps showing up in their days, for their goals",
  "A small win — a streak, a record or a goal they're hitting, with the number (never invent one; skip to another angle if none)",
  "Today's session — one technique, warm-up or recovery point for the workout that's due today (\"Today's plan\")",
  "Their sleep timing — one thing about when they go to bed, wake or eat before bed, from the context",
];

/** What the "New to try" item brings, in turn — never something already in their stack or already shown. */
export const TRY = [
  "a study from the last 12 months on something they do or take",
  "a training method or split detail that fits their goals and the days they train (e.g. a rep scheme, a split, a technique)",
  "a supplement with good evidence for their goals that is NOT in their stack — what it does, the dose studied, how sure the evidence is",
  "a food or a swap that fits their goals and the foods they already eat",
  "a recipe that fits their goals: high protein, simple, with its numbers",
  "what people say on a forum (Reddit's r/Fitness, r/Supplements, r/sleep…) about something they do — anecdotes, and say so",
];

const dayNo = (day: string) => Math.round(Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10)) / 86_400_000);

/** This morning's angle and "New to try" kind, and the workout that's due (when they train). */
export function morningBrief(day: string, templates: { name: string }[], workouts: { template: string; startedAt: number; endedAt: number | null; kind?: string }[], now: number): string[] {
  const n = dayNo(day), lifting = workouts.filter((w) => w.kind !== "cardio");
  // the day's due workout only when they trained in the last 2 weeks — not a nudge into a split they've stopped
  const due = lifting.some((w) => w.startedAt >= now - 14 * DAY) ? nextTemplate(templates, lifting) : undefined;
  // the session angle needs a session: without one due, one that isn't yesterday's or tomorrow's
  const a = n % ANGLES.length, angle = !due && ANGLES[a].startsWith("Today's session") ? ANGLES[(a + 2) % ANGLES.length] : ANGLES[a];
  return [
    "## This morning (the app's picks, so mornings differ)",
    `- Angle for the "pattern" item: ${angle}`,
    `- "try" item today: ${TRY[n % TRY.length]}`,
    ...(due ? [`- Today's plan: ${due.name} is the workout that's due next`] : []),
  ];
}
