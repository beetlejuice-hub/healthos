/**
 * The app writes to you (PLAN 102; owner, 15 Oct: "send me messages like hey your heart rate was pretty elevated in this
 * time range, what were you doing, or new findings that i can comment on, like not x caused y, but i was doing z" → "as per
 * your recommendations": one place, the AI tab, a few a day, never repeated, the answers saved so they count). Pure: which
 * heart-rate stretches to ask about, which grid cells are new findings, the words, and the daily cap. The shell hook
 * (components/Inbox) feeds it the band and the log; the cards answer through the store.
 */

import type { Raised, Why } from "./heart";
import type { Readiness } from "./readiness";
import type { Cell, Factor, Outcome } from "./sleep";
import type { Standout } from "./standout";
import { clock, localDay, HOUR, MIN } from "./time";

/** New messages a day, at most: heart asks first (they're about today), then findings. */
export const DAILY_CAP = 3;
/** A stretch is asked about when it's "very" (+15) or this long; shorter slight ones are a band's everyday noise. */
export const ASK_LONG_MIN = 40;
/** …and over: the band's latest reading this far past its end, so it isn't still going (the band syncs every 15 min). */
export const ASK_SETTLE_MIN = 20;
/** …and recent: you can still remember it. */
export const ASK_WITHIN_H = 24;

export type Notice = {
  /** Also its key: one per stretch (`raised:<start>`), one per grid cell and direction (`finding:<grid>:<factor>|<outcome>|<toward>`). */
  id: string;
  kind: "raised" | "finding" | "readiness";
  /** When the app wrote it. */
  at: number;
  title: string;
  text: string;
  /** A heart ask: the stretch, so the answer is saved in its middle (as the Heart page saves it). */
  span?: { start: number; end: number };
  /** A readiness ask: the morning it's about, so the answer joins that morning's last-night tags. */
  day?: string;
  /** Your answer, as said. */
  reply?: { text: string; at: number } | null;
  /** Closed without an answer: "not now", or explained since (you logged something around it). */
  closed?: boolean;
};

const sgn = (v: number, d: number) => { const t = Math.abs(v).toFixed(d); return Number(t) === 0 ? `±${t}` : `${v > 0 ? "+" : "−"}${t}`; };

/** Asked about: nothing explains it, it's over, it's from the last day, and it's big or long enough to matter. */
export function askable(r: Raised, why: Why[], latest: number, now: number): boolean {
  return why.length === 0 && r.end <= latest - ASK_SETTLE_MIN * MIN && r.end >= now - ASK_WITHIN_H * HOUR && (r.level === "very" || r.end - r.start >= ASK_LONG_MIN * MIN);
}

export function raisedNotice(r: Raised, now: number): Notice {
  const day = localDay(r.start) === localDay(now) ? "" : "yesterday ";
  // under your usual (owner, 22 Oct: "ask about the unusually high or low heart bpm too")
  if (r.low) return {
    id: `lowered:${r.start}`, kind: "raised", at: now, span: { start: r.start, end: r.end },
    title: `Heart rate down ${day}${clock(r.start)}–${clock(r.end)}`,
    text: `−${Math.round(r.excess)} bpm under your usual for then${r.level === "very" ? `, lowest ${Math.round(r.peak)}` : ""}, awake, and nothing logged around it. What were you doing?`,
  };
  return {
    id: `raised:${r.start}`, kind: "raised", at: now, span: { start: r.start, end: r.end },
    title: `Heart rate up ${day}${clock(r.start)}–${clock(r.end)}`,
    text: `+${Math.round(r.excess)} bpm over your usual for then${r.level === "very" ? `, peak ${Math.round(r.peak)}` : ""}, and nothing logged around it. What were you doing?`,
  };
}

/** Readiness under this ("take it easier") asks what happened (owner, 15 Oct: "can do"). */
export const READY_ASK_UNDER = 60;

/** A low morning, asked about: why it's low in a few words, what stood out about last night if anything, and the question. */
export function readinessNotice(r: Readiness, so: Pick<Standout, "label"> | null, now: number): Notice | null {
  if (r.score >= READY_ASK_UNDER) return null;
  const low = [...r.parts].sort((a, b) => a.got / a.max - b.got / b.max || b.max - a.max)[0];
  const why = r.cap ? `${r.cap.why[0].toUpperCase()}${r.cap.why.slice(1)}` : low ? `${low.name}: ${low.why}` : "";
  return {
    id: `readiness:${r.day}`, kind: "readiness", at: now, day: r.day,
    title: `Readiness ${r.score} this morning`,
    text: `${why ? `${why}. ` : ""}${so ? `Last night: ${so.label}. ` : ""}What happened yesterday?`,
  };
}

/** The grids findings come from: their pages, and what one row is. */
export type Grid = "sleep" | "heart" | "mind" | "strength" | "after";
const GRID: Record<Grid, { what: string; page: string }> = {
  sleep: { what: "nights", page: "sleep" }, heart: { what: "mornings", page: "heart" }, mind: { what: "days", page: "mind" },
  strength: { what: "sessions", page: "training" }, after: { what: "days", page: "training" },
};

/** The outcome in a sentence, by grid: the Sleep grid's are that night's, the Heart grid's the next morning's. */
const OUT_WORDS: Record<string, string> = {
  "mind:mood": "mood that day", "mind:energy": "energy that day", "mind:focus": "focus that day", "mind:stress": "stress that day",
  "strength:pct": "strength against your trend", "strength:felt": "how you felt after",
  "after:asleep": "time asleep that night", "after:deep": "deep sleep that night", "after:hrv": "next morning's HRV", "after:rhr": "next morning's resting heart rate",
  "after:energy": "energy the next day", "after:mood": "mood the next day",
  "sleep:asleep": "time asleep", "sleep:latency": "time to fall asleep", "sleep:deep": "deep sleep", "sleep:rem": "REM",
  "sleep:awake": "time awake in the night", "sleep:wakes": "times woken", "sleep:low": "lowest heart rate asleep",
  "sleep:lowAt": "the lowest heart rate", "sleep:hrv": "HRV", "sleep:rating": "your sleep rating",
  "heart:rhr": "next morning's resting heart rate", "heart:hrv": "next morning's HRV", "heart:awake": "the next day's awake heart rate",
};
/** A difference in its unit, in words: "−8.9 ms", "+24 min", "1 h 30 later" for a time of night. */
export function diffWords(d: number, unit: Outcome["unit"]): string {
  if (unit === "clock") { const m = Math.round(Math.abs(d)); return `${m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}` : `${m} min`} ${d > 0 ? "later" : "earlier"}`; }
  const u = unit === "min" ? " min" : unit === "bpm" ? " bpm" : unit === "ms" ? " ms" : unit === "/10" ? " points" : unit === "×" ? " times" : unit === "%" ? " %" : "";
  return `${sgn(d, unit === "min" ? 0 : 1)}${u}`;
}

/** A grid cell that's clear, as a message: "Drinks that evening → HRV −8.9 ms, on 9 nights with it against 21 without. Goes with, …" */
export function findingNotice(grid: Grid, c: Cell, f: Pick<Factor, "id" | "name">, o: Pick<Outcome, "id" | "name" | "unit">, now: number): Notice {
  const { what, page } = GRID[grid], out = OUT_WORDS[`${grid}:${o.id}`] ?? o.name.toLowerCase();
  const said = o.unit === "clock" ? `${out} came ${diffWords(c.diff!, o.unit)}` : `${out} ${diffWords(c.diff!, o.unit)}`;
  return {
    id: `finding:${grid}:${c.factor}|${c.outcome}|${c.toward}`, kind: "finding", at: now,
    title: `New finding · ${page}`,
    text: `${f.name} → ${said}, on ${c.nWith} ${what} with it against ${c.nWithout} without. Goes with, not proof of why — anything else going on those ${what}?`,
  };
}

/**
 * The Training page's "afterwards" grid repeats, for "trained that day", what the Sleep and Heart grids already say
 * (asleep, deep, HRV, resting HR the night after a training day): one message, not two.
 */
const SAID_ELSEWHERE = new Set(["after:trained|asleep", "after:trained|deep", "after:trained|hrv", "after:trained|rhr"]);

/** The clear cells of a grid as findings, the surest first. */
export function findings(grid: Grid, cells: Cell[], factors: Pick<Factor, "id" | "name">[], outcomes: Pick<Outcome, "id" | "name" | "unit">[], now: number): Notice[] {
  return cells.filter((c) => c.sure === "clear" && c.diff != null && c.toward != null && !SAID_ELSEWHERE.has(`${grid}:${c.factor}|${c.outcome}`)).sort((a, b) => (a.p ?? 1) - (b.p ?? 1)).flatMap((c) => {
    const f = factors.find((x) => x.id === c.factor), o = outcomes.find((x) => x.id === c.outcome);
    return f && o ? [findingNotice(grid, c, f, o, now)] : [];
  });
}

/**
 * Which candidates to add now: not sent before (on any device: the ids ride in the synced AI doc), within today's cap
 * (counting what was already written today), heart asks first, then a low morning, then findings.
 */
export function pickNew(cands: Notice[], inbox: Notice[], sent: string[], now: number): Notice[] {
  const seen = new Set([...sent, ...inbox.map((n) => n.id)]), today = localDay(now);
  const room = DAILY_CAP - inbox.filter((n) => localDay(n.at) === today).length;
  if (room <= 0) return [];
  const fresh = cands.filter((c, i) => !seen.has(c.id) && cands.findIndex((x) => x.id === c.id) === i);
  const order = { raised: 0, readiness: 1, finding: 2 } as const;
  return fresh.map((c, i) => [c, i] as const).sort((a, b) => order[a[0].kind] - order[b[0].kind] || a[1] - b[1]).map(([c]) => c).slice(0, room);
}

/** Messages not answered or closed — they wait for you in the AI tab. */
export const open = (inbox: Notice[]) => inbox.filter((n) => !n.reply && !n.closed);
