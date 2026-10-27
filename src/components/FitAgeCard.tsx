/**
 * Insights → Body lab: your heart's fitness age (PLAN 177, body lab 4; owner, 27 Oct: "yes", "men"). The age at which the
 * average healthy man (or woman) in Norway's HUNT study has your VO2 max, this week and over the last 12 weeks, and what
 * moved it — fitness at the same weight and the kilos, in years; resting heart rate and cardio alongside, without years.
 * Numbers from lib/fitage (known answers from the study's table, planted changes, a steady control); this file only draws.
 */

import { useMemo, useState } from "react";
import type { BandData } from "../lib/band";
import { cardioSpans } from "../lib/cardio";
import { cardioByDay, fitAge, fitWords, type FitAge, type Sex } from "../lib/fitage";
import { act, useStore } from "../lib/store";
import { atMinute, localDay } from "../lib/time";
import { kgByDay } from "../lib/vo2";

const COLOR = "#8fb3f5";
const SAY: Record<Sex, string> = { male: "men", female: "women" };
const f1 = (v: number) => v.toFixed(1);
const short = (day: string) => new Date(atMinute(day, 720)).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
/** Years younger (positive) as the age moves: "−3 y"; older: "+3 y". */
const yrs = (v: number) => (v === 0 ? "±0 y" : `${v > 0 ? "−" : "+"}${Math.abs(v)} y`);

export function FitAgeCard({ band, now, w }: { band: BandData | null; now: number; w: number }) {
  const entries = useStore((s) => s.entries), workouts = useStore((s) => s.workouts);
  const sex = useStore((s) => s.settings.sex), age = useStore((s) => s.settings.age);
  const today = localDay(now);
  const kg = useMemo(() => kgByDay(entries), [entries]);
  const cardio = useMemo(() => cardioByDay(cardioSpans(workouts, now)), [workouts, now]);
  const f = useMemo(() => (band ? fitAge(band.vo2, today, sex ?? "male", { age, kg, rhr: band.rhr, cardio }) : null), [band, today, sex, age, kg, cardio]);
  if (!band) return null;
  if (!f) return (
    <section className="sl-p bl-card" aria-label="Your heart's fitness age" data-card="fitage">
      <span className="cmp-k">Your heart's fitness age</span>
      <p className="bl-need">Needs 3 days of VO2 max from the band in the last week. Fitbit works it out from your heart rate as you wear it.</p>
    </section>
  );
  if (!sex) return (
    <section className="sl-p bl-card" aria-label="Your heart's fitness age" data-card="fitage" data-ask="sex">
      <span className="cmp-k">Your heart's fitness age</span>
      <h3>The age at which the average healthy person has your VO2 max ({f1(f.vo2)} this week). Set it against:</h3>
      <div className="fa-ask">
        <button type="button" className="ibtn" onClick={() => act.setSettings({ sex: "male" })}>Men</button>
        <button type="button" className="ibtn" onClick={() => act.setSettings({ sex: "female" })}>Women</button>
      </div>
      <p className="bl-foot">Men's and women's VO2 max differ by about 10 at every age, so the comparison needs one. You can change it in Settings.</p>
    </section>
  );
  return <Card f={f} w={w} />;
}

function Card({ f, w }: { f: FitAge; w: number }) {
  const [hov, setHov] = useState<number | null>(null);
  const c = f.change, moved = c && c.word !== "steady" && c.years != null;
  return (
    <section className="sl-p bl-card fa" aria-label="Your heart's fitness age" data-card="fitage" data-age={fitWords(f.fit)} data-trend={c?.word}>
      <span className="cmp-k">Your heart's fitness age · {SAY[f.sex]}'s norms</span>
      <div className="fa-top">
        <b className="fa-n">{fitWords(f.fit)}</b>
        <div>
          <span className="fa-y">years{f.you != null ? ` — you're ${f.you}` : ""}</span>
          <span className="fa-sub">VO2 max {f1(f.vo2)} this week{f.est ? " · Google marks the latest an estimate" : ""}</span>
        </div>
      </div>
      {f.weeks.length >= 2 && <Chart f={f} w={w} hov={hov} setHov={setHov} />}
      {c && <div className="fa-rows" aria-label="What moved it">
        <span className="fa-k">{moved ? `What moved it · ${c.weeks} weeks` : `Over ${c.weeks} weeks`}</span>
        {!moved ? <p data-row="steady"><span>{c.years == null && c.word !== "steady" ? `VO2 max ${f1(c.then)} → ${f1(f.vo2)} — past the study's ages, so no years` : `Steady · VO2 max ${f1(c.then)} → ${f1(f.vo2)}, within the band's week-to-week wobble`}</span></p>
          : c.fitness != null ? <>
            <p data-row="fitness"><span>Fitness, at the same weight</span><b>{yrs(c.fitness)}</b></p>
            <p data-row="kg"><span>The {Math.abs(c.kgLost!).toFixed(1)} kg {c.kgLost! > 0 ? "lost" : "gained"} (VO2 max is per kg)</span><b>{yrs(c.kg!)}</b></p>
          </> : <p data-row="vo2"><span>VO2 max {f1(c.then)} → {f1(f.vo2)}</span><b>{yrs(c.years!)}</b></p>}
        {(f.rhr || f.cardio) && <p className="fa-along" data-row="along">Alongside, same weeks: {[f.rhr && `resting heart rate ${Math.round(f.rhr[0])} → ${Math.round(f.rhr[1])} bpm`, f.cardio && `cardio ${Math.round(f.cardio[0])} → ${Math.round(f.cardio[1])} min a week`].filter(Boolean).join(" · ")}</p>}
      </div>}
      <p className="fa-per">Each +1 of VO2 max is about {f.per.toFixed(1)} years off.</p>
      <p className="bl-foot">Fitness age: the age at which the average healthy {f.sex === "male" ? "man" : "woman"} in Norway's HUNT study has your VO2 max ({f.sex === "male" ? "1,929 men" : "1,881 women"} tested on a treadmill; Loe et al. 2013). A fit, healthy group, so a high bar. Your band's VO2 max is Fitbit's estimate from your heart rate and can be a few points off, so trust the trend more than the number.</p>
    </section>
  );
}

function Chart({ f, w, hov, setHov }: { f: FitAge; w: number; hov: number | null; setHov: (i: number | null) => void }) {
  const W = Math.max(240, w - 30), H = 130, x0 = 6, x1 = W - 50, y0 = 14, y1 = H - 22;
  // the scale fits the weeks (2 years either side at least), so the trend reads; your age dashed only when it's inside
  const ages = f.weeks.map((x) => x.age), lo = Math.floor(Math.min(...ages) - 2), hi = Math.ceil(Math.max(...ages) + 2);
  const ref = f.you != null && f.you >= lo && f.you <= hi ? f.you : null;
  const n = f.weeks.length, X = (i: number) => x0 + (n === 1 ? 0 : (i / (n - 1)) * (x1 - x0)), Y = (a: number) => y1 - ((a - lo) / (hi - lo)) * (y1 - y0);
  const d = f.weeks.map((x, i) => `${i ? "L" : "M"}${f1(X(i))} ${f1(Y(x.age))}`).join("");
  const k = hov != null && hov < n ? f.weeks[hov] : null;
  return (
    <figure className="fa-fig">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Fitness age week by week, last ${n} weeks: from ${Math.round(ages[0])} to ${Math.round(ages[n - 1])}`}>
        {ref != null && <><line x1={x0} x2={x1} y1={Y(ref)} y2={Y(ref)} className="fa-ref" /><text x={x1 + 6} y={Y(ref) + 4} className="bl-tick">you {ref}</text></>}
        <path d={d} stroke={COLOR} strokeWidth="2" fill="none" strokeLinejoin="round" />
        {f.weeks.map((x, i) => <circle key={x.end} cx={X(i)} cy={Y(x.age)} r={i === hov ? 4.5 : i === n - 1 ? 4 : 2.5} fill={COLOR} />)}
        <text x={X(0)} y={H - 6} className="bl-tick">{short(f.weeks[0].end)} · {Math.round(ages[0])}</text>
        <text x={X(n - 1)} y={H - 6} textAnchor="end" className="bl-tick">now · {Math.round(ages[n - 1])}</text>
        {f.weeks.map((x, i) => <rect key={x.end} x={X(i) - (x1 - x0) / Math.max(1, n - 1) / 2} y={0} width={(x1 - x0) / Math.max(1, n - 1)} height={H} fill="transparent"
          onPointerEnter={() => setHov(i)} onPointerDown={() => setHov(i)} onPointerLeave={(e) => { if (e.pointerType === "mouse") setHov(null); }} />)}
      </svg>
      <figcaption className="fa-cap" aria-live="polite">{k ? `Week to ${short(k.end)}: VO2 max ${f1(k.vo2)} · fitness age ${Math.round(k.age)}` : `Each dot: a week's VO2 max (the middle of 3+ days) as a fitness age${ref != null ? "; the dashed line, your age" : ""}.`}</figcaption>
    </figure>
  );
}
