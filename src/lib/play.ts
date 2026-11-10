/**
 * The game, wilder (PLAN 204; owner, 10 Nov, on the canvas: "I fucking love the idea of all of these … keep it
 * professional too. keep the datas. keep the smart engine"). Built on lib/game's weekly goals; each part from a study:
 *
 *   defend   start the week at 70; each time a goal slips one more day out of reach, −10 (a miss past its spare days,
 *            a drink over, a session that can't fit any more); 50+ on Sunday levels you up, under 50 down one —
 *            BE FIT (Patel 2017): points you hold and can lose beat points you earn, 53 % of goal days against 32 %
 *   ghosts   your points day by day against last week's you and your best week — STEP UP (Patel 2019): competition beat
 *            support and teamwork, and lasted after
 *   focus    your weakest goal from last week, put first: how much of it is still to go (owner, 10 Nov, on the
 *            boss version: "this goblin ass is cringe" — so no creatures, no titles; plain words)
 *   season   6 weeks each from a fresh start (Dai 2014), a twist from the weakest area at its start (its hits earn season
 *            XP too), 12 tiers — games fade once they stop changing (Mazeas 2022)
 *
 * The stake (deposit contracts, Halpern 2015) and the gym-day treat (temptation bundling, Milkman 2014) are what you
 * pick; this file only says when the stake is due. Pure.
 */

import { goalsFor, monday, progress, type Goal, type GoalId, type Inputs, type Progress } from "./game";
import { addDays, localDay } from "./time";

export const PLAY = { start: 70, miss: 10, keep: 50, weeks: 26, seasonFrom: "2026-11-02", seasonWeeks: 6, tierXp: 50, tiers: 12, twistXp: 10, twistDrinksXp: 50 } as const;

/** What a goal has cost so far: points lost, misses it can still take, one more miss costs (`risk`), and met already. */
export type Cost = { id: GoalId; lost: number; spare: number; risk: boolean; met: boolean };

/** `dayN`: days of the week begun, today counted; `closed`: today is over too. */
export function costOf(g: Progress, dayN: number, closed: boolean): Cost {
  const M = PLAY.miss;
  if (g.kind === "atMost") {
    const over = Math.max(0, g.done - g.target), end = dayN === 7 && closed;
    return { id: g.id, lost: over * M, spare: Math.max(0, g.target - g.done), risk: !end && g.done >= g.target, met: end && !over };
  }
  if (g.kind === "count") {
    const left = 7 - dayN + (closed ? 0 : 1), short = Math.max(0, g.need - g.done), over = Math.max(0, short - left);
    return { id: g.id, lost: over * M, spare: Math.max(0, left - short), risk: short > 0 && left - short <= 0, met: short === 0 };
  }
  const misses = g.days.filter((d) => d === false).length, slack = 7 - g.need, met = g.done >= g.need;
  return { id: g.id, lost: Math.max(0, misses - slack) * M, spare: Math.max(0, slack - misses), risk: !met && misses >= slack, met };
}

export type Play = { from: string; asOf: string; dayN: number; goals: Progress[]; costs: Cost[]; points: number; done: boolean };

/** One week as it stands on `asOf` (`closed`: that day's over). Null with no goals. */
export function playWeek(from: string, asOf: string, inp: Inputs, closed = false, goals?: Goal[]): Play | null {
  const gs = goals ?? goalsFor(from, inp);
  if (!gs.length) return null;
  const dayN = Math.min(7, Math.max(1, Math.round((Date.parse(`${asOf}T12:00:00`) - Date.parse(`${from}T12:00:00`)) / 864e5) + 1));
  const ps = gs.map((g) => progress(g, from, asOf, inp, closed)), costs = ps.map((p) => costOf(p, dayN, closed));
  return { from, asOf, dayN, goals: ps, costs, points: Math.max(0, PLAY.start - costs.reduce((a, c) => a + c.lost, 0)), done: dayN === 7 && closed };
}

/** The points at the end of each day of a week, up to `upTo` (that day still live unless `full`). */
export function track(from: string, inp: Inputs, upTo: string, full = false): number[] {
  const gs = goalsFor(from, inp), out: number[] = [];
  if (!gs.length) return out;
  for (let k = 0; k < 7; k++) {
    const d = addDays(from, k);
    if (d > upTo) break;
    out.push(playWeek(from, d, inp, full || d < upTo, gs)!.points);
  }
  return out;
}

export type Past = Play & { track: number[] };
/** The first day anything was logged (an entry, a session, a night) — weeks before it weren't played. */
export function firstDay(inp: Inputs): string | null {
  let d: string | null = null;
  const see = (x: string) => { if (!d || x < d) d = x; };
  for (const e of inp.entries) see(localDay(e.at));
  for (const w of inp.workouts) see(localDay(w.startedAt));
  for (const b of inp.beds) see(b.eve);
  return d;
}

/** The finished weeks before `today`'s, oldest first — only weeks that had goals, from the week you started. */
export function history(today: string, inp: Inputs, n: number = PLAY.weeks): Past[] {
  const from = monday(today), out: Past[] = [], first = firstDay(inp);
  if (!first) return out;
  for (let k = n; k >= 1; k--) {
    const f = addDays(from, -7 * k), sun = addDays(f, 6);
    if (f < monday(first)) continue; // before you started: a stack "missed" every day of it isn't a week you played
    const p = playWeek(f, sun, inp, true);
    if (p) out.push({ ...p, track: track(f, inp, sun, true) });
  }
  return out;
}

/** Your level: 1 to start; each finished week with 50+ kept, up one; under 50, down one (never under 1). */
export function levelOf(past: Past[]): { level: number; best: number } {
  let level = 1, best = 1;
  for (const w of past) { level = Math.max(1, level + (w.points >= PLAY.keep ? 1 : -1)); best = Math.max(best, level); }
  return { level, best };
}

export type Ghosts = { you: number[]; last: number[] | null; best: number[] | null; bestFrom: string | null; bestPoints: number | null; vsLast: number | null; vsBest: number | null };
/** You this week against last week's you and your best week, at the same point in the week. */
export function ghosts(today: string, inp: Inputs, past: Past[]): Ghosts {
  const you = track(monday(today), inp, today), i = you.length - 1;
  const lastW = past.at(-1)?.from === addDays(monday(today), -7) ? past.at(-1)! : null;
  const bestW = past.length ? past.reduce((a, b) => (b.points > a.points ? b : a)) : null;
  const best = bestW && bestW !== lastW ? bestW : null;
  return { you, last: lastW?.track ?? null, best: best?.track ?? null, bestFrom: best?.from ?? null, bestPoints: best?.points ?? null,
    vsLast: lastW && i >= 0 ? you[i] - lastW.track[i] : null, vsBest: best && i >= 0 ? you[i] - best.track[i] : null };
}

/* ------------------------------------------------------------------ the focus */

export const AREAS: Record<GoalId, string> = { bed: "Bedtime", drinks: "Drinks", protein: "Protein", stack: "The stack", sessions: "Sessions" };

/** How much of a goal a finished week met, 0–1: the weakest is the focus. */
const share = (g: Progress) => (g.kind === "atMost" ? (g.done <= g.target ? 1 : g.target / Math.max(1, g.done)) : Math.min(1, g.done / Math.max(1, g.need)));

/** This week's goals, weakest first by how last week went (no last week: as they come). */
export function weakest(goals: Goal[], last: Play | null): GoalId[] {
  const s = (id: GoalId) => { const g = last?.goals.find((x) => x.id === id); return g ? share(g) : 1; };
  return goals.map((g, i) => ({ id: g.id, s: s(g.id), i })).sort((a, b) => a.s - b.s || a.i - b.i).map((x) => x.id);
}

export type Focus = { id: GoalId; area: string; /** % of it still to go */ left: number; state: "on" | "done" | "missed"; next: GoalId | null };
/** The week's focus: last week's weakest goal. `left`: what it still needs (drinks: the days still to hold); done when met,
 *  missed when it can't be. None without a last week, or when last week met every goal. */
export function focusOf(w: Play, last: Play | null): Focus | null {
  if (!last) return null;
  const order = weakest(w.goals, last), id = order[0], was = last.goals.find((x) => x.id === id);
  if (!id || !was || share(was) >= 1) return null;
  const g = w.goals.find((x) => x.id === id)!, c = w.costs.find((x) => x.id === id)!;
  const held = w.dayN - 1 + (w.done ? 1 : 0);
  const left = g.kind === "atMost" ? (g.done > g.target ? 100 : Math.round(100 * (1 - held / 7))) : Math.round((100 * Math.max(0, g.need - g.done)) / g.need);
  const state = c.met ? "done" : c.lost > 0 ? "missed" : "on";
  return { id, area: AREAS[id], left: state === "done" ? 0 : left, state, next: order[1] ?? null };
}

/* ------------------------------------------------------------------ seasons */

export const SEASONS: Record<GoalId, { name: string; twist: string }> = {
  bed: { name: "Sleep", twist: "each night in bed on time adds 10 season XP" },
  drinks: { name: "Drinks", twist: "a week inside your drinks goal adds 50 season XP" },
  protein: { name: "Protein", twist: "each protein day adds 10 season XP" },
  stack: { name: "Supplements", twist: "each full stack day adds 10 season XP" },
  sessions: { name: "Training", twist: "each session adds 10 season XP" },
};

export type Season = { n: number; from: string; to: string; week: number; id: GoalId; name: string; twist: string; xp: number; tier: number; toNext: number | null };

/** The week's XP: the points kept, and the twist's on top. A drinks week counts its bonus once it's over. */
function xpOf(w: Play, twist: GoalId): number {
  const g = w.goals.find((x) => x.id === twist), c = w.costs.find((x) => x.id === twist);
  const bonus = !g ? 0 : g.kind === "atMost" ? (c?.met ? PLAY.twistDrinksXp : 0) : g.done * PLAY.twistXp;
  return w.points + bonus;
}

/** The season `today` is in: 6 weeks from 2 Nov 2026, every 6 weeks after; its twist from its first week's focus. */
export function seasonOf(today: string, now: Play | null, past: Past[]): Season {
  const weeks = Math.floor((Date.parse(`${monday(today)}T12:00:00`) - Date.parse(`${PLAY.seasonFrom}T12:00:00`)) / (7 * 864e5));
  const n = Math.max(0, Math.floor(weeks / PLAY.seasonWeeks)), from = addDays(PLAY.seasonFrom, 7 * PLAY.seasonWeeks * n), to = addDays(from, 7 * PLAY.seasonWeeks - 1);
  const first = from === now?.from ? now : past.find((w) => w.from === from) ?? null;
  const prev = past.find((w) => w.from === addDays(from, -7)) ?? null;
  const id = (first ? focusOf(first, prev)?.id : null) ?? "bed";
  const ws = [...past.filter((w) => w.from >= from && w.from <= to), ...(now && now.from >= from ? [now] : [])];
  const xp = ws.reduce((a, w) => a + xpOf(w, id), 0), tier = Math.min(PLAY.tiers, Math.floor(xp / PLAY.tierXp));
  return { n: n + 1, from, to, week: Math.min(PLAY.seasonWeeks, Math.max(1, weeks - n * PLAY.seasonWeeks + 1)), id, ...SEASONS[id], xp, tier,
    toNext: tier < PLAY.tiers ? (tier + 1) * PLAY.tierXp - xp : null };
}

/* ------------------------------------------------------------------ the stake */

export type Stake = { what: string; paid?: boolean };
/** Last week's stake if it's owed: set, under 50 kept, not done yet. */
export function stakeDue(stakes: Record<string, Stake> | undefined, past: Past[], today: string): { from: string; what: string } | null {
  const f = addDays(monday(today), -7), s = stakes?.[f], w = past.find((x) => x.from === f);
  return s?.what && !s.paid && w && w.points < PLAY.keep ? { from: f, what: s.what } : null;
}

/** Where a goal stands, in a few words: "−10", "done", "next miss costs 10", "2 spare nights". */
export function standing(g: Progress, c: Cost): { say: string; tone?: "ok" | "risk" | "lost" } {
  if (c.lost) return { say: `−${c.lost}`, tone: "lost" };
  if (c.met) return { say: "done", tone: "ok" };
  if (c.risk) return { say: g.kind === "atMost" ? "one more costs 10" : g.kind === "count" ? "no days to spare" : "next miss costs 10", tone: "risk" };
  const s = c.spare, unit = g.kind === "atMost" ? "" : g.id === "bed" ? ` night${s === 1 ? "" : "s"}` : ` day${s === 1 ? "" : "s"}`;
  return { say: g.kind === "atMost" ? `${s} to spare` : `${s} spare${unit}` };
}

/* ------------------------------------------------------------------ all of it */

export type Game = { now: Play; past: Past[]; level: { level: number; best: number }; ghosts: Ghosts; focus: Focus | null; season: Season; risk: Cost[] };
/** Everything the Today card and the game page show, or null with no goals this week. */
export function gameOf(today: string, inp: Inputs): Game | null {
  const now = playWeek(monday(today), today, inp);
  if (!now) return null;
  const past = history(today, inp), last = past.at(-1)?.from === addDays(now.from, -7) ? past.at(-1)! : null;
  return { now, past, level: levelOf(past), ghosts: ghosts(today, inp, past), focus: focusOf(now, last), season: seasonOf(today, now, past),
    risk: now.costs.filter((c) => c.risk) };
}
