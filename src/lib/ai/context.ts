/**
 * What the AI is told about you: a compact text summary built from the engines' outputs — never
 * the raw log. About me, the stack (and what's running out), what the AI remembers, the last two
 * weeks day by day, how you feel by time of day, and what Noticed / Worth a look have found.
 * Pure, so it's tested and you can see exactly what leaves the phone (Settings → AI → "What the AI sees").
 */

import type { State } from "../store";
import type { DayFacts } from "../insights";
import type { Finding } from "../findings";
import type { Pattern } from "../scout";
import { clock, localDay } from "../time";

const BANDS: [string, number, number][] = [["morning (5–11)", 5, 11], ["midday (11–14)", 11, 14], ["afternoon (14–18)", 14, 18], ["evening (18–24)", 18, 24]];
const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

/** Energy/mood/focus by time of day over the last 30 days — how "you're often flat at 4pm" is seen. */
export function feelByTime(state: Pick<State, "entries">, now: number): string[] {
  const since = now - 30 * 86_400_000;
  const feels = state.entries.filter((e) => e.kind === "feel" && e.at >= since);
  return BANDS.flatMap(([name, from, to]) => {
    const xs = feels.filter((e) => { const h = new Date(e.at).getHours(); return h >= from && h < to; });
    if (!xs.length) return [];
    const pick = (k: "energy" | "mood" | "focus" | "stress") => avg(xs.flatMap((e) => (e.kind === "feel" && e[k] != null ? [e[k]!] : [])));
    return [`${name}: ${xs.length} check-in${xs.length === 1 ? "" : "s"} · energy ${pick("energy") ?? "–"} · mood ${pick("mood") ?? "–"} · focus ${pick("focus") ?? "–"}${pick("stress") != null ? ` · stress ${pick("stress")}` : ""}`];
  });
}

const feelText = (e: Extract<State["entries"][number], { kind: "feel" }>) =>
  (["energy", "mood", "focus", "stress"] as const).filter((k) => e[k] != null).map((k) => `${k} ${e[k]}`).join(", ");

/**
 * One day in order — what was eaten and drunk, the gym, every check-in with what you were up to and
 * the note you wrote. The nightly read-back is built on it; notes are quoted exactly.
 */
export function dayTimeline(state: Pick<State, "entries" | "workouts">, day: string): string[] {
  const es = state.entries.filter((e) => localDay(e.at) === day).sort((a, b) => a.at - b.at);
  const lines: string[] = [];
  for (const e of es) {
    const t = clock(e.at);
    if (e.kind === "food") lines.push(`${t} ate ${e.name} (${Math.round(e.macros.kcal)} kcal, P ${Math.round(e.macros.p)} g)`);
    else if (e.kind === "drink") lines.push(`${t} drank ${e.name}${e.caffeineMg ? ` (${e.caffeineMg} mg caffeine)` : ""}${e.alcoholG ? ` (${e.alcoholG} g alcohol)` : ""}`);
    else if (e.kind === "feel") lines.push(`${t} check-in: ${feelText(e) || "no ratings"}${e.doing?.length ? ` · up to: ${e.doing.join(", ")}` : ""}${e.note ? ` · my note: "${e.note}"` : ""}`);
    else if (e.kind === "sleep" && e.rating != null) lines.push(`${t} rated last night's sleep ${e.rating}/10${e.slow ? ", slow to fall asleep" : ""}`);
    else if (e.kind === "weight") lines.push(`${t} weighed ${e.kg} kg`);
    else if (e.kind === "supp" && e.status === "skipped") lines.push(`${t} skipped a supplement`);
  }
  for (const w of state.workouts ?? []) if (localDay(w.startedAt) === day) lines.push(`${clock(w.startedAt)} gym: ${w.template ?? "workout"}`);
  return lines.sort().slice(0, 60);
}

/** The why behind ratings, last 14 days: "13:10 mood 4, stress 7 — 'deadline at work'". */
export function feelNotes(state: Pick<State, "entries">, now: number): string[] {
  return state.entries
    .filter((e): e is Extract<State["entries"][number], { kind: "feel" }> => e.kind === "feel" && !!e.note && e.at > now - 14 * 86_400_000)
    .sort((a, b) => a.at - b.at).slice(-25)
    .map((e) => `${localDay(e.at)} ${clock(e.at)} ${feelText(e)} — "${e.note}"`);
}

export function dayLine(d: DayFacts, suppNames: Map<string, string>): string {
  const parts = [
    d.day + (d.weekend ? " (weekend)" : ""),
    d.kcal != null ? `${d.kcal} kcal, P ${d.proteinG ?? "?"} g, biggest meal ${d.bigMealKcal ?? "?"}` : d.logged ? "food not logged" : "nothing logged",
    d.caffeineMg ? `caffeine ${d.caffeineMg} mg (last ${d.lastCaffeineMin != null ? clock(new Date(2000, 0, 1, 0, d.lastCaffeineMin).getTime()) : "?"})` : "",
    d.alcoholG ? `alcohol ${d.alcoholG} g` : "",
    d.trained ? `gym (${Math.round(d.volumeKg)} kg volume)` : "",
    d.lateEat ? "ate after 21:00" : "",
    d.stackAnswered ? `took: ${[...d.taken].map((t) => suppNames.get(t) ?? t).join(", ") || "none"}` : "",
    d.energy != null ? `rated energy ${d.energy}, mood ${d.mood}, focus ${d.focus}, stress ${d.stress}` : "not rated",
  ];
  return parts.filter(Boolean).join(" · ");
}

export type ContextInput = {
  state: State;
  now: number;
  days: DayFacts[];
  findings: Finding[];
  patterns: Pattern[];
  weight?: { kg: number; perWeek: number } | null;
};

export function buildContext({ state, now, days, findings, patterns, weight }: ContextInput): string {
  const { profile, supplements, ai, goals } = state;
  const names = new Map(supplements.map((s) => [s.id, s.name]));
  const answers = state.entries.filter((e) => e.kind === "answer" && e.at > now - 14 * 86_400_000).slice(-20);
  const lines = [
    "## About me",
    `Conditions: ${profile.conditions.join(", ") || "none listed"}. Medications: ${profile.meds.join(", ") || "none listed"}. Allergies: ${profile.allergies.join(", ") || "none listed"}.${profile.notes ? ` Notes: ${profile.notes}` : ""}`,
    `Goals: ${goals.kcal} kcal/day, ${goals.p} g protein.${weight ? ` Weight trend: ${weight.kg.toFixed(1)} kg, ${weight.perWeek >= 0 ? "+" : ""}${weight.perWeek.toFixed(2)} kg/week.` : ""}`,
    "## My stack",
    ...supplements.map((s) => `- ${s.name}${s.dose ? ` ${s.dose}` : ""} (${s.slot})${s.status ? ` — ${s.status === "low" ? "running low" : s.status === "out" ? "ran out" : "stopped"}` : s.active ? "" : " — paused"}`),
    ...(ai.memory.length ? ["## What you remember about me", ...ai.memory.map((m) => `- ${m.text}`)] : []),
    ...(ai.experiments.filter((x) => !x.ended).length ? ["## Experiments running", ...ai.experiments.filter((x) => !x.ended).map((x) => `- ${x.name} since ${x.start} (${x.days} days, measuring ${x.measure})`)] : []),
    "## Last 14 days",
    ...days.slice(-14).map((d) => `- ${dayLine(d, names)}`),
    "## How I feel by time of day (last 30 days)",
    ...(feelByTime(state, now).map((l) => `- ${l}`) || []),
    ...(findings.length ? ["## What the app's statistics found (tested, trust these numbers)", ...findings.slice(0, 8).map((f) => `- ${f.title} (${f.value}${f.unit ? ` ${f.unit}` : ""}; ${f.sure})`)] : []),
    ...(patterns.length ? ["## Early patterns (could be chance, still being checked)", ...patterns.slice(0, 5).map((p) => `- ${p.text} — held ${p.held} of ${p.of}`)] : []),
    ...(feelNotes(state, now).length ? ["## Why I felt that way (my own notes on check-ins — take these seriously)", ...feelNotes(state, now).map((l) => `- ${l}`)] : []),
    ...(answers.length ? ["## My recent answers to your questions", ...answers.map((a) => (a.kind === "answer" ? `- ${new Date(a.at).toISOString().slice(0, 10)} ${a.question} → ${a.answer}` : ""))] : []),
  ];
  return lines.join("\n");
}
