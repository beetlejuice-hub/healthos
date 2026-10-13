/**
 * Last night, in a tap (PLAN 90; owner, 13 Oct: "telling more to the app, like i was sleeping w gf that night, ive been up
 * late night working, or been out w friends drinking, so app can see and learn what events, peoples affect me and how").
 * Asked with the morning's sleep question and saved on that morning's sleep entry (`tags`). A tag on enough nights
 * becomes a row in the Sleep, Heart and Mind grids, so it's tested like drinks or caffeine: nights with it against
 * nights without. Pure.
 */

import type { Entry } from "./types";
import { MIN_SIDE, type Evening, type Factor } from "./sleep";
import { DAY } from "./time";

/** Built in, in this order (they stay put so a thumb learns where they are); your own words come after. */
export const NIGHT_TAGS: { tag: string; label: string }[] = [
  { tag: "gf", label: "with gf" },
  { tag: "worklate", label: "worked late" },
  { tag: "out", label: "out with friends" },
  { tag: "scrolled", label: "scrolled in bed" },
];

export const nightLabel = (tag: string) => NIGHT_TAGS.find((t) => t.tag === tag)?.label ?? tag;
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/** The chips to offer: the built-in ones, then your own from the last 60 days, most used first. */
export function nightTagOrder(entries: Entry[], now: number): string[] {
  const count = new Map<string, number>();
  for (const e of entries) if (e.kind === "sleep" && e.at >= now - 60 * DAY) for (const t of e.tags ?? []) count.set(t, (count.get(t) ?? 0) + 1);
  const own = [...count.keys()].filter((t) => !NIGHT_TAGS.some((b) => b.tag === t)).sort((a, b) => count.get(b)! - count.get(a)! || a.localeCompare(b));
  return [...NIGHT_TAGS.map((b) => b.tag), ...own];
}

/** How many of the given nights each tag is on. Only nights whose morning was asked count (`Evening.tags` not null). */
export function tagNights(evs: Evening[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of evs) for (const t of new Set(e.tags ?? [])) out.set(t, (out.get(t) ?? 0) + 1);
  return out;
}

/**
 * One grid row per tag on at least MIN_SIDE of the nights given. A night whose morning wasn't asked is left out of
 * the row (`known`), the way a day with the band off is left out of steps; an asked night without the tick is a night
 * without it.
 */
export function tagFactors(evs: Evening[]): Factor[] {
  return [...tagNights(evs)].filter(([, n]) => n >= MIN_SIDE).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([t]) => ({ id: `tag:${t}`, name: cap(nightLabel(t)), has: (_, e) => !!e.tags?.includes(t), known: (_, e) => e.tags != null }));
}

/** Tags not in the grid yet, with how many nights each has so far (of MIN_SIDE). */
export function tagsComing(evs: Evening[]): { tag: string; n: number }[] {
  return [...tagNights(evs)].filter(([, n]) => n < MIN_SIDE).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([tag, n]) => ({ tag, n }));
}
