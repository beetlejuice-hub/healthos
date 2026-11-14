/**
 * The links worked out once (owner, 14 Nov, item 16 of the open list). lib/connect checks every input against every
 * outcome at three lags over 120 days; Insights asked for it 3–4 times a screen (the map, Connecting the dots, What to look
 * at, the trend wall's surest link, the AI's context), each from the same data. Now the last answer is kept and handed out
 * again while the inputs are the same objects (the store and the band hand out new ones only when something changed).
 * Pure apart from that one remembered answer.
 */

import type { BandData } from "./band";
import { connect, thingsFrom, type Link, type Thing } from "./connect";
import { withBand, withImports } from "./daysband";
import { dailyFacts } from "./insights";
import { addDays } from "./time";

type In = Parameters<typeof dailyFacts>;
export type Links = { things: Thing[]; links: Link[]; today: string };
let last: { key: unknown[]; out: Links } | null = null;
/** How many times connect() really ran (the tests count it). */
export let linkRuns = 0;

export function linksFor(entries: In[0], workouts: In[1], settings: In[2], band: BandData | null, imports: Parameters<typeof withImports>[1], today: string): Links {
  const key = [entries, workouts, settings, band, imports, today];
  if (last && last.key.length === key.length && last.key.every((k, i) => k === key[i])) return last.out;
  const days = withImports(withBand(dailyFacts(entries, workouts, settings, addDays(today, -120), addDays(today, -1)), band, today), imports);
  const things = thingsFrom(days, band);
  linkRuns++;
  last = { key, out: { things, links: connect(things), today } };
  return last.out;
}
