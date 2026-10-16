/**
 * The chat's tools, run by the app on its own data (PLAN 67; owner, 9 Oct: "pull data based on what i ask and answer it
 * nicely"). The AI asks; these answer with the engines the pages use — glanceDays for the day's numbers, the day's timeline
 * the night read uses, the band's mornings — so a number in a reply is one the app measured. Pure: the data comes in.
 */

import type { State } from "../store";
import type { BandData } from "../band";
import { glanceDays } from "../glance";
import { dayTimeline } from "./context";
import { addDays, clock, dayLabel, localDay, atMinute, DAY } from "../time";
import { COMPARE_THINGS, SERIES_KEYS, type CompareThing, type SeriesKey, type ToolCall } from "./tasks";
import { dailyFacts, type DayFacts } from "../insights";
import { difference, mean } from "../stats";
import { nights as nightsOf } from "../sleep";
import { sessions as sessionsOf } from "../liftstrength";
import { working, type LoggedSet } from "../training";

export type ToolData = { state: Pick<State, "entries" | "workouts" | "settings" | "supplements" | "ai">; band: BandData | null; now: number };
export type ChartSpec = { measure: SeriesKey; from: string; to: string; title: string };
export type ToolOut = { text: string; error?: boolean; chart?: ChartSpec; remember?: string };

export const MEASURE: Record<SeriesKey, { name: string; unit: string; dec: 0 | 1; partial?: boolean }> = {
  mood: { name: "Mood", unit: "/10", dec: 1 }, energy: { name: "Energy", unit: "/10", dec: 1 }, focus: { name: "Focus", unit: "/10", dec: 1 },
  stress: { name: "Stress", unit: "/10", dec: 1 }, sleep: { name: "Sleep rating", unit: "/10", dec: 1 },
  kcal: { name: "Calories eaten", unit: " kcal", dec: 0, partial: true }, protein: { name: "Protein", unit: " g", dec: 0, partial: true },
  cafBed: { name: "Caffeine at bedtime", unit: " mg", dec: 0, partial: true }, drinks: { name: "Drinks", unit: "", dec: 1, partial: true },
  weight: { name: "Weight", unit: " kg", dec: 1 }, rhr: { name: "Resting heart rate", unit: " bpm", dec: 0 }, hrv: { name: "HRV", unit: " ms", dec: 0 },
  burned: { name: "Calories burned", unit: " kcal", dec: 0, partial: true }, steps: { name: "Steps", unit: "", dec: 0, partial: true },
};
/** The longest span `series` and `show_chart` take, and how far back `find` looks. */
export const SPAN_MAX = 120, FIND_DAYS = 180;

export const fmtMeasure = (k: SeriesKey, v: number) => {
  const m = MEASURE[k];
  return `${m.dec ? v.toFixed(1) : Math.round(v).toLocaleString("en-GB")}${m.unit}`;
};
const isDay = (x: unknown): x is string => typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x) && !Number.isNaN(Date.parse(`${x}T12:00:00`));
const name = (d: string) => dayLabel(atMinute(d, 720));
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Steps per local day from the band's 5-minute buckets. */
export function stepsByDay(band: BandData | null): Map<string, number> {
  const m = new Map<string, number>();
  for (const [t, , n] of band?.steps ?? []) m.set(localDay(t), (m.get(localDay(t)) ?? 0) + n);
  return m;
}

/** One measure per day, `from`–`to`, from the same numbers the pages show. */
export function seriesOf(k: SeriesKey, from: string, to: string, d: ToolData): { day: string; v: number | null }[] {
  const days: string[] = [];
  for (let x = from; x <= to; x = addDays(x, 1)) days.push(x);
  if (k === "rhr" || k === "hrv" || k === "burned") { const src = k === "burned" ? d.band?.kcal ?? {} : d.band?.[k] ?? {}; return days.map((day) => ({ day, v: src[day] ?? null })); }
  if (k === "steps") { const s = stepsByDay(d.band); return days.map((day) => ({ day, v: s.get(day) ?? null })); }
  const rows = new Map(glanceDays(d.state.entries, d.state.workouts, d.state.settings, from, to).map((r) => [r.day, r[k]]));
  return days.map((day) => ({ day, v: rows.get(day) ?? null }));
}

/** A span the tools accept: two dates, in order, at most SPAN_MAX days, not past today. */
function span(input: Record<string, unknown>, today: string): { from: string; to: string } | string {
  const { from, to } = input;
  if (!isDay(from) || !isDay(to)) return "from and to must be dates like 2026-10-01";
  const z = to > today ? today : to;
  if (from > z) return `from (${from}) is after to (${z})`;
  if (Date.parse(`${z}T12:00:00`) - Date.parse(`${from}T12:00:00`) > (SPAN_MAX - 1) * DAY) return `at most ${SPAN_MAX} days at a time`;
  return { from, to: z };
}

function day(input: Record<string, unknown>, d: ToolData): ToolOut {
  const today = localDay(d.now), x = input.date;
  if (!isDay(x)) return { text: "date must be like 2026-10-01", error: true };
  if (x > today) return { text: `${x} hasn't happened yet — today is ${today}`, error: true };
  const row = glanceDays(d.state.entries, d.state.workouts, d.state.settings, x, x)[0];
  const sup = new Map(d.state.supplements.map((s) => [s.id, s.name]));
  const avg = row ? ([["mood", row.mood], ["energy", row.energy], ["focus", row.focus], ["stress", row.stress], ["sleep", row.sleep], ["kcal", row.kcal], ["protein", row.protein], ["cafBed", row.cafBed], ["drinks", row.drinks], ["weight", row.weight]] as [SeriesKey, number | null][]).filter(([, v]) => v != null).map(([k, v]) => `${MEASURE[k].name} ${fmtMeasure(k, v!)}`) : [];
  const steps = stepsByDay(d.band).get(x), b = d.band;
  const band = [b?.rhr[x] != null && `resting heart rate ${Math.round(b.rhr[x])} bpm`, b?.hrv[x] != null && `HRV ${Math.round(b.hrv[x])} ms`, steps != null && `${steps.toLocaleString("en-GB")} steps`, b?.kcal?.[x] != null && `${Math.round(b.kcal[x]).toLocaleString("en-GB")} kcal burned`].filter(Boolean);
  const lines = dayTimeline(d.state, x);
  return { text: [
    `${name(x)} (${x})${x === today ? " — today, so far" : ""}`,
    avg.length ? `Averages: ${avg.join(", ")}` : "No check-ins, food or weigh-ins that day.",
    ...(row?.taken?.length ? [`Supplements taken: ${row.taken.map((id) => sup.get(id) ?? id).join(", ")}`] : []),
    ...(band.length ? [`Band: ${band.join(", ")}`] : []),
    ...(lines.length ? ["In order:", ...lines.map((l) => `- ${l}`)] : []),
  ].join("\n") };
}

function series(input: Record<string, unknown>, d: ToolData, chart = false): ToolOut {
  const k = input.measure as SeriesKey, today = localDay(d.now);
  if (!SERIES_KEYS.includes(k)) return { text: `measure must be one of ${SERIES_KEYS.join(", ")}`, error: true };
  const s = span(input, today);
  if (typeof s === "string") return { text: s, error: true };
  const vals = seriesOf(k, s.from, s.to, d), m = MEASURE[k];
  // today's calories, steps… are only partway: shown, not counted
  const part = m.partial ? vals.find((x) => x.day === today && x.v != null) : undefined;
  const full = vals.filter((x) => x.v != null && x !== part), n = vals.length - (m.partial && s.to === today ? 1 : 0);
  const head = n === 0 ? `${m.name}, today so far: ${part ? fmtMeasure(k, part.v!) : "nothing yet"}`
    : `${m.name}, ${s.from} to ${s.to}: ${full.length} of ${n} day${n === 1 ? "" : "s"} with a value${part ? ` (today so far: ${fmtMeasure(k, part.v!)})` : ""}`;
  if (!full.length && !part) return chart ? { text: `${head} — nothing to draw.`, error: true } : { text: `${head}.` };
  let stats = "";
  if (full.length) {
    const mean = full.reduce((a, x) => a + x.v!, 0) / full.length;
    const lo = full.reduce((a, x) => (x.v! < a.v! ? x : a)), hi = full.reduce((a, x) => (x.v! > a.v! ? x : a));
    stats = `; average ${fmtMeasure(k, mean)}, lowest ${fmtMeasure(k, lo.v!)} (${lo.day}), highest ${fmtMeasure(k, hi.v!)} (${hi.day})`;
  }
  if (chart) {
    const title = typeof input.title === "string" && input.title.trim() ? input.title.trim().slice(0, 80) : m.name;
    return { text: `Chart attached under your reply: ${head}${stats}.`, chart: { measure: k, from: s.from, to: s.to, title } };
  }
  const list = vals.filter((x) => x.v != null).map((x) => `${x.day} ${name(x.day).slice(0, 3)} ${fmtMeasure(k, x.v!)}${x === part ? " (today, so far)" : ""}`);
  return { text: [`${head}${stats}.`, ...list].join("\n") };
}

function find(input: Record<string, unknown>, d: ToolData): ToolOut {
  const q = typeof input.text === "string" ? fold(input.text.trim()) : "";
  if (q.length < 2) return { text: "give a word to look for (2+ letters)", error: true };
  const since = d.now - FIND_DAYS * DAY, sup = new Map(d.state.supplements.map((s) => [s.id, s.name]));
  const hits: { at: number; line: string }[] = [];
  const hit = (at: number, what: string, ...texts: (string | undefined)[]) => { if (texts.some((t) => t && fold(t).includes(q))) hits.push({ at, line: what }); };
  for (const e of d.state.entries) {
    if (e.at < since || e.at > d.now) continue;
    if (e.kind === "food") hit(e.at, `food: ${e.name} (${Math.round(e.macros.kcal)} kcal)`, e.name);
    else if (e.kind === "drink") hit(e.at, `drink: ${e.name}`, e.name);
    else if (e.kind === "supp") hit(e.at, `supplement ${e.status}: ${sup.get(e.suppId) ?? e.suppId}`, sup.get(e.suppId), e.suppId);
    else if (e.kind === "feel") hit(e.at, `check-in${e.doing?.length ? ` · up to: ${e.doing.join(", ")}` : ""}${e.note ? ` · note: "${e.note}"` : ""}`, e.note, ...(e.doing ?? []));
    else if (e.kind === "answer") hit(e.at, `answered "${e.question}": ${e.answer}`, e.question, e.answer);
    else if (e.kind === "sleep") hit(e.at, `about last night: ${(e.tags ?? []).join(", ")}`, ...(e.tags ?? []));
  }
  for (const w of d.state.workouts) if (w.startedAt >= since) hit(w.startedAt, `workout: ${w.template ?? "workout"}`, w.template);
  hits.sort((a, b) => b.at - a.at);
  if (!hits.length) return { text: `"${input.text}" doesn't show up in the last ${FIND_DAYS} days.` };
  const days = new Set(hits.map((h) => localDay(h.at)));
  return { text: [`"${input.text}": ${hits.length} time${hits.length === 1 ? "" : "s"} on ${days.size} day${days.size === 1 ? "" : "s"} in the last ${FIND_DAYS} days, newest first${hits.length > 25 ? " (the 25 newest)" : ""}:`,
    ...hits.slice(0, 25).map((h) => `- ${localDay(h.at)} ${name(localDay(h.at)).slice(0, 3)} ${clock(h.at)} ${h.line}`)].join("\n") };
}

/** Whether a day had the thing, or null when it can't be told (nothing logged that day: never counted as "without"). */
function hadThing(f: DayFacts, thing: CompareThing, suppId: string | null): boolean | null {
  switch (thing) {
    case "drinks": return f.logged ? f.alcoholG > 0 : null;
    case "trained": return f.logged || f.mood != null || f.trained ? f.trained : null;
    case "late_caffeine": return f.logged ? f.lateCaffeineMg > 0 : null;
    case "late_meal": return f.kcal != null ? f.lateEat : null;
    case "big_meal": return f.bigMealKcal != null ? f.bigMealKcal >= 900 : null;
    case "weekend": return f.weekend;
    case "supplement": return suppId && f.taken.has(suppId) ? true : suppId && f.skipped.has(suppId) ? false : null;
  }
}
const THING: Record<CompareThing, string> = { drinks: "drinks", trained: "training", late_caffeine: "caffeine after 14:00", late_meal: "food after 21:00", big_meal: "a 900+ kcal meal", weekend: "weekend days", supplement: "" };

function compare(input: Record<string, unknown>, d: ToolData): ToolOut {
  const k = input.measure as SeriesKey, thing = input.thing as CompareThing, today = localDay(d.now), next = input.when === "next_day";
  if (!SERIES_KEYS.includes(k)) return { text: `measure must be one of ${SERIES_KEYS.join(", ")}`, error: true };
  if (!COMPARE_THINGS.includes(thing)) return { text: `thing must be one of ${COMPARE_THINGS.join(", ")}`, error: true };
  const s = span(input, today);
  if (typeof s === "string") return { text: s, error: true };
  let suppId: string | null = null, label = THING[thing];
  if (thing === "supplement") {
    const want = typeof input.supplement === "string" ? fold(input.supplement.trim()) : "";
    const sup = want ? d.state.supplements.find((x) => fold(x.name).includes(want) || fold(x.id) === want) : undefined;
    if (!sup) return { text: `no supplement in the stack matches "${input.supplement}" — the stack: ${d.state.supplements.map((x) => x.name).join(", ")}`, error: true };
    suppId = sup.id; label = sup.name;
  }
  const facts = new Map(dailyFacts(d.state.entries, d.state.workouts, d.state.settings, s.from, s.to).map((f) => [f.day, f]));
  const m = MEASURE[k], vals = new Map(seriesOf(k, s.from, next ? addDays(s.to, 1) : s.to, d).map((x) => [x.day, x.v]));
  const yes: number[] = [], no: number[] = [];
  for (let x = s.from; x <= s.to; x = addDays(x, 1)) {
    const f = facts.get(x), at = next ? addDays(x, 1) : x, v = vals.get(at);
    // today's calories, steps… are partway: not a day to compare
    if (!f || v == null || (m.partial && at === today)) continue;
    const had = hadThing(f, thing, suppId);
    if (had != null) (had ? yes : no).push(v);
  }
  const what = `${m.name}${next ? " the next day" : ""} with ${label} vs without, ${s.from} to ${s.to}`;
  const avg = (xs: number[]) => (xs.length ? fmtMeasure(k, mean(xs)) : "–");
  const groups = `with: average ${avg(yes)} over ${yes.length} day${yes.length === 1 ? "" : "s"}; without: ${avg(no)} over ${no.length}`;
  const r = difference(yes, no);
  if (!r) return { text: `${what} — ${groups}. Too few days on one side (3 each needed) to say anything yet.` };
  const sign = (v: number) => `${v >= 0 ? "+" : "−"}${fmtMeasure(k, Math.abs(v))}`;
  return { text: `${what} — ${groups}. Difference ${sign(r.value)} (95% range ${sign(r.lo)} to ${sign(r.hi)}): ${r.clear ? "clear" : "not clear — the range crosses zero"}. Goes with, not proof of cause.` };
}

const hm = (min: number) => `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, "0")}`;

function nightsTool(input: Record<string, unknown>, d: ToolData): ToolOut {
  const today = localDay(d.now), s = span(input, today);
  if (typeof s === "string") return { text: s, error: true };
  if (Date.parse(`${s.to}T12:00:00`) - Date.parse(`${s.from}T12:00:00`) > 59 * DAY) return { text: "at most 60 nights at a time", error: true };
  const b = d.band;
  if (!b?.sleep.length) return { text: "No nights from the band yet." };
  const ns = nightsOf(b.sleep, b.hr, b.rhr, b.hrv).filter((n) => n.day >= s.from && n.day <= s.to);
  if (!ns.length) return { text: `No band nights between ${s.from} and ${s.to}.` };
  const lines = ns.map((n) => [
    `${n.day} ${name(n.day).slice(0, 3)}: bed ${clock(n.bed)}, up ${clock(n.up)}, asleep ${hm(n.asleep)}`,
    n.deep != null && `deep ${Math.round(n.deep)} min`, n.rem != null && `REM ${Math.round(n.rem)} min`, n.light != null && `light ${Math.round(n.light)} min`,
    `awake ${Math.round(n.awake)} min (${n.wakes}×)`, `fell asleep in ${Math.round(n.latency)} min`,
    n.low != null && `lowest HR ${Math.round(n.low)}`, n.meanHr != null && `average HR ${Math.round(n.meanHr)}`, n.hrv != null && `HRV ${Math.round(n.hrv)} ms`,
    n.nap && `nap that day ${Math.round(n.nap.min)} min`,
  ].filter(Boolean).join(", "));
  return { text: [`${ns.length} night${ns.length === 1 ? "" : "s"} from the band, ${s.from} to ${s.to} (each under the morning it ended):`, ...lines.map((l) => `- ${l}`)].join("\n") };
}

function sessionsTool(input: Record<string, unknown>, d: ToolData): ToolOut {
  const today = localDay(d.now), s = span(input, today);
  if (typeof s === "string") return { text: s, error: true };
  const sets = d.state.entries.filter((e) => e.kind === "set") as unknown as LoggedSet[];
  const ss = sessionsOf(d.state.workouts, sets).filter((x) => localDay(x.startedAt) >= s.from && localDay(x.startedAt) <= s.to);
  if (!ss.length) return { text: `No training sessions between ${s.from} and ${s.to}.` };
  const lines = ss.map((x) => {
    const best = new Map<string, LoggedSet>();
    for (const t of working(x.sets)) { const c = best.get(t.exercise); if (!c || t.kg * (1 + t.reps / 30) > c.kg * (1 + c.reps / 30)) best.set(t.exercise, t); }
    const lifts = [...best.values()].map((t) => `${t.exercise} ${t.kg} kg × ${t.reps}`).join("; ");
    return `- ${localDay(x.startedAt)} ${name(localDay(x.startedAt)).slice(0, 3)} ${clock(x.startedAt)} ${x.template}: ${x.workingSets} working sets, ${Math.round(x.volume).toLocaleString("en-GB")} kg volume${x.pct != null ? `, strength ${x.pct >= 0 ? "+" : ""}${x.pct.toFixed(1)} % against your trend` : ""}${lifts ? ` · best sets: ${lifts}` : ""}`;
  });
  return { text: [`${ss.length} session${ss.length === 1 ? "" : "s"}, ${s.from} to ${s.to}:`, ...lines].join("\n") };
}

function remember(input: Record<string, unknown>, d: ToolData): ToolOut {
  const t = typeof input.text === "string" ? input.text.trim() : "";
  if (t.length < 4 || t.length > 200) return { text: "one short line, 4–200 characters", error: true };
  if (d.state.ai.memory.some((m) => m.text.toLowerCase() === t.toLowerCase())) return { text: "Already remembered." };
  return { text: "Saved to memory.", remember: t };
}

/** Run one call the AI made. Never throws: a bad input comes back as an error result the AI can correct. */
export function runChatTool(call: ToolCall, d: ToolData): ToolOut {
  const input = call.input ?? {};
  switch (call.name) {
    case "day": return day(input, d);
    case "series": return series(input, d);
    case "find": return find(input, d);
    case "show_chart": return series(input, d, true);
    case "remember": return remember(input, d);
    case "compare": return compare(input, d);
    case "nights": return nightsTool(input, d);
    case "sessions": return sessionsTool(input, d);
    default: return { text: `no tool called ${String(call.name)}`, error: true };
  }
}
