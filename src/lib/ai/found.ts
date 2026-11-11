/**
 * What the app's own maths found, for the AI (PLAN 214; owner, 11 Nov: "do 1, 2" — 1: "the AI uses what we built today").
 * The reads and the chat see what Today and Insights show, in a few lines: the body watch when it alerts, where you stand
 * out and where you're behind (with the fix), your worst pair for focus and mood, the experiments' results with how sure
 * and your guess, your gut's record, what's new this week, your sleep regularity. All the app's numbers — the AI quotes
 * them, never works its own. Pure.
 */

import type { BandData } from "../band";
import { bodyWatch, illDays } from "../bodywatch";
import { combos, standPairs } from "../combos";
import { dayTable, OUTCOMES, type OutcomeKey } from "../daytable";
import type { DayFacts } from "../insights";
import { newThisWeek } from "../newfindings";
import type { Experiment } from "../store";
import { localDay } from "../time";
import type { Entry } from "../types";
import type { VsNow } from "../vsnow";
import { judge } from "./apply";
import { RESULT_WORDS } from "./experiment";
import { GUESS_WORDS, guessRight, gutRecord, type Outcome } from "./guess";

const final = (s: string): Outcome | null => (s === "better" || s === "worse" || s === "no-clear-change" ? s : null);
const pct = (p: number) => Math.min(99, Math.max(1, Math.round(p * 100)));

export function foundLines(o: { band: BandData | null; entries: Entry[]; days: DayFacts[]; experiments: Experiment[]; vs: VsNow | null; today: string }): string[] {
  const { band, entries, days, today } = o, out: string[] = [];
  // the body watch, only when it shows on Today
  if (band) {
    const w = bodyWatch(band, today, illDays(entries, localDay), new Set(days.filter((d) => d.logged && d.alcoholG >= 42).map((d) => d.day)));
    if (w.alert) out.push(`Body watch (on Today this morning): ${w.off.map((s) => `${s.name.toLowerCase()} ${s.say}`).join(", ")} against their usual${w.running > 1 ? `, ${w.running} mornings running` : ""} — the pattern that came before colds in band studies, and after drinks or a very hard day.${w.track ? ` ${w.track}` : ""}`);
  }
  // you vs everyone
  for (const g of o.vs?.stand.good ?? []) out.push(`Stands out against everyone: ${g.title} — ${g.vs}.`);
  for (const b of o.vs?.stand.bad ?? []) out.push(`Behind against everyone: ${b.title} — ${b.vs}.${b.fix ? ` The app's fix: ${b.fix}` : ""}`);
  // the worst pair for focus and mood (two things together)
  const rows = dayTable(days, band);
  for (const k of ["focus", "mood"] as OutcomeKey[]) {
    const cs = combos(rows, k), w = cs?.length ? standPairs(cs).worst : null;
    if (w) out.push(`Worst pair for ${OUTCOMES[k].name.toLowerCase()}: ${w.say}${w.fix ? ` The app's fix: ${w.fix}` : ""}`);
  }
  // experiments: the app's result, how sure, your guess
  for (const x of o.experiments) {
    const v = judge(x, days, today), st = x.verdict?.state ?? final(v.state);
    if (!st) continue;
    const r = guessRight(x.guess, st);
    out.push(`Experiment "${x.name}" (${x.measure}): ${RESULT_WORDS[st]}${v.sure != null ? ` — ${v.sure >= 0.5 ? `${pct(v.sure)} % sure it helped` : `${pct(1 - v.sure)} % sure it made it worse`}` : ""}${x.guess ? `; they guessed "${GUESS_WORDS[x.guess]}" — ${r ? "right" : "wrong"}` : ""}.`);
  }
  const gut = gutRecord(o.experiments, (x) => final(judge(x, days, today).state));
  if (gut) out.push(gut.say);
  // new in their data this week, and sleep regularity
  for (const n of newThisWeek(days, band, today, 3)) out.push(`New this week (${n.kind.toLowerCase()}, ${n.where}): ${n.say}`);
  const reg = [...days].reverse().find((d) => d.regular != null)?.regular;
  if (reg != null) out.push(`Sleep regularity over the last 7 nights: ${Math.round(reg)}/100 (most adults 60–90).`);
  return out;
}
