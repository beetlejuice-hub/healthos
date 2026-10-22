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
  // mind and brain (owner, 22 Oct: "focsuing more on mental health would be nice, and brain health")
  "Your brain — one thing about brain health (sleep, training, omega-3, alcohol, stress) tied to a number of theirs: what it does for focus, memory or mood",
  "Mental health — one practice with evidence (breathing, time outside, gratitude, reframing a worry, social time) tied to their mood or stress data, and how to do it today",
];

/** What the "New to try" item brings, in turn — never something already in their stack or already shown. */
export const TRY = [
  "a study from the last 12 months on something they do or take",
  "a training method or split detail that fits their goals and the days they train (e.g. a rep scheme, a split, a technique)",
  "a supplement with good evidence for their goals that is NOT in their stack — what it does, the dose studied, how sure the evidence is",
  "a food or a swap that fits their goals and the foods they already eat",
  "a recipe that fits their goals: high protein, simple, with its numbers",
  "a mental- or brain-health practice with evidence that fits their days (focus, stress, mood, sleep) — how to do it and how sure the evidence is",
];

/**
 * The evening's "try", every evening (owner, 22 Oct: "can even sometimes go on reddit or twitter and see whats up, get some
 * more interesting/not so medically proven protocols/ideas" — "1 per day"): a community idea, in the read that's already
 * written, so no extra call. X/Twitter is mostly closed to search; Reddit, forums, blogs and podcasts aren't.
 */
export const COMMUNITY = "what people are trying, from Reddit (r/Biohackers, r/Nootropics, r/Supplements, r/sleep, r/Fitness…), forums, blogs or podcasts (X/Twitter too when search reaches it) — an interesting, less proven idea that fits something they do or want: what people say it did, what studies say if anything, \"sure\": \"anecdote\" unless trials back it; nothing unsafe";

/** The morning's third item, in turn (owner, 22 Oct: connections "on its own"): a connection every other morning. */
export const THIRD = ["a \"connection\" — a chain from something they did lately to something they care about (a condition in About me, tiredness, focus, mood, sleep), its link in their data checked with a look-up", "a study or fun fact with its source, or a protocol to try as an experiment"] as const;

const dayNo = (day: string) => Math.round(Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10)) / 86_400_000);

/**
 * The band's two, when they have something to say (PLAN 52; owner, 21 Oct: "3" — the read can make an item of them):
 * a night check that's off is this morning's angle, whatever the turn; VO2 max takes "One number that moved"'s turn
 * (every 8th morning) when it rose or fell over the weeks — not when it's steady.
 */
export const NIGHT_ANGLE = (line: string) => `Last night's night check — the app flagged it: "${line}" Make the pattern item about it (measure skin, breathing or oxygen): what these signals are in plain words, and what went with nights like it in their own data (drinks, a late meal, hard training, a short night). If yesterday's read already said it, say whether it's still there. Goes with — never a diagnosis or medical advice`;
export const VO2_ANGLE = (line: string) => `Cardio fitness — their VO2 max moved: "${line}" Make the pattern item about it (measure vo2): what moved it in their own data (cardio minutes and zones, training), and how much is the kilos (it's per kg)`;

/** This morning's angle and "New to try" kind, and the workout that's due (when they train). */
export function morningBrief(day: string, templates: { name: string }[], workouts: { template: string; startedAt: number; endedAt: number | null; kind?: string }[], now: number,
  band: { night: string | null; vo2: { line: string; changes: { word: string }[] } | null } = { night: null, vo2: null }): string[] {
  const n = dayNo(day), lifting = workouts.filter((w) => w.kind !== "cardio");
  // the day's due workout only when they trained in the last 2 weeks — not a nudge into a split they've stopped
  const due = lifting.some((w) => w.startedAt >= now - 14 * DAY) ? nextTemplate(templates, lifting) : undefined;
  // the session angle needs a session: without one due, one that isn't yesterday's or tomorrow's
  const a = n % ANGLES.length, turn = !due && ANGLES[a].startsWith("Today's session") ? ANGLES[(a + 2) % ANGLES.length] : ANGLES[a];
  const moved = band.vo2 && band.vo2.changes.at(-1)?.word !== "steady" && band.vo2.changes.length > 0;
  const angle = band.night ? NIGHT_ANGLE(band.night) : moved && turn.startsWith("One number that moved") ? VO2_ANGLE(band.vo2!.line) : turn;
  return [
    "## This morning (the app's picks, so mornings differ)",
    `- Angle for the "pattern" item: ${angle}`,
    `- "try" item today: ${TRY[n % TRY.length]}`,
    `- Third item today: ${THIRD[n % THIRD.length]}`,
    ...(due ? [`- Today's plan: ${due.name} is the workout that's due next`] : []),
  ];
}

/**
 * The evening read's picks (PLAN 157; owner, 21 Oct: "the same studt, try, and notiiced session at Eod"): its "try" — a
 * community idea every evening (22 Oct), never the morning's kinds — and what's been shown already.
 */
export function eveningBrief(shown: string[]): string[] {
  return [
    "## Tonight (the app's picks)",
    `- "try" item tonight: ${COMMUNITY}`,
    ...(shown.length ? [`## Already shown — never repeat these titles: ${shown.slice(-40).join(" | ")}`] : []),
  ];
}
