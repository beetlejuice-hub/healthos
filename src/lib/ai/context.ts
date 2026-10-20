/**
 * What the AI is told about you: a compact text summary built from the engines' outputs — never
 * the raw log. About me, the stack (and what's running out), what the AI remembers, the last two
 * weeks day by day, how you feel by time of day, and what Noticed / Worth a look have found.
 * Pure, so it's tested and you can see exactly what leaves the phone (Settings → AI → "What the AI sees").
 */

import { fatLines } from "../bodyfat";
import { creatineFrom } from "../checkin";
import type { State } from "../store";
import type { DayFacts } from "../insights";
import type { Finding } from "../findings";
import type { Pattern } from "../scout";
import { addDays, atMinute, clock, dayLabel, localDay } from "../time";
import { weekly } from "../weekly";
import { personalSleep, ratedNights } from "../caffeine-sleep";
import { doseCompare } from "../dose";
import { nightLabel, phoneLabel } from "../lastnight";
import { freshRead } from "./morning";

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
export function dayTimeline(state: Pick<State, "entries" | "workouts"> & { foods?: State["foods"] }, day: string): string[] {
  return timeline(state, atMinute(day, 0), atMinute(addDays(day, 1), 0));
}

/**
 * Everything logged from `from` up to `to`, in time order (not by the clock's text: 00:40 comes after 22:00), one line
 * each. `mark` adds a word after the time — "(after midnight)" in an evening that runs past it.
 */
export function timeline(state: Pick<State, "entries" | "workouts"> & { foods?: State["foods"] }, from: number, to: number, mark: (at: number) => string = () => ""): string[] {
  const foods = new Map((state.foods ?? []).map((f) => [f.id, f]));
  const es = state.entries.filter((e) => e.at >= from && e.at < to);
  const rows: [number, string][] = [];
  const push = (at: number, line: string) => rows.push([at, line]);
  for (const e of es) {
    const t = clock(e.at) + mark(e.at);
    if (e.kind === "food") push(e.at, `${t} ate ${e.name} (${Math.round(e.macros.kcal)} kcal, P ${Math.round(e.macros.p)} g)${madeOf(e.foodId ? foods.get(e.foodId) : undefined, e.grams)}`);
    else if (e.kind === "drink") push(e.at, `${t} drank ${e.name}${e.caffeineMg ? ` (${e.caffeineMg} mg caffeine)` : ""}${e.alcoholG ? ` (${e.alcoholG} g alcohol)` : ""}`);
    else if (e.kind === "feel") push(e.at, `${t} check-in: ${feelText(e) || "no ratings"}${e.doing?.length ? ` · up to: ${e.doing.join(", ")}` : ""}${e.note ? ` · my note: "${e.note}"` : ""}`);
    else if (e.kind === "sleep" && (e.rating != null || e.tags?.length || e.phoneMin != null)) push(e.at, `${t} ${e.rating != null ? `rated last night's sleep ${e.rating}/10` : "about last night"}${e.slow ? ", slow to fall asleep" : ""}${e.tags?.length ? ` · last night: ${e.tags.map(nightLabel).join(", ")}` : ""}${e.phoneMin != null ? ` · ${phoneLabel(e.phoneMin)} before sleep` : ""}`);
    else if (e.kind === "weight") push(e.at, `${t} weighed ${e.kg} kg`);
    else if (e.kind === "supp" && e.status === "skipped") push(e.at, `${t} skipped a supplement`);
  }
  for (const w of state.workouts ?? []) if (w.startedAt >= from && w.startedAt < to) push(w.startedAt, w.kind === "cardio"
    // PLAN 130: a cardio session of its own, by name and minutes
    ? `${clock(w.startedAt)}${mark(w.startedAt)} cardio: ${w.cardio?.what || "cardio"} (${w.endedAt ? `${Math.round((w.endedAt - w.startedAt) / 60_000)} min` : "going now"})`
    : `${clock(w.startedAt)}${mark(w.startedAt)} gym: ${w.template ?? "workout"}${w.cardio?.done ? `, then ${w.cardio.what}` : ""}`);
  return rows.sort((a, b) => a[0] - b[0]).slice(0, 60).map(([, l]) => l);
}

/** A plate's insides for the portion eaten: " — made of: pasta 150 g, chicken 120 g" (owner, 20 Oct). */
function madeOf(f: { parts?: { name: string; g: number }[] } | undefined, grams: number): string {
  const total = (f?.parts ?? []).reduce((a, p) => a + p.g, 0);
  if (!f?.parts?.length || !total || !(grams > 0)) return "";
  const k = grams / total;
  return ` — made of: ${f.parts.map((p) => `${p.name} ${Math.max(1, Math.round(p.g * k))} g`).join(", ")}`;
}

/** The why behind ratings, last 14 days: "13:10 mood 4, stress 7 — 'deadline at work'". */
export function feelNotes(state: Pick<State, "entries">, now: number): string[] {
  return state.entries
    .filter((e): e is Extract<State["entries"][number], { kind: "feel" }> => e.kind === "feel" && !!e.note && e.at > now - 14 * 86_400_000)
    .sort((a, b) => a.at - b.at).slice(-25)
    .map((e) => `${localDay(e.at)} ${clock(e.at)} ${feelText(e)} — "${e.note}"`);
}

/** The most the context may be (characters); the Worker accepts a little more. Oldest journal days go first. */
export const CONTEXT_MAX = 44_000;

const short = (k: string) => k[0].toUpperCase();

/**
 * Every check-in, day by day, for the last `days` days — the raw material for "what changes my mood"
 * (owner, 2 Oct: the AI should know everything when it looks at mood). Compact: one line a day,
 * that morning's sleep rating, then each check-in: time, E/M/F/S, what you were up to, your note.
 */
export function moodJournal(state: Pick<State, "entries">, now: number, days = 60): string[] {
  const from = addDays(localDay(now), -(days - 1));
  const byDay = new Map<string, string[]>();
  const sleep = new Map<string, string>();
  for (const e of [...state.entries].sort((a, b) => a.at - b.at)) {
    const d = localDay(e.at);
    if (d < from || e.at > now) continue;
    if (e.kind === "sleep" && (e.rating != null || e.tags?.length || e.phoneMin != null) && !sleep.has(d)) sleep.set(d, `${e.rating != null ? `slept ${e.rating}` : "night"}${e.slow ? " (slow to fall asleep)" : ""}${e.tags?.length ? ` [last night: ${e.tags.map(nightLabel).join(", ")}]` : ""}${e.phoneMin != null ? ` [${phoneLabel(e.phoneMin)} before sleep]` : ""}`);
    if (e.kind === "feel") {
      const v = (["energy", "mood", "focus", "stress"] as const).filter((k) => e[k] != null).map((k) => `${short(k)}${e[k]}`).join(" ");
      byDay.set(d, [...(byDay.get(d) ?? []), `${clock(e.at)} ${v}${e.doing?.length ? ` [${e.doing.join(",")}]` : ""}${e.note ? ` "${e.note}"` : ""}`]);
    }
  }
  return [...new Set([...byDay.keys(), ...sleep.keys()])].sort().map((d) => `${d}: ${[sleep.get(d), ...(byDay.get(d) ?? [])].filter(Boolean).join(" · ")}`);
}

/** This week against last, caffeine-at-bedtime vs your sleep, and dose comparisons — the engines' own numbers. */
export function moodEngines(state: Pick<State, "entries" | "workouts" | "supplements" | "settings">, now: number): string[] {
  const out: string[] = [];
  const names = new Map((state.supplements ?? []).map((s) => [s.id, s.name]));
  const w = weekly(state.entries, state.workouts ?? [], names, now);
  if (w.ready) {
    const k = w.week;
    out.push(`Week vs the week before: ${k.avgs.map((a) => `${a.k} ${a.now != null ? a.now.toFixed(1) : "–"} (${a.dir ?? "n/a"})`).join(", ")}${k.best && k.worst ? `; best ${k.best.name}, lowest ${k.worst.name}` : ""}${k.top ? `; top connection between check-ins: ${k.top.r.label} → ${k.top.r.metric} ${k.top.r.effect >= 0 ? "+" : ""}${k.top.r.effect.toFixed(1)} [${k.top.r.lo.toFixed(1)}, ${k.top.r.hi.toFixed(1)}] ${k.top.sure ? "(found" : "(early sign, may be chance"}; ${k.top.r.withN} gaps with, ${k.top.r.withoutN} without at the same time of day)` : ""}.`);
  }
  const p = personalSleep(ratedNights(state.entries, state.settings?.halfLifeMin ?? 300, state.settings?.bedMinute ?? 23 * 60));
  if (p.withN + p.withoutN > 0) out.push(`Caffeine at bedtime vs sleep rating: ${p.state}${p.diff != null ? ` (30+ mg nights ${p.diff >= 0 ? "+" : ""}${p.diff.toFixed(1)} vs under, 95% ${p.lo!.toFixed(1)} to ${p.hi!.toFixed(1)})` : ""}, ${p.withN} vs ${p.withoutN} nights.`);
  for (const c of doseCompare(state.entries, state.supplements ?? [])) {
    const rows = c.rows.filter((r) => r.diff).map((r) => `${r.metric} ${r.diff!.value >= 0 ? "+" : ""}${r.diff!.value.toFixed(1)} [${r.diff!.lo.toFixed(1)}, ${r.diff!.hi.toFixed(1)}]${r.diff!.clear ? "" : " unclear"}`);
    out.push(`${c.name} ${c.hi.dose} (${c.hi.days} days) vs ${c.lo.dose} (${c.lo.days} days): ${rows.length ? rows.join(", ") : `needs ${c.need} more days`}.`);
  }
  return out;
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
  /** The band's nights with the evening before each, one line a night (lib/ai/nights, PLAN 88). */
  nights?: string[];
  /** This morning's readiness, training, and the grids' findings with your replies (lib/ai/sections; 15 Oct). */
  today?: string[]; training?: string[]; grids?: string[];
  /** The chat's version (PLAN 67 phase 3): an overview, no nights or journal, a week of days — it asks the app for the rest. */
  slim?: boolean;
  /** The morning read and the day read back as Today shows them — the chat no longer repeats them, so it's told (16 Oct). */
  onToday?: string[];
  /** Today's own entries so far, in order (dayTimeline) — "Last 14 days" ends yesterday (16 Oct: the AI took yesterday for today). */
  todaySoFar?: string[];
};

export function buildContext(input: ContextInput): string {
  const { state, now } = input;
  const base = baseContext(input);
  const engines = moodEngines({ ...state, workouts: state.workouts ?? [] }, now);
  const eng = engines.length ? `\n## Mood engines (tested numbers)\n${engines.map((l) => `- ${l}`).join("\n")}` : "";
  if (input.slim) return `${base}${eng}\n${ASK_MORE}`;
  const extra = eng
    + (input.nights?.length ? `\n## My nights from the band, newest last (the band's measures, then the evening before)\n${input.nights.map((l) => `- ${l}`).join("\n")}` : "");
  // The journal fills what's left, newest days kept: the oldest go first when it's too long.
  let journal = moodJournal(state, now);
  const room = CONTEXT_MAX - base.length - extra.length - 80;
  while (journal.length && journal.join("\n").length + journal.length * 2 > room) journal = journal.slice(1);
  const j = journal.length ? `\n## Mood journal, every check-in (E energy, M mood, F focus, S stress; [up to]; "my note") — ${journal.length} days\n${journal.map((l) => `- ${l}`).join("\n")}` : "";
  return base + extra + j;
}

/** The chat's last section: everything left out is one question away. */
export const ASK_MORE = "## Ask the app for more\nThis is an overview. For anything beyond it — a day in full, a measure day by day, my notes, with vs without something, my nights from the band, my sessions — call day, series, find, compare, nights or sessions instead of guessing.";

/** The context's first line: what today is, so yesterday is never called "today" (owner, 16 Oct). */
export const nowLine = (now: number, span = 14, today = true) => `Now: ${dayLabel(now)} ${new Date(now).getFullYear()}, ${clock(now)} — today is ${localDay(now)}. "Last ${span} days" ends yesterday (${addDays(localDay(now), -1)})${today ? `; today's own entries are under "Today so far"` : ""}. "Last night" is the night that ended this morning.`;

/**
 * What's on Today from the AI right now, for the chat (owner, 16 Oct: the ☀️ message "only says good morning, rest i can
 * find in today window" — so it's not posted any more; "ask me about it" still works because the chat sees it here).
 */
export function onTodayLines(ai: Pick<State["ai"], "digest" | "night">, now: number): string[] {
  const today = localDay(now), yesterday = addDays(today, -1), out: string[] = [];
  const d = ai.digest;
  if (d && freshRead(d) && (d.day === today || d.day === yesterday)) {
    out.push(`Morning read (${d.day === today ? "this morning" : "yesterday morning"}): ${d.greeting}`);
    for (const i of d.items) out.push(`  - [${i.type}] ${i.title}: ${i.text}${i.source?.url ? ` (${i.source.title}, ${i.source.url})` : ""}${i.protocol ? ` — try: ${i.protocol.how}, ${i.protocol.days} days, measuring ${i.protocol.measure}` : ""}`);
  }
  const n = ai.night;
  if (n && (n.day === today || (n.day === yesterday && new Date(now).getHours() < 12))) {
    out.push(`Your day read back (${n.day === today ? "tonight" : "last night"}, ${n.day}): ${n.summary}`);
    if (n.change.length) out.push(`  - to try: ${n.change.map((c) => `${c.what} (${c.why})`).join("; ")}`);
  }
  return out;
}

function baseContext({ state, now, days, findings, patterns, weight, today = [], training = [], grids = [], slim, todaySoFar, onToday = [] }: ContextInput): string {
  const { profile, supplements, ai, goals } = state;
  const en = state.settings?.energy;
  const names = new Map(supplements.map((s) => [s.id, s.name]));
  const answers = state.entries.filter((e) => e.kind === "answer" && e.at > now - 14 * 86_400_000).slice(-20);
  const lines = [
    // owner, 15 Oct: "make sure app sees all data, organized" — what's here, in order
    nowLine(now, slim ? 7 : 14, !!todaySoFar),
    slim ? "Sections: About me · This morning · On Today · My stack · Last 7 days · Today so far · Training · How I feel by time of day · What the app found · Notes and answers · Mood engines · Ask the app for more."
      : "Sections: About me · This morning · My stack · Last 14 days · Today so far · Training · How I feel by time of day · What the app found · Notes and answers · Mood engines · My nights · Mood journal.",
    "## About me",
    // PLAN 131 (owner, 20 Oct: "give me suggestions based on my goals (it can ask me what my goals are)")
    profile.aims?.length ? `My goals (in my words): ${profile.aims.join("; ")}.` : "My goals: not given yet — the app asks for them in the AI tab.",
    `Conditions: ${profile.conditions.join(", ") || "none listed"}. Medications: ${profile.meds.join(", ") || "none listed"}. Allergies: ${profile.allergies.join(", ") || "none listed"}.${profile.notes ? ` Notes: ${profile.notes}` : ""}`,
    `Goals: ${goals.kcal} kcal/day, ${goals.p} g protein.${en?.mode === "burn" ? ` The calorie goal follows my burn: burn − the deficit for ${en.pace} kg/week, to lose fat while keeping and building muscle${en.offset ? `; two-week check-ins moved it ${en.offset > 0 ? "+" : ""}${en.offset}` : ""}.` : ""}${weight ? ` Weight trend: ${weight.kg.toFixed(1)} kg, ${weight.perWeek >= 0 ? "+" : ""}${weight.perWeek.toFixed(2)} kg/week.` : ""}`,
    // PLAN 134: what the scale's weight is made of, and creatine's water
    ...fatLines(state.entries, now, creatineFrom(state.entries, supplements)),
    ...(today.length ? ["## This morning (readiness, as the app shows it)", ...today.map((l) => `- ${l}`)] : []),
    ...(onToday.length ? ["## On Today right now, from you (the user reads these there; they aren't in this chat)", ...onToday.map((l) => (l.startsWith("  ") ? l : `- ${l}`))] : []),
    "## My stack",
    ...supplements.map((s) => `- ${s.name}${s.dose ? ` ${s.dose}` : ""} (${s.slot})${s.status ? ` — ${s.status === "low" ? "running low" : s.status === "out" ? "ran out" : "stopped"}` : s.active ? "" : " — paused"}`),
    ...(ai.memory.length ? ["## What you remember about me", ...ai.memory.map((m) => `- ${m.text}`)] : []),
    ...(ai.experiments.filter((x) => !x.ended).length ? ["## Experiments running", ...ai.experiments.filter((x) => !x.ended).map((x) => `- ${x.name} since ${x.start} (${x.days} days, measuring ${x.measure})`)] : []),
    slim ? "## Last 7 days" : "## Last 14 days",
    ...days.slice(slim ? -7 : -14).map((d) => `- ${dayLine(d, names)}`),
    ...(todaySoFar ? [`## Today so far (${dayLabel(now)}, up to ${clock(now)})`, ...(todaySoFar.length ? todaySoFar.map((l) => `- ${l}`) : ["- nothing logged yet"])] : []),
    ...(training.length ? ["## Training", ...training.map((l) => `- ${l}`)] : []),
    "## How I feel by time of day (last 30 days)",
    ...(feelByTime(state, now).map((l) => `- ${l}`) || []),
    // With what each rests on, so it can say how much — owner, 20 Oct: "the most confident finding yet is one that even the app can't defend".
    ...(findings.length ? ["## What the app's statistics found (tested; each with what it rests on — weigh that before calling one strong)", ...findings.slice(0, 8).map((f) => `- ${f.title} (${f.value}${f.unit ? ` ${f.unit}` : ""}; ${f.sure}) — ${f.evidence}`)] : []),
    ...(grids.length ? ["## What the Sleep / Heart / Mind / Training grids found (clear, tested), and what I said", ...grids.map((l) => `- ${l}`)] : []),
    ...(patterns.length ? ["## Early patterns (could be chance, still being checked)", ...patterns.slice(0, 5).map((p) => `- ${p.text} — held ${p.held} of ${p.of}`)] : []),
    ...(feelNotes(state, now).length ? ["## Why I felt that way (my own notes on check-ins — take these seriously)", ...feelNotes(state, now).map((l) => `- ${l}`)] : []),
    ...(answers.length ? ["## My recent answers to your questions", ...answers.map((a) => (a.kind === "answer" ? `- ${new Date(a.at).toISOString().slice(0, 10)} ${a.question} → ${a.answer}` : ""))] : []),
  ];
  return lines.join("\n");
}
