/**
 * What the AI is told from the body lab (PLAN 177; owner, 15 Oct: "make sure app sees all data, organized"): the morning
 * after a night out, what each drink / a smoking day / late caffeine has gone with, the wound-up hour, the body clock and
 * fitness age — only what the app's own tests call clear or likely, with the numbers it showed you. Chance never
 * reaches the AI as a finding. `labLines` only words what's computed (tested on its own); `labNow` computes it.
 */

import type { BandData } from "../band";
import { drinkDose, labNights, lateCaffeine, smokeCompare, type DrinkDose, type SmokeCompare } from "../bodylab";
import { bodyClock, clockOf, type BodyClock } from "../bodyclock";
import { cardioSpans } from "../cardio";
import { cardioByDay, fitAge, fitLine, type FitAge } from "../fitage";
import { usualByHour } from "../hrusual";
import { sessions } from "../liftstrength";
import type { LoggedSet } from "../training";
import { recoveryInputs, recoveryNow, type Recovery } from "../recovery";
import type { Slope } from "../sessionfacts";
import { nights } from "../sleep";
import type { State } from "../store";
import { addDays, clock, DAY, localDay } from "../time";
import type { EntryOf } from "../types";
import { kgByDay } from "../vo2";
import { woundHeat, type Heat } from "../wound";

const sure = (f: Slope | { sure: string } | null | undefined) => !!f && (f.sure === "clear" || f.sure === "likely");
const sg = (v: number, d = 1) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(d)}`;
const hh = (h: number) => `${String(h % 24).padStart(2, "0")}:00`;

export type Lab = { recovery: Recovery | null; drink: DrinkDose | null; smoke: SmokeCompare; caf: ReturnType<typeof lateCaffeine>; heat: Heat | null; clock: BodyClock | null; fit: FitAge | null };

export function labLines(l: Lab, now: number): string[] {
  const out: string[] = [];
  const r = l.recovery;
  if (r) {
    const h = r.hit;
    out.push(`Last night was a night out (${r.drinks} drink${r.drinks === 1 ? "" : "s"}${r.cigs ? `, cigarettes` : ""}, bed ${clock(r.night.bed)})${h.hrv != null && h.hrvUsual != null ? `: HRV ${h.hrv} ms vs usual ${h.hrvUsual}` : ""}${h.meanHr != null ? `, heart rate asleep ${sg(h.meanHr, 0)} bpm vs usual` : ""}. `
      + (r.shrugged ? "Back in the usual range already this morning." : r.backAt != null ? `Back to usual likely by ${localDay(r.backAt) === localDay(now) ? "today" : localDay(r.backAt) === addDays(localDay(now), 1) ? "tomorrow" : localDay(r.backAt)} ~${clock(r.backAt)} (typical from ${r.past} past nights out).` : `Not enough past nights out to say when back to usual (${r.past}).`)
      + r.factors.map((f) => ` After past nights out, "${f.name}" went with being back ~${f.gainH} h sooner (${f.with} with, ${f.without} without).`).join("")
      + (r.lifts ? ` Lifts the day after nights out ran ${sg(r.lifts.pct, 0)} % vs other sessions (${r.lifts.n} sessions).` : ""));
  }
  const d = l.drink;
  if (d && (sure(d.hr?.fit) || sure(d.hrv?.fit))) {
    const parts = [sure(d.hr?.fit) && `heart rate asleep ${sg(d.hr!.fit.slope!)} bpm (${d.hr!.fit.sure})`, sure(d.hrv?.fit) && `HRV ${sg(d.hrv!.fit.slope!)} ms (${d.hrv!.fit.sure})`].filter(Boolean);
    out.push(`Each drink that evening went with ${parts.join(", ")} that night — nights in each column 0/1/2/3/4+: ${d.nights.join("/")}.`);
  }
  const s = l.smoke;
  if (s) for (const row of s.rows.filter((x) => sure(x.fit))) out.push(`Smoking days (drinking nights left out) vs days with none: ${row.name.toLowerCase()} ${Math.round(row.smoked)} vs ${Math.round(row.not)} ${row.unit} (${row.fit.sure}; ${s.smoked} vs ${s.not} days).`);
  const c = l.caf;
  if (c && sure(c.fit) && c.per100 != null) out.push(`Every 100 mg of caffeine after 14:00 went with ${Math.abs(Math.round(c.per100))} min ${c.per100 < 0 ? "less" : "more"} deep sleep (${c.fit.sure}; ${c.fit.pts.length} nights).`);
  const t = l.heat?.top;
  if (t) out.push(`Most wound-up hour (heart 10+ above usual while still): ${t.name} ${hh(t.h)}–${hh(t.h + 1)}, ${t.hot} of the last ${t.weeks} ${t.name}s (~${Math.round(t.perHour)} min an hour).`);
  const k = l.clock;
  if (k) {
    const bits = [k.sleep && `asleep ~${clockOf(k.sleep.onset)} to ~${clockOf(k.sleep.wake)} (midpoint ${clockOf(k.sleep.mid)})`, k.low != null && `night low ${clockOf(k.low)}`,
      k.shift != null && Math.abs(k.shift) >= 20 && `weekends ${sg(k.shift, 0)} min later`,
      sure(k.focus) && `focus best ${hh(k.focus!.from)}–${hh(k.focus!.to)} (${k.focus!.mean.toFixed(1)} vs ${k.focus!.rest.toFixed(1)}, ${k.focus!.sure})`,
      sure(k.slump) && `energy dips ${hh(k.slump!.from)}–${hh(k.slump!.to)} (${k.slump!.mean.toFixed(1)} vs ${k.slump!.rest.toFixed(1)}, ${k.slump!.sure})`].filter(Boolean);
    if (bits.length) out.push(`Body clock, last 30 days: ${bits.join("; ")}.`);
  }
  if (l.fit) out.push(fitLine(l.fit));
  return out;
}

/** The same, computed from the store and the band (what's loaded of it). A body-lab bug never stops a read: nothing then. */
export function labNow(state: State, band: BandData | null, now: number): string[] {
  try { return labCompute(state, band, now); } catch { return []; }
}

function labCompute(state: State, band: BandData | null, now: number): string[] {
  const today = localDay(now);
  const ns = band ? nights(band.sleep, band.hr, band.rhr, band.hrv).filter((n) => n.up <= now && n.up >= now - 90 * DAY) : [];
  const sets = state.entries.filter((e): e is EntryOf<"set"> => e.kind === "set") as LoggedSet[];
  let recovery: Recovery | null = null;
  if (band && ns.length) {
    const inp = recoveryInputs(ns, state.entries, band.steps ?? [], band.hr);
    recovery = recoveryNow(ns, inp.evenings, inp.after, sessions(state.workouts, sets).map((x) => ({ day: localDay(x.startedAt), pct: x.pct })), today, now);
  }
  const ls = labNights(ns, state.entries);
  const spans = state.workouts.map((w) => ({ start: w.startedAt, end: w.endedAt ?? w.startedAt + 3_600_000 }));
  const heat = band ? woundHeat(band.hr, band.sleep, spans, band.steps ?? [], usualByHour(band.hr, spans, today, 14), today) : null;
  // fitness age only once you've said whose norms (the card asks): never a guess at men's or women's
  const sex = state.settings.sex;
  const fit = band && sex ? fitAge(band.vo2, today, sex, { age: state.settings.age, kg: kgByDay(state.entries), rhr: band.rhr, cardio: cardioByDay(cardioSpans(state.workouts, now)) }) : null;
  return labLines({ recovery, drink: ns.length ? drinkDose(ls) : null, smoke: smokeCompare(ls), caf: lateCaffeine(ls), heat, clock: bodyClock(ns, state.entries, today), fit }, now);
}
