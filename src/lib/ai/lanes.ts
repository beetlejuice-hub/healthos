/**
 * Fields the app picks from at random, so studies, tries and research go somewhere new (PLAN 194; owner, 4 Nov: "make
 * research, protocols, studies fun and different, sometimes random ones"). A field isn't about his data — the read ties
 * it to him when something fits, and a surprising one is fine when nothing does. Each list is gone through in a shuffled
 * order: every field once a round, a new order each round, never the same twice in a row. Pure.
 */

const dayNo = (day: string) => Math.round(Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10)) / 86_400_000);

export const LANES = [
  { id: "heat", words: "heat — sauna, hot baths, training in the heat" },
  { id: "cold", words: "cold — cold showers, plunges, time out in the cold" },
  { id: "light", words: "light — morning daylight, screens at night, light and mood" },
  { id: "music", words: "music, sound and noise — training to music, focus, sleep" },
  { id: "nature", words: "nature — green and blue space, time outdoors, a walk in a park" },
  { id: "breathing", words: "breathing — slow breathing, nasal breathing, breath-holds" },
  { id: "gut", words: "the gut — fibre, fermented food, the gut and the brain" },
  { id: "naps", words: "naps and rest — how long, when, what they do" },
  { id: "eating", words: "how you eat — chewing, eating speed, the order of a meal, fullness" },
  { id: "moving", words: "sitting and moving through the day — standing, desk breaks, back pain" },
  { id: "spice", words: "a spice, herb or plant compound with a human trial (not something already in their stack)" },
  { id: "hormones", words: "hormones — testosterone, cortisol, thyroid, what everyday habits do to them" },
  { id: "strong-for-life", words: "staying strong for decades — muscle, grip, bones, balance" },
  { id: "running", words: "running and walking — economy, form, intervals, zone 2" },
  { id: "brain", words: "the brain — learning, memory, attention, what exercise does to it" },
  { id: "people", words: "people — friends, loneliness, laughing, what a social life does to health" },
  { id: "stress", words: "stress and the heart — HRV, worry, coming down after a hard day" },
  { id: "night", words: "the night — dreams, waking at night, sleep position, bedroom temperature" },
  { id: "habits", words: "motivation and habits — sticking with things, rewards, willpower" },
  { id: "water", words: "water, salt and electrolytes — focus, training, headaches" },
  { id: "skin", words: "skin and the sun — vitamin D, sunscreen, how skin ages" },
  { id: "appetite", words: "appetite — hunger hormones, cravings, what keeps you full (not a protein-at-breakfast tip)" },
  { id: "alcohol", words: "alcohol — the next day, sleep, training, what 'moderate' really does" },
  { id: "caffeine", words: "caffeine — genes, timing, tolerance, what it does beyond waking you up" },
  { id: "weird", words: "something weird-but-true about the body or brain, the kind you'd tell a friend" },
] as const;
export type Lane = (typeof LANES)[number];

/** A small seeded random from a string. */
function rand(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
}
/** Round `round`'s order of 0..n-1 (Fisher–Yates, seeded). */
function order(n: number, salt: string, round: number): number[] {
  const r = rand(`${salt}:${round}`), o = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; }
  return o;
}
/** Round `round`'s order, its first never the last of the round before. */
function roundOrder(n: number, salt: string, round: number): number[] {
  const o = order(n, salt, round);
  if (n > 1 && round > 0 && o[0] === order(n, salt, round - 1)[n - 1]) [o[0], o[1]] = [o[1], o[0]];
  return o;
}

/** The day's pick from a list: shuffled rounds, every one once a round. `salt` keeps lists using it apart. */
export function pickFor<T>(list: readonly T[], day: string, salt: string): T {
  const n = list.length, d = dayNo(day);
  return list[roundOrder(n, salt, Math.floor(d / n))[((d % n) + n) % n]];
}

/** The day's field for the morning's study, or for research's wildcard. */
export const laneOn = (day: string, salt: "study" | "research"): Lane => pickFor(LANES, day, salt);
