/**
 * Insights → Sleep without a band, and Intake & body (approved prototype v2, phase 5a). Your sleep rating night by
 * night with what happened that evening and caffeine left at bedtime — only when there are no band nights: with the
 * band, the Sleep page (components/Sleep.tsx) shows both and these would repeat it (owner, 9 Oct: "do 2"). Drinks per
 * week, calories and macros per day, and the weight trend under Food & body.
 * Numbers from lib/body, lib/connections, lib/tdee, lib/nutrition; this file only draws.
 */

import { useMemo, type ReactNode } from "react";
import { useStore } from "../lib/store";
import type { GlanceDay } from "../lib/glance";
import { avg7, drinkWeeks, nights, tierOfMg } from "../lib/body";
import { comparisons } from "../lib/connections";
import { bodyDays, weightTrend } from "../lib/tdee";
import { byDay } from "../lib/nutrition";
import { CAF_SLEEP } from "../lib/caffeine-sleep";
import { mean } from "../lib/stats";
import { addDays, atMinute, dayLabel, localDay } from "../lib/time";
import { useWidth } from "./useWidth";

const f0 = (v: number) => Math.round(v).toLocaleString("en-GB");
const f1 = (v: number) => v.toFixed(1);
const sg = (v: number, d = 1) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(d)}`;
const noon = (d: string) => atMinute(d, 720);
const short = (d: string) => dayLabel(noon(d)).slice(4);
/** A column with a rounded data end, square at the baseline. */
const col = (x: number, w: number, y: number, y0: number, r = 3) => { const h = y0 - y; if (h <= .5) return ""; const rr = Math.min(r, w / 2, h); return `M${x},${y0} V${y + rr} q0,-${rr} ${rr},-${rr} H${x + w - rr} q${rr},0 ${rr},${rr} V${y0} Z`; };
/** Monday date labels at least 48 px apart: index → label. */
const mondays = (list: { day: string }[], x: (j: number) => number) => { const out = new Map<number, string>(); let last = -1e9; list.forEach((d, j) => { if (new Date(noon(d.day)).getDay() === 1 && x(j) - last >= 48) { out.set(j, short(d.day)); last = x(j); } }); return out; };

function Panel({ cls, kick, title, ans, meta, foot, children }: { cls: string; kick: string; title: string; ans?: ReactNode; meta?: ReactNode; foot?: ReactNode; children: ReactNode }) {
  return (
    <section className={`gp ${cls}`} aria-label={title}>
      <header className="gp-h"><div><span className="gp-k">{kick}</span><h2>{title}</h2>{ans && <p className="gp-ans">{ans}</p>}</div>{meta && <span className="gp-meta">{meta}</span>}</header>
      {children}
      {foot && <footer className="gp-f">{foot}</footer>}
    </section>
  );
}

export function Body({ days, period, now, bandNights }: { days: GlanceDay[]; period: number; now: number; bandNights: boolean }) {
  const list = useMemo(() => days.slice(-period - 1), [days, period]);
  const ns = useMemo(() => nights(list), [list]);
  const rated = ns.filter((n) => n.rating != null), hasCaf = ns.some((n) => n.cafBed != null), hasFood = list.some((d) => d.kcal != null);
  const hasDrinks = days.some((d) => (d.drinks ?? 0) > 0);
  const entries = useStore((s) => s.entries);
  const hasWeight = entries.some((e) => e.kind === "weight");
  const sleepGroup = !bandNights && (rated.length > 0 || hasCaf);
  return (
    <>
      {sleepGroup && <>
        <div className="gl-group" id="ins-sleep" data-sec="sleep"><h2>Sleep</h2><span>your own morning rating, and what you had that evening · stages and HRV join once a ring or watch is connected</span></div>
        <div className="gl" data-sec="sleep">
          {rated.length > 0 && <SleepPanel all={days} ns={ns} />}
          {hasCaf && <CaffeinePanel ns={ns} />}
        </div>
      </>}
      {(hasFood || hasWeight || hasDrinks) && <>
        <div className="gl-group" id="ins-intake" data-sec="intake"><h2>Intake &amp; body</h2><span>food, drinks and weight</span></div>
        <div className="gl" data-sec="intake">
          {hasFood && <KcalPanel list={list.slice(-period)} />}
          {hasDrinks && <DrinksPanel days={days} period={period} />}
          {hasWeight && <WeightPanel period={period} now={now} />}
        </div>
      </>}
    </>
  );
}

/* ------------------------------------------------------------------ sleep rating, night by night */

function SleepPanel({ all, ns }: { all: GlanceDay[]; ns: ReturnType<typeof nights> }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const supplements = useStore((s) => s.supplements);
  const cmp = useMemo(() => comparisons(all, supplements), [all, supplements]);
  const rated = ns.filter((n) => n.rating != null), avg = mean(rated.map((n) => n.rating!));
  const L = 30, R = 8, top = 8, ph = 140, cw = (w - L - R) / ns.length, Y = (v: number) => top + ph - (v / 10) * ph, evY = top + ph + 14, H = evY + 40;
  const bw = Math.max(1.5, Math.min(22, cw - 3)), x = (j: number) => L + j * cw + (cw - bw) / 2, labs = mondays(ns, x);
  const line = (id: string) => { const c = cmp.find((r) => r.id === id); return c?.diff ? `${sg(c.diff.value)} on nights after ${id === "caf-sleep" ? "caffeine after 14:00" : "drinks"} (${c.nWith} vs ${c.nWithout} nights${c.diff.clear ? "" : ", not clear yet"})` : null; };
  const said = [line("caf-sleep"), line("drinks-sleep")].filter(Boolean);
  return (
    <Panel cls="gl-sleep" kick="Sleep rating" title="How you slept, night by night"
      ans={<>You rated your sleep <b>{f1(avg)}</b>/10 on average over {rated.length} nights.{said.length ? ` Ratings run ${said.join("; ")}.` : ""}</>}
      meta={`${ns.length} nights`}
      foot={<><span className="lgd"><i style={{ background: "var(--ok)" }} />your rating (stronger = better)</span><span>✕ caffeine after 14:00</span><span>◆ drinks</span><span>● trained</span><span className="gl-dim">dashed: your average</span></>}>
      <div ref={ref} className="gl-chart">
        <svg viewBox={`0 0 ${w} ${H}`} width={w} height={H} role="img" aria-label="Sleep rating each night">
          {[0, 5, 10].map((v) => <g key={v}><line x1={L} x2={w - R} y1={Y(v)} y2={Y(v)} className={v ? "grid" : "axis"} /><text x={L - 6} y={Y(v) + 3.5} textAnchor="end">{v}</text></g>)}
          {ns.map((n, j) => (
            <g key={n.day}>
              {n.rating != null && <path d={col(x(j), bw, Y(n.rating), Y(0))} fill="var(--ok)" opacity={(.3 + .7 * (n.rating - 1) / 9).toFixed(2)} />}
              {cw >= 7 && [n.lateCaffeine && "✕", n.drinks && "◆", n.trained && "●"].filter(Boolean).map((g, k) => <text key={k} x={x(j) + bw / 2} y={evY + k * 10} textAnchor="middle" className="ev" style={{ fontSize: 8.5 }}>{g}</text>)}
              {labs.has(j) && <text x={x(j)} y={H - 2}>{labs.get(j)}</text>}
              <rect x={L + j * cw} y={top} width={cw} height={evY + 24 - top} fill="transparent" data-tip={`Night of ${dayLabel(noon(n.day))}\n${n.rating != null ? `Rated ${n.rating}/10` : "Not rated"}${n.cafBed != null ? `\n${f0(n.cafBed)} mg caffeine at bedtime` : ""}${n.drinks ? "\nDrinks that evening" : ""}${n.trained ? "\nTrained that day" : ""}`} />
            </g>
          ))}
          <line x1={L} x2={w - R} y1={Y(avg)} y2={Y(avg)} className="avgl" />
        </svg>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ caffeine left at bedtime */

function CaffeinePanel({ ns }: { ns: ReturnType<typeof nights> }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const known = ns.filter((n) => n.cafBed != null), { lowBelowMg: lo, higherFromMg: hi } = CAF_SLEEP;
  const top2 = Math.max(160, Math.ceil(Math.max(0, ...known.map((n) => n.cafBed!)) / 20) * 20);
  const L = 30, R = 56, top = 8, ph = 150, cw = (w - L - R) / ns.length, Y = (v: number) => top + ph - (Math.min(v, top2) / top2) * ph, H = top + ph + 8;
  const count = { low: 0, possible: 0, higher: 0 }; known.forEach((n) => count[tierOfMg(n.cafBed!)]++);
  return (
    <Panel cls="gl-caf" kick="Caffeine" title="Left in you at bedtime"
      ans={<><b>{count.low}</b> low, <b>{count.possible}</b> possible, <b>{count.higher}</b> higher nights.</>}
      meta={`${known.length} nights`}
      foot={<><span className="lgd"><i className="dot" style={{ background: "var(--caf)" }} />caffeine after 14:00</span><span className="lgd"><i className="dot" style={{ background: "var(--caf)", opacity: .45 }} />earlier only</span></>}>
      <div ref={ref} className="gl-chart">
        <svg viewBox={`0 0 ${w} ${H}`} width={w} height={H} role="img" aria-label="Caffeine left at bedtime each night">
          <rect x={L} y={Y(top2)} width={w - L - R} height={Y(hi) - Y(top2)} className="tierhi" />
          <rect x={L} y={Y(hi)} width={w - L - R} height={Y(lo) - Y(hi)} className="tiermid" />
          {[0, lo, hi].map((v) => <g key={v}><line x1={L} x2={w - R} y1={Y(v)} y2={Y(v)} className={v ? "grid" : "axis"} /><text x={L - 5} y={Y(v) + 3.5} textAnchor="end">{v}</text></g>)}
          <text x={w - R + 8} y={(Y(top2) + Y(hi)) / 2 + 4} className="l">higher</text><text x={w - R + 8} y={(Y(hi) + Y(lo)) / 2 + 4} className="l">possible</text><text x={w - R + 8} y={(Y(lo) + Y(0)) / 2 + 4} className="l">low</text>
          {ns.map((n, j) => n.cafBed == null ? null : <circle key={n.day} cx={L + (j + .5) * cw} cy={Y(n.cafBed)} r={cw > 8 ? 3.8 : 2.6} className="cafdot" opacity={n.lateCaffeine ? 1 : .45} data-tip={`Night of ${dayLabel(noon(n.day))}\n${f0(n.cafBed)} mg at bedtime${n.rating != null ? `\nRated ${n.rating}/10 next morning` : ""}${n.lateCaffeine ? "\nCaffeine after 14:00" : ""}`} />)}
        </svg>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ drinks per week */

function DrinksPanel({ days, period }: { days: GlanceDay[]; period: number }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const weeks = drinkWeeks(days, Math.max(4, Math.ceil(period / 7)));
  const max = Math.max(4, Math.ceil(Math.max(0, ...weeks.map((x) => x.drinks ?? 0)) / 2) * 2), L = 24, R = 6, top = 16, ph = 130, cw = (w - L - R) / weeks.length, Y = (v: number) => top + ph - (v / max) * ph, H = top + ph + 18;
  const known = weeks.filter((x) => x.drinks != null);
  return (
    <Panel cls="gl-drinks" kick="Alcohol" title="Drinks per week"
      ans={known.length ? <>Average <b>{f1(mean(known.map((x) => x.drinks!)))}</b> a week over {known.length} weeks.</> : "Log drinks on 4+ days a week to see weekly totals."}
      meta="1 drink = 14 g alcohol"
      foot={<><span className="lgd"><i style={{ background: "var(--alc)" }} />drinks that week</span><span className="gl-dim">– = under 4 days logged</span></>}>
      <div ref={ref} className="gl-chart">
        <svg viewBox={`0 0 ${w} ${H}`} width={w} height={H} role="img" aria-label="Drinks per week">
          {[0, Math.round(max / 2), max].map((v) => <g key={v}><line x1={L} x2={w - R} y1={Y(v)} y2={Y(v)} className={v ? "grid" : "axis"} /><text x={L - 5} y={Y(v) + 3.5} textAnchor="end">{v}</text></g>)}
          {weeks.map((wk, j) => { const bw = Math.min(22, cw - 6), x = L + j * cw + (cw - bw) / 2; return (
            <g key={wk.start}>
              {wk.drinks != null && wk.drinks > 0 && <path d={col(x, bw, Y(wk.drinks), Y(0))} fill="var(--alc)" />}
              <text x={x + bw / 2} y={wk.drinks ? Y(wk.drinks) - 4 : Y(0) - 4} textAnchor="middle" className={wk.drinks != null ? "v" : ""}>{wk.drinks == null ? "–" : wk.drinks ? f1(wk.drinks).replace(/\.0$/, "") : "0"}</text>
              {(weeks.length <= 6 || j % 2 === 0) && <text x={x + bw / 2} y={H - 2} textAnchor="middle" style={{ fontSize: 9.5 }}>{short(wk.start)}</text>}
              <rect x={L + j * cw} y={top} width={cw} height={ph} fill="transparent" data-tip={`Week from ${dayLabel(noon(wk.start))}\n${wk.drinks == null ? `Only ${wk.loggedDays} days logged` : `${f1(wk.drinks)} drinks (${f0(wk.drinks * 14)} g alcohol)`}`} />
            </g>
          ); })}
        </svg>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ calories and macros */

function KcalPanel({ list }: { list: GlanceDay[] }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const entries = useStore((s) => s.entries), goals = useStore((s) => s.goals), bodyKg = useStore((s) => s.settings.bodyKg);
  const intake = useMemo(() => byDay(entries), [entries]);
  const rows = list.map((d) => ({ day: d.day, t: intake.get(d.day) })).map((r) => ({ day: r.day, m: r.t?.logged ? r.t.totals : null }));
  const logged = rows.filter((r) => r.m);
  const maxK = Math.max(goals.kcal * 1.3, ...logged.map((r) => r.m!.kcal)), L = 40, R = 70, top = 10, ph = 160, cw = (w - L - R) / rows.length, Y = (v: number) => top + ph - (v / maxK) * ph, H = top + ph + 20;
  const bw = Math.max(1.5, Math.min(20, cw - 3)), x = (j: number) => L + j * cw + (cw - bw) / 2, labs = mondays(rows, x);
  const MAC = [["p", "Protein", "var(--i-ink-2)", 4], ["c", "Carbs", "var(--g-before)", 4], ["f", "Fat", "var(--i-line-2)", 9]] as const;
  const avgK = mean(logged.map((r) => r.m!.kcal)), avgP = mean(logged.map((r) => r.m!.p)), pHit = logged.filter((r) => r.m!.p >= goals.p).length, onGoal = logged.filter((r) => Math.abs(r.m!.kcal - goals.kcal) <= 200).length;
  const ticks = [0, 1000, 2000, 3000, 4000].filter((v) => v <= maxK);
  return (
    <Panel cls="gl-kcal" kick="Fuel" title="Calories and macros per day"
      ans={logged.length ? <>Averaging <b>{f0(avgK)} kcal</b> (goal {f0(goals.kcal)}; within ±200 on {onGoal} of {logged.length} days), protein <b>{f0(avgP)} g</b> a day ({f1(avgP / bodyKg)} g/kg) — at the {goals.p} g goal on {pHit} of {logged.length} days.</> : "No food logged in this period."}
      meta={<>{logged.length} of {rows.length} days logged<br />unlogged days left out</>}
      foot={<>{MAC.map(([, n, c]) => <span key={n} className="lgd"><i style={{ background: c }} />{n}</span>)}<span className="lgd"><i className="ln now" />calorie goal</span><span className="gl-dim">goals: Settings</span></>}>
      <div ref={ref} className="gl-chart">
        <svg viewBox={`0 0 ${w} ${H}`} width={w} height={H} role="img" aria-label="Calories per day, split into protein, carbs and fat">
          {ticks.map((v) => <g key={v}><line x1={L} x2={w - R} y1={Y(v)} y2={Y(v)} className={v ? "grid" : "axis"} /><text x={L - 6} y={Y(v) + 3.5} textAnchor="end">{v ? `${v / 1000}k` : "0"}</text></g>)}
          {rows.map((r, j) => {
            if (!r.m) return labs.has(j) ? <text key={r.day} x={x(j)} y={H - 2}>{labs.get(j)}</text> : null;
            let acc = 0; const segs = MAC.map(([k, , c, kc], m) => { const v = r.m![k] * kc, ya = Y(acc + v), yb = Y(acc); acc += v; return m === 2 ? <path key={k} d={col(x(j), bw, ya + 1.5, yb)} fill={c} /> : <rect key={k} x={x(j)} y={ya + 1.5} width={bw} height={Math.max(.5, yb - ya - 1.5)} fill={c} />; });
            return (
              <g key={r.day}>{segs}{labs.has(j) && <text x={x(j)} y={H - 2}>{labs.get(j)}</text>}
                <rect x={L + j * cw} y={top} width={cw} height={ph} fill="transparent" data-tip={`${dayLabel(noon(r.day))}\n${f0(r.m.kcal)} kcal\nProtein ${f0(r.m.p)} g · Carbs ${f0(r.m.c)} g · Fat ${f0(r.m.f)} g`} /></g>
            );
          })}
          <line x1={L} x2={w - R + 4} y1={Y(goals.kcal)} y2={Y(goals.kcal)} className="goal" /><text x={w - R + 10} y={Y(goals.kcal) + 4} className="v">goal {f0(goals.kcal)}</text>
        </svg>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ weight */

function WeightPanel({ period, now }: { period: number; now: number }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const entries = useStore((s) => s.entries);
  const today = localDay(now);
  const span = Math.max(period, 28), from = addDays(today, -(span - 1));
  const days = useMemo(() => bodyDays(entries, from, today), [entries, from, today]);
  const trend = useMemo(() => weightTrend(bodyDays(entries, addDays(today, -27), today)), [entries, today]);
  const a7 = avg7(days), ahead = trend ? 21 : 0, n = days.length + ahead;
  const vals = [...days.flatMap((d) => (d.kg == null ? [] : [d.kg])), ...(trend ? [trend.nowKg + trend.perDay * ahead] : [])];
  const lo = Math.floor((Math.min(...vals) - .3) * 2) / 2, hi = Math.ceil((Math.max(...vals) + .3) * 2) / 2;
  const L = 40, R = 90, top = 10, ph = 160, X = (i: number) => L + ((i + .5) / n) * (w - L - R), Y = (v: number) => top + ph - ((v - lo) / (hi - lo || 1)) * ph, H = top + ph + 20;
  const ticks: number[] = []; for (let v = Math.ceil(lo); v <= hi; v += hi - lo > 6 ? 2 : 1) ticks.push(v);
  const avgPath = a7.map((v, i) => (v == null ? null : [X(i), Y(v)] as const)).reduce((s, p, i, arr) => (p ? s + `${arr[i - 1] ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}` : s), "");
  const last = days.length - 1, perWeek = trend ? trend.perDay * 7 : null, ci = trend ? 1.96 * trend.se * 7 : null;
  const offset = days.length - 28; // trend.fit day index is within its own 28-day window
  return (
    <Panel cls="gl-weight" kick="Body" title="Weight trend"
      ans={trend ? <><b>{f1(trend.nowKg)} kg</b> on the trend line, {perWeek! < 0 ? "down" : "up"} <b>{Math.abs(perWeek!).toFixed(2)} kg a week</b> (95% range {sg(perWeek! - ci!, 2)} to {sg(perWeek! + ci!, 2)}) over the last 4 weeks{Math.abs(perWeek!) < ci! ? " — about steady" : ""}.</> : `Needs 8 weigh-ins over 2+ weeks for a trend (${days.filter((d) => d.kg != null).length} in the last ${span} days).`}
      meta={trend ? `${trend.n} weigh-ins · ${trend.dropped.length ? `${trend.dropped.length} one-off left out` : "none left out"}` : undefined}
      foot={<><span className="lgd"><i className="dot" style={{ background: "var(--wt)" }} />weigh-in</span><span className="lgd"><i className="ln" style={{ background: "var(--g-now)" }} />7-day average</span>{trend && <span className="gl-dim">dashed: the 4-week trend, carried 3 weeks ahead</span>}</>}>
      <div ref={ref} className="gl-chart">
        <svg viewBox={`0 0 ${w} ${H}`} width={w} height={H} role="img" aria-label="Weight: weigh-ins, 7-day average and trend">
          {ticks.map((v) => <g key={v}><line x1={L} x2={w - R} y1={Y(v)} y2={Y(v)} className="grid" /><text x={L - 6} y={Y(v) + 3.5} textAnchor="end">{v}</text></g>)}
          {ahead > 0 && <rect x={X(last) + 4} y={top} width={w - R - X(last) - 4} height={ph} className="proj" />}
          {days.map((d, i) => d.kg == null ? null : <circle key={d.day} cx={X(i)} cy={Y(d.kg)} r="3" className="wdot" data-tip={`${dayLabel(noon(d.day))}\n${d.kg.toFixed(1)} kg`} />)}
          <path d={avgPath} className="wavg" />
          {trend && <line x1={X(trend.fit[0][0] + offset)} x2={X(last + ahead)} y1={Y(trend.fit[0][1])} y2={Y(trend.nowKg + trend.perDay * ahead)} className="wtrend" />}
          {trend && <><circle cx={X(last)} cy={Y(trend.nowKg)} r="4.5" className="wnow" /><text x={w - R + 8} y={Y(trend.nowKg + trend.perDay * ahead) + 4} className="v">{f1(trend.nowKg + trend.perDay * ahead)} kg</text><text x={w - R + 8} y={Y(trend.nowKg + trend.perDay * ahead) + 17} style={{ fontSize: 9.5 }}>in 3 weeks</text></>}
          <text x={L} y={H - 2}>{short(days[0].day)}</text><text x={X(last)} y={H - 2} textAnchor="middle">today</text>
        </svg>
      </div>
    </Panel>
  );
}
