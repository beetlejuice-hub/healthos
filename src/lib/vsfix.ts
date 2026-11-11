/**
 * Where you stand out, where you're behind, and a fix (PLAN 211; owner, 11 Nov: "like the you vs everyone, can make it
 * more detailed, or add a couple outstanding items, good and very bad, and fixes"). Two kinds of yardstick:
 *
 *   big studies   the How you compare bars (lib/card): resting heart, sleep, steps, VO2 max — ahead of 75 %+ stands out,
 *                 behind 75 %+ is behind;
 *   guidelines    over the last 14 days of logging: drinks a week against the UK's low-risk line (112 g, 14 units; UK
 *                 CMO 2016), protein per kg against 1.6 g/kg (where more stopped adding muscle, Morton 2018, 49 trials),
 *                 caffeine a day against 400 mg (EFSA 2015).
 *
 * Each item scored by how far from the line (−1 … 1); the two strongest and two weakest shown. A weak one carries a fix
 * from a study — an option, never an order. Pure.
 */

import { pctWords, type Stat } from "./card";

export type StandItem = { key: string; title: string; vs: string; score: number; fix?: string };
export type Guides = { drinksG?: number | null; loggedDays?: number; proteinGkg?: number | null; kg?: number | null; caffeineMg?: number | null };
export const STAND = { pGood: 0.75, pBad: 0.25, alcLine: 112, protein: 1.6, proteinLow: 1.2, caffeine: 400, minLogged: 10, show: 2 } as const;

const FIX: Record<string, string> = {
  HRT: "Endurance training lowers resting heart rate — by several beats a minute in trials (Reimers 2018, a meta-analysis).",
  SLP: "A bedtime about an hour earlier, the wake time kept — coached short sleepers slept 1.2 h more a night in a 2022 trial (Tasali, JAMA Internal Medicine).",
  PAC: "Each extra 1,000 steps a day went with about 15 % lower mortality, gains flattening around 8,000 (Banach 2023, 17 cohorts, 226,889 people).",
  END: "Intervals — 4 × 4 min hard with 3 min easy between — raised VO2 max more than steady running at the same work (Helgerud 2007).",
};

/** Every item that stands out either way, strongest first then weakest; `good` and `bad` the top two of each. */
export function standOut(stats: Stat[], g: Guides): { good: StandItem[]; bad: StandItem[] } {
  const items: StandItem[] = [];
  for (const s of stats) {
    if (s.p == null || s.own) continue;
    const lead = s.key === "HRT" ? (s.p >= 0.5 ? "lower than" : "higher than") : s.key === "SLP" ? (s.p >= 0.5 ? "longer than" : "shorter than") : s.key === "PAC" ? (s.p >= 0.5 ? "more than" : "fewer than") : (s.p >= 0.5 ? "higher than" : "lower than");
    const share = s.p >= 0.5 ? s.p : 1 - s.p;
    if (s.p >= STAND.pGood || s.p <= STAND.pBad) items.push({ key: s.key, title: `${s.word} ${s.says}`, vs: `${lead} ${pctWords(share)} of ${s.against}${s.avg ? ` (${s.avg})` : ""}`, score: (s.p - 0.5) * 2, ...(s.p <= STAND.pBad ? { fix: FIX[s.key] } : {}) });
  }
  const logged = (g.loggedDays ?? 0) >= STAND.minLogged;
  if (logged && g.drinksG != null) {
    const n = Math.round(g.drinksG / 14);
    if (g.drinksG === 0) items.push({ key: "alc", title: "No drinks in two weeks", vs: "the UK's low-risk line is under 14 units (112 g) a week", score: 0.5 });
    else if (g.drinksG > STAND.alcLine) items.push({ key: "alc", title: `Drinks ${n} a week (${Math.round(g.drinksG)} g)`, vs: `${(g.drinksG / STAND.alcLine).toFixed(1)}× the UK's low-risk line of 14 units (112 g) a week`, score: -Math.min(1, 0.4 + (g.drinksG - STAND.alcLine) / 224),
      fix: "Under 112 g a week (UK Chief Medical Officers 2016). Your Ripples show what a night out does to your own HRV and focus." });
  }
  if (logged && g.proteinGkg != null) {
    if (g.proteinGkg >= STAND.protein) items.push({ key: "pro", title: `Protein ${g.proteinGkg.toFixed(1)} g per kg`, vs: "at or past 1.6 g/kg, where more stopped adding muscle (Morton 2018, 49 trials)", score: 0.4 });
    else if (g.proteinGkg < STAND.proteinLow) {
      const more = g.kg ? Math.round(((STAND.protein - g.proteinGkg) * g.kg) / 5) * 5 : null;
      items.push({ key: "pro", title: `Protein ${g.proteinGkg.toFixed(1)} g per kg`, vs: "under the 1.6 g/kg where more stopped adding muscle (Morton 2018, 49 trials)", score: -Math.min(1, (STAND.protein - g.proteinGkg) / STAND.protein + 0.2),
        fix: `To 1.6 g per kg${more ? ` — about ${more} g more a day` : ""}.` });
    }
  }
  if (logged && g.caffeineMg != null && g.caffeineMg > STAND.caffeine) items.push({ key: "caf", title: `Caffeine ${Math.round(g.caffeineMg)} mg a day`, vs: "over the 400 mg a day EFSA (2015) found no safety concerns at for adults", score: -Math.min(1, 0.3 + (g.caffeineMg - STAND.caffeine) / 400),
    fix: "Under 400 mg a day — and less after 14:00, where your own sleep shows it most." });
  const good = items.filter((i) => i.score > 0).sort((a, b) => b.score - a.score).slice(0, STAND.show);
  const bad = items.filter((i) => i.score < 0).sort((a, b) => a.score - b.score).slice(0, STAND.show);
  return { good, bad };
}
