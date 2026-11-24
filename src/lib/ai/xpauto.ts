/**
 * Experiments that end themselves (PLAN 225; owner, 17 Nov: "5"). Three things the app now does on its own:
 *
 *  - **Days the log can answer.** "No drinks", "no caffeine after 14:00", "no caffeine", leaving a supplement out: on a day
 *    you logged, the app knows whether you did it, so the morning doesn't ask. A day with nothing logged is still asked.
 *  - **Ending early when it's clear.** From 7 counted days, it's checked once a day as if it ended then — on a stricter bar
 *    (99 %, not 95 %), so looking every day doesn't let chance through. Clear → it ends that day with its result.
 *  - **A few more days when it's unclear.** At its end, if the range is wide (it could still be worth having either way), it
 *    runs up to 7 days more, once. Then it ends with what it has.
 *
 * And the result in plain words: it helped, it made it worse, no difference (the range sits inside ±half a point — nothing
 * worth having), can't tell (the range is wide). Measured on fake people (xpauto.test). Pure.
 */

import type { DayFacts } from "../insights";
import type { Experiment } from "../store";
import type { Supplement } from "../types";
import { judge, type Verdict } from "./apply";
import { xpCounted, xpEnd, xpOver } from "./xpdays";
import { blockOn } from "./blocks";

export const XPA = { firstLook: 7, earlyAlpha: 0.002, flat: 0.5, extend: 7 } as const;

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** What "did you do it?" means in the log, for the protocols it can answer; null when it can't. */
export function autoRule(x: Pick<Experiment, "name" | "how">, supps: Pick<Supplement, "id" | "name">[] = []): ((d: DayFacts) => boolean | null) | null {
  const t = fold(`${x.name} ${x.how}`);
  // "on 5 nights of 7" is a week's quota, not each day: the day can't say
  if (/\d+\s*(nights?|days?)\s*(of|out of)\s*(the\s*)?\d+/.test(t)) return null;
  if (/\b(no|zero|skip|without|cut out)\b[^.]{0,20}\b(drinks?|alcohol|beer|wine)\b|alcohol[- ]free|\bdry\b/.test(t)) return (d) => (d.logged ? d.alcoholG === 0 : null);
  if (/caffeine (after|past) (14|2 ?pm)/.test(t)) return (d) => (d.logged ? d.lateCaffeineMg === 0 : null);
  if (/\b(no|zero|without|cut out)\b[^.]{0,12}\b(caffeine|coffee)\b|caffeine[- ]free/.test(t)) return (d) => (d.logged ? d.caffeineMg === 0 : null);
  const s = supps.find((p) => p.name.length >= 3 && new RegExp(`\\b(no|skip|without|leave out|stop)\\b[^.]{0,16}\\b${fold(p.name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(t));
  if (s) return (d) => (d.taken?.has(s.id) ? false : d.skipped?.has(s.id) ? true : null);
  return null;
}

/** The days the log answers, from its start to yesterday, that you haven't answered yourself. */
export function autoDays(x: Experiment, days: DayFacts[], supps: Pick<Supplement, "id" | "name">[], today: string): Record<string, boolean> {
  const rule = autoRule(x, supps);
  if (!rule || x.ended || x.verdict) return {};
  const end = [xpEnd(x), today].sort()[0], out: Record<string, boolean> = {};
  for (const d of days) {
    if (d.day < x.start || d.day >= end || x.did?.[d.day] != null) continue;
    if (x.blocks && !blockOn(x.blocks, x.start, d.day)?.on) continue; // an OFF day: nothing to answer
    const v = rule(d);
    if (v != null) out[d.day] = v;
  }
  return out;
}

export type Look = { early: string } | { extra: number } | null;

/** Today's look at a running experiment: end it now (clear on the stricter bar), give it more days (unclear and wide), or nothing. */
export function xpLook(x: Experiment, days: DayFacts[], today: string): Look {
  if (x.ended || x.verdict || x.early) return null;
  const end = xpEnd(x);
  if (today < end) {
    if (xpCounted(x, today) < XPA.firstLook) return null;
    const v = judge({ ...x, ended: today, early: today }, days, today, XPA.earlyAlpha);
    return v.state === "better" || v.state === "worse" ? { early: today } : null;
  }
  if (x.extra || !xpOver(x, today)) return null;
  const v = judge(x, days, today);
  return v.state === "too-few" || (v.state === "no-clear-change" && !flat(v)) ? { extra: XPA.extend } : null;
}

/** The range sits inside ±half a point: whatever it does is too small to be worth having. */
export const flat = (v: Pick<Verdict, "ci">) => !!v.ci && v.ci[0] >= -XPA.flat && v.ci[1] <= XPA.flat;

/** The result in plain words. */
export function plainResult(v: Pick<Verdict, "state" | "ci">): string | null {
  if (v.state === "better") return "it helped";
  if (v.state === "worse") return "it made it worse";
  if (v.state === "no-clear-change") return flat(v) ? "no difference" : "can't tell";
  if (v.state === "too-few") return "can't tell — too few rated days";
  return null;
}

/** Every experiment's changes for today, as patches (only those with something to change). */
export function xpAutoPatches(xs: Experiment[], days: DayFacts[], supps: Pick<Supplement, "id" | "name">[], today: string): { id: string; patch: Partial<Experiment> }[] {
  return xs.flatMap((x) => {
    const auto = autoDays(x, days, supps, today), withAuto = Object.keys(auto).length ? { ...x, did: { ...(x.did ?? {}), ...auto }, auto: { ...(x.auto ?? {}), ...auto } } : x;
    const look = xpLook(withAuto, days, today);
    const patch: Partial<Experiment> = { ...(withAuto !== x ? { did: withAuto.did, auto: withAuto.auto } : {}), ...(look && "early" in look ? { early: look.early, ended: look.early } : {}), ...(look && "extra" in look ? { extra: look.extra } : {}) };
    return Object.keys(patch).length ? [{ id: x.id, patch }] : [];
  });
}
