/**
 * You against everyone else (PLAN 202; owner, 10 Nov: "i want to hear how my day was compared to others. This is inline w
 * the gamification"). Three numbers big studies measured the way your band does, so a comparison is like for like:
 *
 *   steps a day     4,961 on average (sd 2,684) — 717,527 people in 111 countries, by phone (Althoff et al. 2017, Nature)
 *   asleep a night  6 h 47 on average (sd 48 min) — about 120,000 Fitbit wearers (Jaiswal et al. 2020, JAMA Internal Medicine)
 *   resting HR      65 bpm on average (most men 50–80) — 92,457 Fitbit wearers (Quer et al. 2020, PLOS ONE)
 *
 * "More than about N %" is read off a bell curve with the study's mean and spread: rough (steps lean right, the people
 * are app and band users, not everyone), so it's said as "about" and rounded to 5. The read quotes these lines only;
 * it never makes up a comparison of its own. Pure.
 */

export const NORMS = {
  steps: { mean: 4961, sd: 2684, who: "717,527 people in 111 countries (Althoff 2017)" },
  sleep: { mean: 407, sd: 48, who: "about 120,000 Fitbit wearers (Jaiswal 2020)" },
  rhr: { mean: 65, who: "92,457 Fitbit wearers (Quer 2020)" },
} as const;

/** The share of a bell curve under x (Abramowitz–Stegun 7.1.26, good to 1e-7). */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}
/** "about 85 %", rounded to 5, kept between 5 and 95 (the tails of a rough curve say nothing exact). */
const about = (p: number) => `about ${Math.min(95, Math.max(5, Math.round((p * 100) / 5) * 5))} %`;
const hm = (min: number) => `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, "0")}`;

/** Steps (yesterday's for the morning read, today's for the evening's), last night's minutes asleep and this morning's resting heart rate against the studies' people. */
export function vsOthers(d: { steps?: number | null; sleepMin?: number | null; rhr?: number | null }, stepsDay: "yesterday" | "today" = "yesterday"): string[] {
  const out: string[] = [];
  if (d.steps != null && d.steps > 0) {
    const s = NORMS.steps, p = normalCdf((d.steps - s.mean) / s.sd);
    out.push(`Steps ${stepsDay} ${Math.round(d.steps).toLocaleString("en-GB")} — the average is ${s.mean.toLocaleString("en-GB")}; more than ${about(p)} of ${s.who}`);
  }
  if (d.sleepMin != null && d.sleepMin > 0) {
    const s = NORMS.sleep, p = normalCdf((d.sleepMin - s.mean) / s.sd);
    out.push(`Asleep last night ${hm(d.sleepMin)} — the average is ${hm(s.mean)}; longer than ${about(p)} of ${s.who}`);
  }
  if (d.rhr != null && d.rhr > 25) {
    const s = NORMS.rhr, diff = Math.round(d.rhr - s.mean);
    out.push(`Resting heart rate ${Math.round(d.rhr)} — ${diff === 0 ? "the average" : `${Math.abs(diff)} ${diff < 0 ? "under" : "over"} the average ${s.mean}`} of ${s.who}; lower is fitter`);
  }
  return out;
}

/** The section the reads get, or nothing. */
export const vsBlock = (lines: string[]): string[] => (lines.length ? ["## You against everyone else (the app's numbers from big studies — quote these, never make up another comparison)", ...lines.map((l) => `- ${l}`)] : []);

/**
 * The one comparison for a small space (Today's week card): the most striking of the three — the furthest from the
 * average, in spreads (resting heart rate's spread taken as 8 bpm, men's 50–80 being most) — short: "more steps
 * yesterday than about 85 % of 717,527 people". Null with nothing known.
 */
export function vsBest(d: { steps?: number | null; sleepMin?: number | null; rhr?: number | null }): string | null {
  const c: [number, string][] = [];
  if (d.steps != null && d.steps > 0) { const z = (d.steps - NORMS.steps.mean) / NORMS.steps.sd, p = normalCdf(z); c.push([Math.abs(z), z >= 0 ? `more steps yesterday than ${about(p)} of 717,527 people` : `fewer steps yesterday than ${about(1 - p)} of 717,527 people`]); }
  if (d.sleepMin != null && d.sleepMin > 0) { const z = (d.sleepMin - NORMS.sleep.mean) / NORMS.sleep.sd, p = normalCdf(z); c.push([Math.abs(z), z >= 0 ? `longer asleep last night than ${about(p)} of 120,000 Fitbit wearers` : `shorter asleep last night than ${about(1 - p)} of 120,000 Fitbit wearers`]); }
  if (d.rhr != null && d.rhr > 25) { const diff = Math.round(d.rhr - NORMS.rhr.mean); c.push([Math.abs(diff) / 8, diff === 0 ? "resting heart rate right at the average of 92,457 Fitbit wearers" : `resting heart rate ${Math.abs(diff)} ${diff < 0 ? "under" : "over"} the average of 92,457 Fitbit wearers`]); }
  return c.length ? c.sort((a, b) => b[0] - a[0])[0][1] : null;
}
