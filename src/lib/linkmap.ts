/**
 * What goes with what, as a map (renovation part 3, canvas A "two columns"; owner, 13 Nov: "do 1 then 3"). The links
 * lib/connect finds (each held after checking many at once) laid out for drawing: what you do on the left, how you are on
 * the right, each link an edge — good when it goes with the better side of its outcome, its weight the correlation.
 * Inputs are ordered by where their outcomes sit, so lines cross less. Each outcome carries its own trend (lib/trends),
 * which lets the map say what to look at: an outcome that's slipping, the things you do that go with it slipping, and
 * whether you've been doing more of them lately. Goes with, never causes. Pure.
 */

import type { Link, Thing } from "./connect";
import { trendOf, type Trend } from "./trends";
import { addDays } from "./time";

export const LINKMAP = { days: 90, recent: 30, minDays: 10, moreSd: 0.5 } as const;

export type MapEdge = { from: string; to: string; lag: 0 | 1 | 2; good: boolean; w: number; link: Link };
export type MapNode = { key: string; name: string };
export type LinkMap = { inputs: MapNode[]; outcomes: (MapNode & { trend: Trend | null })[]; edges: MapEdge[] };

/** Does this link go with the better side of its outcome? (An outcome with no better side: more is called better.) */
export const goesGood = (l: Link, to: Thing | undefined) => (to?.better ?? 1) * Math.sign(l.slope) >= 0;

export function linkMap(links: Link[], things: Thing[], today: string, days: number = LINKMAP.days): LinkMap {
  const by = new Map(things.map((t) => [t.key, t]));
  const edges: MapEdge[] = links.filter((l) => by.has(l.from) && by.has(l.to)).map((l) => ({ from: l.from, to: l.to, lag: l.lag, good: goesGood(l, by.get(l.to)), w: Math.abs(l.rho), link: l }));
  // outcomes: the most linked first; inputs: each at the weighted middle of its outcomes (fewer crossings)
  const deg = (k: string) => edges.filter((e) => e.to === k).reduce((a, e) => a + e.w, 0);
  const outKeys = [...new Set(edges.map((e) => e.to))].sort((a, b) => deg(b) - deg(a));
  const at = new Map(outKeys.map((k, i) => [k, i]));
  const mid = (k: string) => { const es = edges.filter((e) => e.from === k), w = es.reduce((a, e) => a + e.w, 0); return es.reduce((a, e) => a + at.get(e.to)! * e.w, 0) / (w || 1); };
  const inKeys = [...new Set(edges.map((e) => e.from))].sort((a, b) => mid(a) - mid(b) || a.localeCompare(b));
  return {
    inputs: inKeys.map((k) => ({ key: k, name: by.get(k)!.name })),
    outcomes: outKeys.map((k) => { const t = by.get(k)!; return { key: k, name: t.name, trend: trendOf({ key: k, name: t.name, unit: t.unit, better: t.better ?? 0, series: t.series }, today, days) }; }),
    edges,
  };
}

export type LookAt = { outcome: MapNode & { trend: Trend; unit: string; better: 1 | -1 }; inputs: { key: string; name: string; lag: 0 | 1 | 2; lately: "more" | "less" | null; /** lately moved the way that goes with worse */ against: boolean }[] };

/** More or less of it in the last 30 days than the 30 before, by half its spread or more (about twice the error of two 30-day means; a quarter let noise through a third of the time); null when unclear. */
export function lately(s: Record<string, number>, today: string): "more" | "less" | null {
  const win = (from: number, to: number) => { const v: number[] = []; for (let d = from; d < to; d++) { const x = s[addDays(today, -d)]; if (x != null && Number.isFinite(x)) v.push(x); } return v; };
  const a = win(0, LINKMAP.recent), b = win(LINKMAP.recent, 2 * LINKMAP.recent);
  if (a.length < LINKMAP.minDays || b.length < LINKMAP.minDays) return null;
  const all = [...a, ...b], m = all.reduce((x, y) => x + y, 0) / all.length, sd = Math.sqrt(all.reduce((x, y) => x + (y - m) ** 2, 0) / all.length);
  const d = a.reduce((x, y) => x + y, 0) / a.length - b.reduce((x, y) => x + y, 0) / b.length;
  return sd > 0 && Math.abs(d) >= LINKMAP.moreSd * sd ? (d > 0 ? "more" : "less") : null;
}

/** The slipping outcome with the most going against it, and those things; null when nothing linked is slipping. */
export function lookAt(map: LinkMap, things: Thing[], today: string): LookAt | null {
  const by = new Map(things.map((t) => [t.key, t]));
  const cands = map.outcomes.filter((o) => o.trend?.tone === "worse").map((o) => ({ o, bad: map.edges.filter((e) => e.to === o.key && !e.good).sort((a, b) => b.w - a.w) })).filter((c) => c.bad.length);
  if (!cands.length) return null;
  const { o, bad } = cands.sort((a, b) => b.bad.reduce((s, e) => s + e.w, 0) - a.bad.reduce((s, e) => s + e.w, 0))[0];
  const t = by.get(o.key)!;
  return { outcome: { key: o.key, name: o.name, trend: o.trend!, unit: t.unit, better: (t.better ?? 1) >= 0 ? 1 : -1 },
    inputs: bad.slice(0, 3).map((e) => {
      // `up`: more of it goes with worse (drinks); else less of it does (sleep) — lately moving that way is what to look at
      const l = lately(by.get(e.from)!.series, today), up = Math.sign(e.link.slope) * (t.better ?? 1) < 0;
      return { key: e.from, name: by.get(e.from)!.name, lag: e.lag, lately: l, against: l != null && (l === "more") === up };
    }) };
}

const LAG = ["the same day", "the next day", "two days on"] as const;
const low = (n: string) => (/^[A-Z0-9]+$/.test(n) ? n : n.toLowerCase());
const num = (v: number) => (Math.abs(v) >= 10 ? String(Math.round(v)) : v.toFixed(1));
const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
const COUNT = ["", "One thing", "Two things", "Three things"];

/** "HRV is slipping (52 → 47 ms over 90 days). Two things you do go with lower HRV: drinks (the next day) and bedtime (the
 * next day). Lately: more drinks, the last 30 days against the 30 before." */
export function lookWords(a: LookAt, days: number = LINKMAP.days): string {
  const o = a.outcome, worse = o.better > 0 ? "lower" : "higher", u = o.unit ? ` ${o.unit}` : "";
  const head = `${o.name} is slipping (${num(o.trend.first)} → ${num(o.trend.now)}${u} over ${days} days).`;
  const sameLag = a.inputs.every((i) => i.lag === a.inputs[0].lag);
  const things = sameLag ? `${list(a.inputs.map((i) => low(i.name)))}, ${LAG[a.inputs[0].lag]}` : list(a.inputs.map((i) => `${low(i.name)} (${LAG[i.lag]})`));
  const against = a.inputs.filter((i) => i.against);
  return `${head} ${COUNT[a.inputs.length]} you do ${a.inputs.length === 1 ? "goes" : "go"} with ${worse} ${low(o.name)}: ${things}.`
    + (against.length ? ` Lately: ${list(against.map((i) => `${i.lately} ${low(i.name)}`))}, the last 30 days against the 30 before.` : "");
}

export type BarRow = { key: string; name: string; lag: 0 | 1 | 2; /** one spread more of the input, in the outcome's spreads; + is better */ eff: number; lo: number; hi: number; good: boolean; link: Link };
export type OutcomeBars = { key: string; name: string; trend: Trend | null; rows: BarRow[] };

const spread = (s: Record<string, number>) => { const v = Object.values(s).filter(Number.isFinite), m = v.reduce((a, x) => a + x, 0) / (v.length || 1); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length || 1)); };
/**
 * Every outcome with what goes with it, listed (owner, on canvas B: "i want these things listed not me picking"): each
 * link as how far one usual spread more of the input moves the outcome, in the outcome's usual spread — so drinks and
 * steps sit on one scale — signed so + is better, with its 90 % range; worst first.
 */
export function outcomeBars(map: LinkMap, things: Thing[]): OutcomeBars[] {
  const by = new Map(things.map((t) => [t.key, t]));
  return map.outcomes.map((o) => {
    const to = by.get(o.key)!, so = spread(to.series), sign = (to.better ?? 1) >= 0 ? 1 : -1;
    const rows = map.edges.filter((e) => e.to === o.key).map((e): BarRow => {
      const k = so > 0 ? (spread(by.get(e.from)!.series) / so) * sign : 0, a = e.link.lo * k, b = e.link.hi * k;
      return { key: e.from, name: by.get(e.from)!.name, lag: e.lag, eff: e.link.slope * k, lo: Math.min(a, b), hi: Math.max(a, b), good: e.good, link: e.link };
    }).sort((a, b) => a.eff - b.eff);
    return { key: o.key, name: o.name, trend: o.trend, rows };
  }).filter((o) => o.rows.length);
}
