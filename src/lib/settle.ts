/**
 * Asking harder (PLAN 188 phase 4; owner, 3 Nov: "go harder on the app studying me, seeing connections, asking ab them" —
 * then "do 1 and 2"). The finding nearest to settled asks for what would settle it: "likely" ones first (the same way in
 * both halves and under 5 % on their own, not yet past the correction), then "early" ones a week or less from an
 * answer. What settles a with/without question is more days on its short side — so it says which ("6 more days skipping
 * Saffron"), and when the short side is days WITHOUT something you can choose to leave out (a supplement, caffeine after
 * 14:00, drinks, eating late) it offers that as an experiment. Never to do more of anything. Pure.
 */

import type { Evidence, Word } from "./evidence";
import { addDays } from "./time";

export const SETTLE = { maxNeed: 7, rest: 14, tryDays: 7, minNeed: 3 } as const;
/** Questions whose "without" side is a thing to try leaving out. */
const LEAVE_OUT = /^(supp-|late-caf|caf-bed|alc-|late-eat)/;
const MEASURES = new Set(["energy", "mood", "focus", "stress", "sleep"]);

export type Settle = {
  key: string; word: Word; thing: string; outcome: string; need: number; side: "with" | "without"; sideWords: string;
  nOn: number; nOff: number; meanOn: number; meanOff: number;
  try?: { name: string; how: string; days: number; measure: string };
};

/** The one to ask about now, or null: not one resting ("Not now"), nor one already being tried. */
export function settleNext(ev: Evidence, rest: Record<string, string>, today: string, running: string[] = []): Settle | null {
  const out: Settle[] = [];
  for (const [key, { word, r }] of ev) {
    if (word !== "likely" && word !== "early") continue;
    if (r.q.kind !== "binary" || r.o.key === "kcal" || r.q.id === "weekend" || (rest[key] && rest[key] > today)) continue;
    // an early one with too few days has no adjusted effect yet: the raw difference so far has to be worth settling
    if (word === "early" && (r.need > SETTLE.maxNeed || r.n === 0 || !(Math.abs((r.b ?? r.meanOn - r.meanOff)) >= r.o.minEffect))) continue;
    const side = r.nOn <= r.nOff ? "with" : "without", need = Math.max(SETTLE.minNeed, r.need);
    const sideWords = side === "with" ? r.q.more?.[0] ?? `days with ${r.q.thing.toLowerCase()}` : r.q.more?.[1] ?? `days without ${r.q.thing.toLowerCase()}`;
    const name = `No ${r.q.thing.charAt(0).toLowerCase()}${r.q.thing.slice(1)} for ${SETTLE.tryDays} days`;
    if (running.includes(name)) continue; // being tried now: the experiment settles it
    const tryIt = side === "without" && LEAVE_OUT.test(r.q.id) && MEASURES.has(r.o.key)
      ? { name, how: `Leave out ${r.q.thing.charAt(0).toLowerCase()}${r.q.thing.slice(1)} for ${SETTLE.tryDays} days and keep the rest as usual — it settles whether it goes with your ${r.o.name}.`, days: SETTLE.tryDays, measure: r.o.key } : undefined;
    out.push({ key, word, thing: r.q.thing, outcome: r.o.name, need, side, sideWords, nOn: r.nOn, nOff: r.nOff, meanOn: r.meanOn, meanOff: r.meanOff, ...(tryIt ? { try: tryIt } : {}) });
  }
  return out.sort((a, b) => Number(b.word === "likely") - Number(a.word === "likely") || a.need - b.need)[0] ?? null;
}

/** "Not now": rests it SETTLE.rest days. */
export const restSettle = (rest: Record<string, string>, key: string, today: string) => ({ ...rest, [key]: addDays(today, SETTLE.rest) });
