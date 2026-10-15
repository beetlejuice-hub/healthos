/**
 * The app writes to you (PLAN 102; owner, 15 Oct: "send me messages like hey your heart rate was pretty elevated in this
 * time range, what were you doing, or new findings that i can comment on, like not x caused y, but i was doing z" → "as per
 * your recommendations": one place, the AI tab, a few a day, never repeated, the answers saved so they count). Pure: which
 * heart-rate stretches to ask about, which grid cells are new findings, the words, and the daily cap. The shell hook
 * (components/Inbox) feeds it the band and the log; the cards answer through the store.
 */

import type { Raised, Why } from "./heart";
import type { Cell, Factor, Outcome } from "./sleep";
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
  kind: "raised" | "finding";
  /** When the app wrote it. */
  at: number;
  title: string;
  text: string;
  /** A heart ask: the stretch, so the answer is saved in its middle (as the Heart page saves it). */
  span?: { start: number; end: number };
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
  return {
    id: `raised:${r.start}`, kind: "raised", at: now, span: { start: r.start, end: r.end },
    title: `Heart rate up ${day}${clock(r.start)}–${clock(r.end)}`,
    text: `+${Math.round(r.excess)} bpm over your usual for then${r.level === "very" ? `, peak ${Math.round(r.peak)}` : ""}, and nothing logged around it. What were you doing?`,
  };
}

/** The outcome in a sentence, by grid: the Sleep grid's are that night's, the Heart grid's the next morning's. */
const OUT_WORDS: Record<string, string> = {
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
export function findingNotice(grid: "sleep" | "heart", c: Cell, f: Pick<Factor, "id" | "name">, o: Pick<Outcome, "id" | "name" | "unit">, now: number): Notice {
  const what = grid === "heart" ? "mornings" : "nights", out = OUT_WORDS[`${grid}:${o.id}`] ?? o.name.toLowerCase();
  const said = o.unit === "clock" ? `${out} came ${diffWords(c.diff!, o.unit)}` : `${out} ${diffWords(c.diff!, o.unit)}`;
  return {
    id: `finding:${grid}:${c.factor}|${c.outcome}|${c.toward}`, kind: "finding", at: now,
    title: `New finding · ${grid === "heart" ? "heart" : "sleep"}`,
    text: `${f.name} → ${said}, on ${c.nWith} ${what} with it against ${c.nWithout} without. Goes with, not proof of why — anything else going on those ${what}?`,
  };
}

/** The clear cells of a grid as findings, the surest first. */
export function findings(grid: "sleep" | "heart", cells: Cell[], factors: Pick<Factor, "id" | "name">[], outcomes: Pick<Outcome, "id" | "name" | "unit">[], now: number): Notice[] {
  return cells.filter((c) => c.sure === "clear" && c.diff != null && c.toward != null).sort((a, b) => (a.p ?? 1) - (b.p ?? 1)).flatMap((c) => {
    const f = factors.find((x) => x.id === c.factor), o = outcomes.find((x) => x.id === c.outcome);
    return f && o ? [findingNotice(grid, c, f, o, now)] : [];
  });
}

/**
 * Which candidates to add now: not sent before (on any device: the ids ride in the synced AI doc), within today's cap
 * (counting what was already written today), heart asks first.
 */
export function pickNew(cands: Notice[], inbox: Notice[], sent: string[], now: number): Notice[] {
  const seen = new Set([...sent, ...inbox.map((n) => n.id)]), today = localDay(now);
  const room = DAILY_CAP - inbox.filter((n) => localDay(n.at) === today).length;
  if (room <= 0) return [];
  const fresh = cands.filter((c, i) => !seen.has(c.id) && cands.findIndex((x) => x.id === c.id) === i);
  return [...fresh.filter((c) => c.kind === "raised"), ...fresh.filter((c) => c.kind !== "raised")].slice(0, room);
}

/** Messages not answered or closed — they wait for you in the AI tab. */
export const open = (inbox: Notice[]) => inbox.filter((n) => !n.reply && !n.closed);
