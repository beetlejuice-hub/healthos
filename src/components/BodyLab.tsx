/**
 * Insights → Body lab (PLAN 177; owner, 27 Oct: dose-response "yes", cigarettes "lets do B"): what a dose has gone with
 * in your own nights — each drink, a smoking day, caffeine after 14:00 — and the month of cigarette answers. Numbers
 * from lib/bodylab (planted effects + controls); this file only draws. "Went with", never "causes".
 */

import { useEffect, useMemo } from "react";
import type { BandData } from "../lib/band";
import { loadBandBefore } from "../lib/band-client";
import { bandLevel, drinkDose, LAB, labNights, lateCaffeine, smokeCompare, smokeMonth, type DoseLine } from "../lib/bodylab";
import type { Slope } from "../lib/sessionfacts";
import { nights } from "../lib/sleep";
import { SMOKE_LABEL } from "../lib/smoke";
import { DAY, localDay } from "../lib/time";
import type { Entry } from "../lib/types";
import { useWidth } from "./useWidth";
import { CoinLab } from "./Coins";
import { WoundHeat } from "./WoundHeat";
import { BodyClockCard } from "./BodyClockCard";

const DAYS = 90;
const HR = "#ef7d6d", HRV = "#9fd7c7", CAF = "var(--caf)";
/** Cigarettes, one grey ramp dark to light on the panel: none is an outline. */
const FILL = ["transparent", "#4a5560", "#8a979c", "#dce3e5"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SURE: Record<Slope["sure"], string> = { clear: "clear", likely: "likely", "not clear": "could still be chance", "too few": "too few nights" };
const sgn = (v: number, d = 0) => { const t = Math.abs(v).toFixed(d); return Number(t) === 0 ? `±${t}` : `${v > 0 ? "+" : "−"}${t}`; };
const found = (f: Slope | undefined) => f?.sure === "clear" || f?.sure === "likely";

export function BodyLab({ band, entries, now, active }: { band: BandData | null; entries: Entry[]; now: number; active: boolean }) {
  // the cards want three months of nights, not the band's usual week: loaded when the page is open
  useEffect(() => { if (band && active) void loadBandBefore(now - (DAYS + 2) * DAY); }, [band, active, now]);
  const today = localDay(now);
  const ls = useMemo(() => (band ? labNights(nights(band.sleep, band.hr, band.rhr, band.hrv).filter((n) => n.up <= now && n.up >= now - DAYS * DAY), entries) : []), [band, entries, now]);
  const drink = useMemo(() => drinkDose(ls), [ls]), smoke = useMemo(() => smokeCompare(ls), [ls]), caf = useMemo(() => lateCaffeine(ls), [ls]);
  const month = useMemo(() => smokeMonth(entries, today), [entries, today]);
  const [ref, w] = useWidth<HTMLDivElement>();
  return (
    <div className="bl" data-sec="lab" ref={ref} data-nights={ls.length}>
      <CoinLab now={now} />
      {ls.length > 0 && <Drinks d={drink} w={w} nights={ls.length} />}
      {(ls.length > 0 || month.answered > 0) && <section className="sl-p bl-card" aria-label="Cigarettes and your heart" data-card="smoke">
        <span className="cmp-k">Cigarettes{smoke ? ` · ${SURE[best(smoke.rows.map((r) => r.fit))]}` : ""}</span>
        {smoke ? <>
          <h3>{smoke.rows.some((r) => found(r.fit))
            ? <>On smoking days: {smoke.rows.filter((r) => found(r.fit)).map((r, i) => <span key={r.id}>{i ? "; " : ""}{r.name.toLowerCase()} <b>{sgn(r.fit.slope!)} {r.unit}</b></span>)}.</>
            : "Smoking days haven't gone clearly with your heart yet."}</h3>
          <div className="bl-tab" role="table" aria-label="Smoking days against days without">
            <span role="row" className="hd"><span role="columnheader" /><span role="columnheader">smoked</span><span role="columnheader">didn't</span></span>
            {smoke.rows.map((r) => <span role="row" key={r.id} data-row={r.id} data-sure={r.fit.sure}><span role="cell" className="nm">{r.name}<em>{SURE[r.fit.sure]}</em></span><b role="cell">{Math.round(r.smoked)}</b><span role="cell" className="v">{Math.round(r.not)}</span></span>)}
          </div>
          <p className="bl-foot">{smoke.smoked} smoking days vs {smoke.not} without{smoke.drinkNights ? ` · ${smoke.drinkNights} drinking nights left out, so the cigarettes don't take the drinks' effect` : ""} · the middle night of each</p>
        </> : <p className="bl-need">Needs {LAB.minSide} answered days each way — smoking and not, without drinks — to compare. The question on Today at night fills this.</p>}
        {month.answered > 0 && <Month m={month} today={today} />}
      </section>}
      {ls.length > 0 && <section className="sl-p bl-card" aria-label="Caffeine after 14:00 and deep sleep" data-card="caf">
        <span className="cmp-k">Caffeine after 14:00{caf ? ` · ${SURE[caf.fit.sure]}` : ""}</span>
        {caf ? <div className="bl-caf">
          <h3>{found(caf.fit) && caf.per100 != null ? <>Every 100 mg after 14:00 went with about <b>{Math.abs(Math.round(caf.per100))} min {caf.per100 < 0 ? "less" : "more"}</b> deep sleep.</> : "Caffeine after 14:00 hasn't gone clearly with your deep sleep yet."}</h3>
          <Scatter pts={caf.fit.pts} slope={caf.fit.slope} />
        </div> : <p className="bl-need">Needs {LAB.minNights} nights with deep sleep, {LAB.minSide} of them with caffeine after 14:00 and {LAB.minSide} without.</p>}
        {caf && <p className="bl-foot">{caf.fit.pts.length} nights · {caf.late} with caffeine after 14:00 · mg drunk from 14:00 to bed</p>}
      </section>}
      {band && ls.length > 0 && <WoundHeat band={band} now={now} />}
      <BodyClockCard band={band} now={now} />
    </div>
  );
}

/** The surest of a few. */
const best = (fs: Slope[]): Slope["sure"] => (["clear", "likely", "not clear", "too few"] as const).find((s) => fs.some((f) => f.sure === s)) ?? "too few";

function Drinks({ d, w, nights }: { d: ReturnType<typeof drinkDose>; w: number; nights: number }) {
  const fits = [d.hr?.fit, d.hrv?.fit].filter((f): f is Slope => f != null);
  const parts = [d.hr && found(d.hr.fit) ? <>heart rate asleep <b>{sgn(d.hr.fit.slope!, 1)} bpm</b></> : null, d.hrv && found(d.hrv.fit) ? <>HRV <b>{sgn(d.hrv.fit.slope!, 1)} ms</b></> : null].filter(Boolean);
  const drinking = d.nights.slice(1).reduce((a, n) => a + n, 0), cw = Math.max(130, Math.floor((w - 30 - 10) / 2));
  return (
    <section className="sl-p bl-card" aria-label="Drinks and your night" data-card="drinks">
      <span className="cmp-k">Drinks that evening{fits.length ? ` · ${SURE[best(fits)]}` : ""}</span>
      {d.hr || d.hrv ? <>
        <h3>{parts.length ? <>Each drink went with {parts.map((p, i) => <span key={i}>{i ? ", " : ""}{p}</span>)} that night.</> : "Drinks haven't gone clearly with your heart asleep or HRV yet."}</h3>
        <div className="bl-two">
          {d.hr && <Dose line={d.hr} color={HR} name="Heart rate asleep" unit="bpm" w={cw} />}
          {d.hrv && <Dose line={d.hrv} color={HRV} name="HRV" unit="ms" w={cw} />}
        </div>
        <p className="bl-foot">drinks that evening, as logged · dot: the middle night · bar: the middle half · faint: under 3 nights · nights in each: {d.nights.join(" · ")}{d.smoked ? ` · you also smoked on ${d.smoked} of the drinking nights` : ""}</p>
      </> : <p className="bl-need">Needs {LAB.minNights} nights with the band, {LAB.minSide} without drinks and {LAB.minDrinkNights} with — {nights} nights, {drinking} with drinks so far.</p>}
    </section>
  );
}

/** One measure by drinks that evening: each column's middle night (dot) and middle half (bar), against your no-drink nights. */
function Dose({ line, color, name, unit, w }: { line: DoseLine; color: string; name: string; unit: string; w: number }) {
  const H = 118, top = 16, bot = 22, L = 8, R = 8, n = LAB.capDrinks + 1;
  const vs = line.bins.flatMap((b) => [b.lo, b.hi, 0]), lo = Math.min(...vs), hi = Math.max(...vs), span = Math.max(4, hi - lo);
  const Y = (v: number) => top + (1 - (v - lo) / span) * (H - top - bot), X = (k: number) => L + ((k + 0.5) / n) * (w - L - R);
  const last = line.bins.at(-1)!;
  return (
    <figure className="bl-fig">
      <figcaption>{name}, against no drinks</figcaption>
      <svg width={w} height={H} viewBox={`0 0 ${w} ${H}`} role="img" aria-label={`${name} by drinks that evening, against nights without: ${line.bins.map((b) => `${b.k === LAB.capDrinks ? `${b.k}+` : b.k}: ${sgn(b.mid, 1)} ${unit}`).join(", ")}`}>
        <line x1={L} x2={w - R} y1={Y(0)} y2={Y(0)} className="bl-zero" />
        {line.bins.map((b) => (
          <g key={b.k}>
            <title>{`${b.k === LAB.capDrinks ? `${b.k} or more drinks` : `${b.k} drink${b.k === 1 ? "" : "s"}`}: ${sgn(b.mid, 1)} ${unit} (middle half ${sgn(b.lo, 1)} to ${sgn(b.hi, 1)}), ${b.n} night${b.n === 1 ? "" : "s"}`}</title>
            <rect x={X(b.k) - 9} y={top - 4} width={18} height={H - top - bot + 8} fill="transparent" />
            <line x1={X(b.k)} x2={X(b.k)} y1={Y(b.hi)} y2={Y(b.lo)} stroke={color} strokeWidth="2" strokeLinecap="round" opacity={b.n < 3 ? 0.5 : 1} />
            <circle cx={X(b.k)} cy={Y(b.mid)} r="4.5" fill={color} opacity={b.n < 3 ? 0.5 : 1} />
          </g>
        ))}
        <text x={X(last.k)} y={Math.max(11, Y(Math.max(last.hi, last.mid)) - 6)} textAnchor="end" dx="9" className="bl-val">{sgn(last.mid)}</text>
        {Array.from({ length: n }, (_, k) => <text key={k} x={X(k)} y={H - 6} textAnchor="middle" className="bl-tick">{k === LAB.capDrinks ? `${k}+` : k}</text>)}
      </svg>
    </figure>
  );
}

/** Each night: mg after 14:00 against deep sleep, and the fitted line. */
function Scatter({ pts, slope }: { pts: [number, number][]; slope: number | null }) {
  const W = 120, H = 66, P = 5;
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]), x1 = Math.max(100, ...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const X = (v: number) => P + (v / x1) * (W - 2 * P), Y = (v: number) => P + (1 - (v - y0) / Math.max(1, y1 - y0)) * (H - 2 * P);
  const mx = xs.reduce((a, v) => a + v, 0) / xs.length, my = ys.reduce((a, v) => a + v, 0) / ys.length;
  return (
    <svg className="bl-sc" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Deep sleep against caffeine after 14:00, ${pts.length} nights`}>
      <line x1={P} x2={W - P} y1={H - 1} y2={H - 1} className="bl-zero" />
      {pts.map((p, i) => <circle key={i} cx={X(p[0])} cy={Y(p[1])} r="2.6" fill={CAF} opacity="0.75"><title>{`${Math.round(p[0])} mg after 14:00 · ${Math.round(p[1])} min deep`}</title></circle>)}
      {slope != null && <line x1={X(0)} x2={X(x1)} y1={Y(my - slope * mx)} y2={Y(my + slope * (x1 - mx))} className="bl-fit" />}
    </svg>
  );
}

function Month({ m, today }: { m: ReturnType<typeof smokeMonth>; today: string }) {
  const name = MONTHS[+today.slice(5, 7) - 1];
  return (
    <div className="bl-month" data-free={m.free} data-smoking={m.smoking}>
      <span className="cmp-k">{name} · {m.free} smoke-free day{m.free === 1 ? "" : "s"}{m.answered < m.days.filter((d) => !d.future).length ? ` · ${m.days.filter((d) => !d.future).length - m.answered} not answered` : ""}</span>
      <div className="bl-cal" role="img" aria-label={`${name}: ${m.smoking} smoking days, ${m.free} smoke-free, ${m.answered} answered`}>
        {Array.from({ length: m.lead }, (_, i) => <i key={`b${i}`} className="blank" />)}
        {m.days.map((d) => {
          const lv = d.band != null ? bandLevel(d.band) : null;
          return <i key={d.day} className={d.future ? "future" : lv == null ? "unknown" : lv === 0 ? "none" : "some"} style={lv ? { background: FILL[lv] } : undefined} title={`${+d.day.slice(8)} ${name.slice(0, 3)}: ${d.future ? "not yet" : d.band == null ? "not answered" : SMOKE_LABEL[d.band]}`} />;
        })}
      </div>
      <span className="bl-legend"><i className="none" />none <i style={{ background: FILL[1] }} />1–2 <i style={{ background: FILL[2] }} />3–5 <i style={{ background: FILL[3] }} />6+ <i className="unknown" />not answered</span>
      {m.weekdays && <p className="bl-foot">{m.weekdays.n} of your {m.smoking} smoking days were {m.weekdays.names}.</p>}
    </div>
  );
}
