/**
 * The app's own research on you (PLAN 192; owner, 3 Nov: "Ai should do researches on its own but do not let it soend way
 * too much credits. Like researxh on what i take what i eat how i train how much i move my heartrate etc etc etc").
 *
 * The app — not the AI, so choosing costs nothing — keeps a list of topics from your data: each supplement you're taking
 * (its dose in the key: a new dose is a new topic), your most-eaten foods, your training, each cardio kind with a pace,
 * your steps, your resting heart rate and HRV. One is researched a day at most, RESEARCH.perWeek a week, the area looked at
 * longest ago first; a topic comes back after RESEARCH.againDays. Each is one small call (lib/ai/tasks "research": the
 * reads' model, no look-up rounds, 3 web searches at most, only the topic's lines and About me). Its own cap: RESEARCH.monthUsd
 * a month, and none once the month's AI spend is past half the budget. Pure.
 */

import type { Entry, EntryOf, Supplement, Workout } from "../types";
import type { Profile, Settings } from "../store";
import type { BandData } from "../band";
import type { ResearchAnswer } from "./tasks";
import { addDays, localDay } from "../time";
import { scheduleWords } from "../schedule";
import { allPhases, beatsText, distText, kindStats, paceText, type DistUnit } from "../cardiostats";
import { stepsByDay } from "../steps";
import { laneOn } from "./lanes";

export const RESEARCH = { perWeek: 4, againDays: 45, monthUsd: 2.5, pauseShare: 0.5, keep: 60, fromHour: 10, topFoods: 3, minFoodDays: 6, minSuppDays: 3, minSessions: 6, said: 20 } as const;

/** `wild`: a field the app picks at random, not from your data (PLAN 194: "sometimes random ones") — its turn comes like the others'. */
export type Area = "supp" | "food" | "training" | "cardio" | "steps" | "heart" | "wild";
export const AREAS: Area[] = ["supp", "food", "training", "cardio", "steps", "heart", "wild"];
export type Topic = { key: string; area: Area; name: string; lines: string[] };
/** What came back, kept: the answer, its topic, when, what it cost. `seen`: opened in the AI tab. */
export type Researched = ResearchAnswer & { key: string; area: Area; name: string; at: number; day: string; usd: number; seen?: number };

type Data = { entries: Entry[]; workouts: Workout[]; supplements: Supplement[]; settings: Pick<Settings, "distUnit">; goals?: { kcal: number; p: number } };
const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[(s.length - 1) >> 1] : 0; };
const mean = (v: number[]) => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : NaN);
const r0 = (n: number) => Math.round(n).toLocaleString("en-GB");

/** Every topic there's enough of you for right now, in AREAS order. */
export function researchTopics(d: Data, band: Pick<BandData, "rhr" | "hrv" | "steps" | "hr"> | null, now: number): Topic[] {
  const today = localDay(now), from14 = addDays(today, -14), from30 = addDays(today, -30), from28 = addDays(today, -28), out: Topic[] = [];
  const day = (e: { at: number }) => localDay(e.at);

  // what you take: each supplement taken on 3+ of the last 14 days (or logged twice, taken when needed)
  for (const s of d.supplements.filter((x) => x.active && x.status !== "stopped")) {
    const days = new Set(d.entries.filter((e) => e.kind === "supp" && e.suppId === s.id && e.status === "taken" && day(e) >= from14 && day(e) < today).map(day)).size;
    if (days < (s.schedule?.kind === "needed" ? 2 : RESEARCH.minSuppDays)) continue;
    const rest = d.supplements.filter((x) => x.active && x.id !== s.id).map((x) => `${x.name}${x.dose ? ` ${x.dose}` : ""}`);
    out.push({ key: `supp:${s.id}:${(s.dose || "").toLowerCase().replace(/\s+/g, "")}`, area: "supp", name: s.name, lines: [
      `- What: a supplement I take — ${s.name}${s.dose ? `, ${s.dose}` : ""}, ${scheduleWords(s)}${s.schedule?.kind === "needed" ? "" : `, in the ${s.slot}`}; taken on ${days} of the last 14 days.`,
      ...(rest.length ? [`- The rest of my stack: ${rest.join(", ")}.`] : []),
      "- Look into: whether it does what people take it for, at this dose and timing; anything about taking it with the rest of my stack; what to watch for.",
    ] });
  }

  // what you eat: the foods on the most days of the last 30 (6+), the top 3
  const foods = new Map<string, EntryOf<"food">[]>();
  for (const e of d.entries) if (e.kind === "food" && day(e) >= from30 && day(e) < today) foods.set(e.name, [...(foods.get(e.name) ?? []), e]);
  [...foods.entries()].map(([name, es]) => ({ name, es, days: new Set(es.map(day)).size })).filter((f) => f.days >= RESEARCH.minFoodDays)
    .sort((a, b) => b.days - a.days).slice(0, RESEARCH.topFoods).forEach((f) => {
      const kcal = median(f.es.map((e) => e.macros.kcal)), p = median(f.es.map((e) => e.macros.p)), g = median(f.es.map((e) => e.grams ?? 0));
      out.push({ key: `food:${f.name.toLowerCase()}`, area: "food", name: f.name, lines: [
        `- What: a food I eat often — ${f.name}, on ${f.days} of the last 30 days; a usual serving ${g ? `${r0(g)} g, ` : ""}${r0(kcal)} kcal, ${r0(p)} g protein.`,
        ...(d.goals ? [`- My daily goals: ${r0(d.goals.kcal)} kcal, ${r0(d.goals.p)} g protein.`] : []),
        "- Look into: what it does for or against my goals; a better version or swap if there is one; nothing preachy.",
      ] });
    });

  // how you train: the last 4 weeks' lifting, the most-trained exercises
  const sets = d.entries.filter((e): e is EntryOf<"set"> => e.kind === "set" && !e.warmup && day(e) >= from28 && day(e) < today);
  const sessions = new Set(sets.map((e) => e.workoutId)).size;
  if (sessions >= RESEARCH.minSessions) {
    const by = new Map<string, EntryOf<"set">[]>();
    for (const e of sets) by.set(e.exercise, [...(by.get(e.exercise) ?? []), e]);
    const top = [...by.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 6)
      .map(([x, es]) => { const reps = es.map((e) => e.reps), best = es.reduce((b, e) => (e.kg > b.kg || (e.kg === b.kg && e.reps > b.reps) ? e : b)); return `${x} ${es.length} sets, reps ${Math.min(...reps)}–${Math.max(...reps)}, top ${best.kg} kg × ${best.reps}`; });
    out.push({ key: "training", area: "training", name: "your training", lines: [
      `- What: how I train — ${sessions} lifting sessions in the last 4 weeks (${(sessions / 4).toFixed(1)} a week).`,
      `- Most done: ${top.join("; ")}.`,
      "- Look into: whether the volume, rep ranges and frequency fit building muscle while losing fat; one change most likely to help.",
    ] });
  }

  // cardio: each kind with 2+ sessions with a distance, and its pace (PLAN 191)
  const u: DistUnit = d.settings.distUnit ?? "mi";
  for (const k of kindStats(allPhases(d.workouts, band?.hr ?? [], now)).filter((x) => x.withDist >= 2)) {
    out.push({ key: `cardio:${k.kind.toLowerCase()}`, area: "cardio", name: k.kind, lines: [
      `- What: my ${k.kind.toLowerCase()} — ${k.withDist} sessions with a distance, average pace ${paceText(k.pace!, u)} /${u}, ${distText(k.avgKm!, u)} a session${k.hr ? `, average heart rate ${k.hr} bpm` : ""}${k.beats ? `, ${beatsText(k.beats, u)} beats ${u === "mi" ? "a mile" : "a km"}` : ""}${k.then && k.now ? `; the first 3 at ${paceText(k.then.pace, u)}, the last 3 at ${paceText(k.now.pace, u)}` : ""}.`,
      "- Look into: how a beginner gets faster or fitter at this (pace, heart-rate zones, how often); what my numbers say about where I am.",
    ] });
  }

  // how much you move: steps a day from the band, the last 2 weeks
  if (band?.steps?.length) {
    const byDay = stepsByDay(band.steps, band.hr ?? [], today), last = [...byDay.entries()].filter(([k]) => k >= from14 && k < today).map(([, v]) => v);
    if (last.length >= 7) out.push({ key: "steps", area: "steps", name: "your steps", lines: [
      `- What: how much I move — ${r0(mean(last))} steps a day on average over ${last.length} days (lowest ${r0(Math.min(...last))}, highest ${r0(Math.max(...last))}).`,
      "- Look into: what steps a day does for fat loss, heart and mood at my level; the easiest way to add more.",
    ] });
  }

  // your heart: resting heart rate and HRV, the last 30 days against the 30 before
  if (band) {
    const span = (m: Record<string, number>, a: string, b: string) => Object.entries(m).filter(([k]) => k >= a && k < b).map(([, v]) => v);
    const rhr = span(band.rhr, from30, today), rhr0 = span(band.rhr, addDays(from30, -30), from30), hrv = span(band.hrv, from30, today), hrv0 = span(band.hrv, addDays(from30, -30), from30);
    if (rhr.length >= 14) out.push({ key: "heart", area: "heart", name: "your resting heart and HRV", lines: [
      `- What: my heart — resting heart rate ${r0(mean(rhr))} bpm over the last 30 days${rhr0.length >= 14 ? ` (${r0(mean(rhr0))} the 30 before)` : ""}${hrv.length >= 14 ? `; HRV ${r0(mean(hrv))} ms${hrv0.length >= 14 ? ` (${r0(mean(hrv0))} before)` : ""}` : ""}, from a wrist band.`,
      "- Look into: what these numbers mean for someone like me, what moves them (training, sleep, alcohol, weight loss), and how fast.",
    ] });
  }
  // something random (PLAN 194; owner, 4 Nov: "make research, protocols, studies fun and different, sometimes random ones")
  const lane = laneOn(today, "research");
  out.push({ key: `wild:${lane.id}`, area: "wild", name: lane.words.split(" — ")[0], lines: [
    `- What: something random to learn about — the app's pick at random, not from my data: ${lane.words}.`,
    "- Look into: the most surprising well-tested finding in this field that someone like me (About me) could use or would enjoy knowing — in people, with its design, size and year — and one small, safe thing to try.",
  ] });
  return out;
}

const month = (day: string) => day.slice(0, 7);

/**
 * The next topic to research, or why not now: from RESEARCH.fromHour; none today yet; under RESEARCH.perWeek in 7 days;
 * under its own RESEARCH.monthUsd this month; the month's AI spend under RESEARCH.pauseShare of the budget; a topic not
 * researched in RESEARCH.againDays — from the area looked at longest ago (never first). `list` can be a function: worked
 * out only when every other check has passed (the background jobs ask often).
 */
export function nextResearch(list: Topic[] | (() => Topic[]), done: Researched[], now: number, spend: { monthUsd: number | null; budget: number }, off = false): { topic: Topic } | { wait: string } {
  const today = localDay(now);
  if (off) return { wait: "off in Settings → AI" };
  if (new Date(now).getHours() < RESEARCH.fromHour) return { wait: `from ${RESEARCH.fromHour}:00` };
  if (done.some((r) => r.day === today)) return { wait: "one a day" };
  if (done.filter((r) => r.day > addDays(today, -7)).length >= RESEARCH.perWeek) return { wait: `${RESEARCH.perWeek} a week` };
  if (researchUsd(done, today) >= RESEARCH.monthUsd) return { wait: `this month's $${RESEARCH.monthUsd.toFixed(2)} for research is spent` };
  if (spend.monthUsd == null) return { wait: "the month's AI spend isn't known yet" };
  if (spend.monthUsd >= spend.budget * RESEARCH.pauseShare) return { wait: `the month's AI spend is past half the $${spend.budget} budget` };
  // the topics only now, past every cheap check: they read weeks of the band's minutes
  const topics = typeof list === "function" ? list() : list;
  // the random field only once something of yours has been looked into: research is about you, random sometimes
  const fresh = topics.filter((t) => !done.some((r) => r.key === t.key && r.day > addDays(today, -RESEARCH.againDays)) && (t.area !== "wild" || done.some((r) => r.area !== "wild")));
  if (!fresh.length) return { wait: "nothing new to look into" };
  // the random field never jumps the queue: never done, it waits as if just done, so it comes after a round of the others
  const latest = Math.max(0, ...done.map((r) => r.at));
  const lastIn = (a: Area) => { const at = done.filter((r) => r.area === a).map((r) => r.at); return at.length ? Math.max(...at) : a === "wild" ? latest : 0; };
  const order = [...AREAS].sort((a, b) => lastIn(a) - lastIn(b) || AREAS.indexOf(a) - AREAS.indexOf(b));
  for (const a of order) { const t = fresh.find((x) => x.area === a); if (t) return { topic: t }; }
  return { wait: "nothing new to look into" };
}

/** What research cost this month. */
export const researchUsd = (done: Researched[], today: string) => done.filter((r) => month(r.day) === month(today)).reduce((a, r) => a + r.usd, 0);

/** The call's whole context: who you are, the topic and its numbers, and what's been researched already (never again). */
export function researchContext(t: Topic, profile: Profile, done: Researched[]): string {
  return [
    "## About me",
    profile.aims?.length ? `My goals (in my words): ${profile.aims.join("; ")}.` : "My goals: not given.",
    `Conditions: ${profile.conditions.join(", ") || "none listed"}. Medications: ${profile.meds.join(", ") || "none listed"}. Allergies: ${profile.allergies.join(", ") || "none listed"}.`,
    "## The topic (the app's pick, from my data)",
    ...t.lines,
    ...(done.length ? ["## Already researched (never repeat a title)", ...done.slice(-RESEARCH.said).map((r) => `- ${r.title}`)] : []),
  ].join("\n");
}

/** For the reads: what the app researched lately, so they build on it and don't say it again. */
export function researchLines(done: Researched[], today: string): string[] {
  const recent = done.filter((r) => r.day > addDays(today, -30)).slice(-6);
  return recent.length ? ["## What the app researched for me lately (its own look-ups — build on them, don't repeat them)", ...recent.map((r) => `- ${r.day}: ${r.title} — ${r.tip || r.known.split(". ")[0]}`)] : [];
}

/** Keep the answer with its topic and cost; newest last, at most RESEARCH.keep. */
export const keepResearch = (done: Researched[], t: Topic, a: ResearchAnswer, usd: number, now: number): Researched[] =>
  [...done, { ...a, key: t.key, area: t.area, name: t.name, at: now, day: localDay(now), usd }].slice(-RESEARCH.keep);
