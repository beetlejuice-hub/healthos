/**
 * The AI tab's thread by day (owner, 16 Oct: "also i feel like chats should be deleted? or like collapsed or whatever").
 * Today stays open, and so does a day with something you haven't seen yet or anything from the last 6 hours (a chat
 * that runs past midnight); older days fold to one line. Pure.
 */

import { localDay } from "../time";

export type DayGroup<T> = { day: string; open: boolean; items: T[] };
const RECENT = 6 * 3_600_000;

export function byDay<T extends { at: number }>(items: T[], now: number, unseen: (x: T) => boolean): DayGroup<T>[] {
  const today = localDay(now), out: DayGroup<T>[] = [];
  for (const x of [...items].sort((a, b) => a.at - b.at)) {
    const d = localDay(x.at), g = out.at(-1);
    if (g && g.day === d) g.items.push(x); else out.push({ day: d, open: false, items: [x] });
  }
  for (const g of out) g.open = g.day === today || g.items.some((x) => unseen(x) || x.at > now - RECENT);
  return out;
}

/** A folded day's line: how many, and what you asked first (or how it started). */
export function foldLine(texts: { mine: boolean; text: string }[]): string {
  const first = texts.find((t) => t.mine) ?? texts[0];
  const t = (first?.text ?? "").replace(/[*_#>`]/g, "").replace(/\s+/g, " ").trim();
  return t.length > 48 ? `${t.slice(0, 46).trimEnd()}…` : t;
}
