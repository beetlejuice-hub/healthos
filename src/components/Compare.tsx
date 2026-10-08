/**
 * Insights → Timeline → Compare (canvas board "Compare", owner's pick 8 Oct): does more of one thing go with more or
 * less of another, and how much later? The last two days on one clock, every point as a scatter, how strongly they
 * go together at each delay against what shuffled days give, and the words. Numbers from lib/compare (planted-effect
 * tests). "Goes with", never "causes".
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { checkSamples, compare, hrSamples, MIN_DAYS, PER_DAY, slots, slotTime, type Compared } from "../lib/compare";
import { FEELINGS, type FeelK } from "../lib/feelgraph";
import type { Lanes } from "../lib/insights";
import { loadBandBefore, type BandData } from "../lib/band-client";
import { addDays, atMinute, clock, DAY, HOUR, localDay } from "../lib/time";
import { useWidth } from "./useWidth";

type DK = "caf" | "alc";
type OK = "hr" | FeelK;
type Driver = { name: string; noun: string; unit: string; per: number; color: string; lags: number[]; logIt: string };
const DRIVERS: Record<DK, Driver> = {
  // Delays in 10-minute slots: caffeine 0–3 h every 10 min, alcohol 0–6 h every 20.
  caf: { name: "Caffeine in body", noun: "caffeine", unit: "mg", per: 100, color: "var(--caf)", lags: Array.from({ length: 19 }, (_, k) => k), logIt: "Log a coffee or tea" },
  alc: { name: "Alcohol in body", noun: "alcohol", unit: "g", per: 10, color: "var(--alc)", lags: Array.from({ length: 19 }, (_, k) => 2 * k), logIt: "Log a drink" },
};
type Outcome = { name: string; noun: string; unit: string; per: number; color: string; /** The narrowest scale: ± this. */ minAbs: number };
/** Heart rate's usual is per half hour; a feeling's per 3 hours (a few check-ins a day). */
const OUTCOMES = {
  hr: { name: "Heart rate vs usual", noun: "heart rate", unit: "bpm", per: 3, color: "var(--hr)", minAbs: 5 },
  ...Object.fromEntries(FEELINGS.map(([k, n, c]) => [k, { name: `${n} vs usual`, noun: n.toLowerCase(), unit: "pt", per: 18, color: c, minAbs: 2 }])),
} as Record<OK, Outcome>;
const SPANS = [14, 30, 90] as const;

const f1 = (v: number) => (Math.round(v * 10) / 10).toString();
const sgn = (v: number, d = 1) => { const t = Math.abs(v).toFixed(d); return Number(t) === 0 ? `±${t}` : `${v > 0 ? "+" : "−"}${t}`; };
const niceUp = (v: number) => { const m = Math.pow(10, Math.floor(Math.log10(Math.max(v, 1e-9)))); return [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((k) => k * m).find((x) => x >= v - 1e-9) ?? 10 * m; };
/** A scale around 0 that fits what's drawn (1st–99th percentile), never tighter than ±minAbs: data, not empty space. */
const fitAround = (vals: number[], minAbs: number): [number, number[]] => {
  const s = [...vals].sort((a, b) => a - b), q = (p: number) => s[Math.round((s.length - 1) * p)] ?? 0;
  const top = niceUp(Math.max(minAbs, Math.abs(q(0.01)), Math.abs(q(0.99))));
  return [top, [-top, -top / 2, 0, top / 2, top]];
};
const tickText = (v: number) => (v > 0 ? `+${f1(v)}` : v < 0 ? `−${f1(-v)}` : "0");
const circ = (x: number, y: number, r: number) => `M${(x - r).toFixed(1)} ${y.toFixed(1)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
const lagText = (min: number) => (min >= 120 && min % 60 === 0 ? `${min / 60} h` : `${min} min`);

/** Measures its own width and draws to it. */
function Panel({ className, label, children }: { className: string; label: string; children: (w: number) => ReactNode }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  return <div className={`cmp-p ${className}`} ref={ref} role="group" aria-label={label}>{children(w)}</div>;
}

export function Compare({ data, band, now, logged }: { data: Lanes; band: BandData | null; now: number; /** Days with anything eaten or drunk logged. */ logged: Set<string> }) {
  const [dk, setDk] = useState<DK>("caf");
  // Heart rate once the band's data is in (it arrives after the page opens), until you pick something yourself.
  const [picked, setOk] = useState<OK | null>(null);
  const ok: OK = picked ?? (band?.hr.length ? "hr" : "mood");
  const [span, setSpan] = useState<(typeof SPANS)[number]>(14);
  const d = DRIVERS[dk], o = OUTCOMES[ok];
  const first = addDays(localDay(now), -(span - 1)), day0 = atMinute(first, 0);
  // Heart rate needs the band's older weeks. Each load changes `band`, so this asks again until they're all in.
  useEffect(() => { if (ok === "hr" && band) void loadBandBefore(day0); }, [ok, band, day0]);
  const input = useMemo(() => {
    const drv = slots(dk === "caf" ? data.caffeine : data.alcohol, day0, span);
    // A day with nothing eaten or drunk logged is unknown, not "none": left out.
    for (let k = 0; k < span; k++) if (!logged.has(addDays(first, k))) drv.fill(null, k * PER_DAY, (k + 1) * PER_DAY);
    const raw = ok === "hr" ? (band ? hrSamples(day0, band.hr, data.workouts) : []) : checkSamples(day0, data.checks.map((c) => ({ at: c.at, v: c[ok] })));
    return { drv, smp: raw.filter((x) => x.i < drv.length && drv[x.i] != null), any: drv.some((v) => v != null && v > 0) };
  }, [dk, ok, span, day0, first, data, band, logged]);
  // Shuffling days a few hundred times takes a moment on 90 days: off the click, and the last answer stays up meanwhile.
  const sel = `${dk}|${ok}|${span}`;
  const [res, setRes] = useState<{ sel: string; c: Compared } | null>(null);
  useEffect(() => {
    const id = setTimeout(() => setRes({ sel, c: compare(input.drv, input.smp, { per: o.per, lags: d.lags }) }), 16);
    return () => clearTimeout(id);
  }, [input, sel, o.per, d.lags]);
  const busy = !res || res.sel !== sel, c = res?.c ?? null;
  const noBand = ok === "hr" && !band?.hr.length;
  const [ref, w] = useWidth<HTMLElement>();
  const wide = w >= 640;

  const bar = (
    <div className="cmp-bar">
      <span>this</span>
      <label className="cmp-sel"><i className="sw" style={{ background: d.color }} /><select aria-label="Compare this" value={dk} onChange={(e) => setDk(e.target.value as DK)}>
        {(Object.keys(DRIVERS) as DK[]).map((k) => <option key={k} value={k}>{DRIVERS[k].name}</option>)}
      </select></label>
      <span>and later</span>
      <label className="cmp-sel"><i className="sw" style={{ background: o.color }} /><select aria-label="With this, later" value={ok} onChange={(e) => setOk(e.target.value as OK)}>
        {(Object.keys(OUTCOMES) as OK[]).map((k) => <option key={k} value={k}>{OUTCOMES[k].name}</option>)}
      </select></label>
      <div className="iseg" role="group" aria-label="Days to compare">
        {SPANS.map((n) => <button key={n} type="button" aria-pressed={span === n} onClick={() => setSpan(n)}>{n}D</button>)}
      </div>
    </div>
  );
  const empty = noBand ? "Connect your band in Settings to compare with heart rate — or pick a feeling."
    : !input.any ? `No ${d.noun} logged in these ${span} days. ${d.logIt} and it shows up here.` : null;
  return (
    <section className="cmp" ref={ref} data-sec="timeline" aria-label="Compare two things over time" data-busy={busy || undefined}
      data-sure={busy ? "working" : empty ? "empty" : c?.sure} data-best={c?.best ? c.best.lag * 10 : undefined} data-slope={c?.slope != null ? f1(c.slope * d.per) : undefined}
      data-span={c?.span ? `${c.span[0] * 10}-${c.span[1] * 10}` : undefined} data-days={c?.days}>
      {bar}
      {empty ? <div className="cmp-empty">{empty}</div> : !c ? <div className="cmp-empty">Working it out…</div> : (
        <div className={`cmp-grid${wide ? " wide" : ""}`}>
          <Panel className="cmp-al" label={`${d.name} and ${o.noun} against your usual, the last two days`}>
            {(pw) => <AlignedChart w={pw} h={wide ? 524 : 330} now={now} day0={day0} data={data} c={c} d={d} o={o} dk={dk} ok={ok} />}
          </Panel>
          {c.best && <Panel className="cmp-sc" label={`Scatter: ${o.noun} against ${d.noun} ${c.best.lag * 10} minutes earlier`}>
            {(pw) => <Scatter w={pw} h={wide ? 300 : 262} c={c} d={d} o={o} />}
          </Panel>}
          {c.best && <Panel className="cmp-lg" label="How strongly they go together at each delay">
            {(pw) => <Delays w={pw} h={wide ? 212 : 180} c={c} d={d} />}
          </Panel>}
          <Say c={c} d={d} o={o} dk={dk} ok={ok} span={span} />
        </div>
      )}
    </section>
  );
}

/** The last two days: the driver above, the outcome against its usual below, on one clock. */
function AlignedChart({ w, h, now, day0, data, c, d, o, dk, ok }: { w: number; h: number; now: number; day0: number; data: Lanes; c: Compared; d: Driver; o: Outcome; dk: DK; ok: OK }) {
  const t1 = now, t0 = now - 2 * DAY, L = 12, R = 40, X = (t: number) => L + ((t - t0) / (t1 - t0)) * (w - L - R);
  const cy0 = 44, cy1 = Math.round(h * 0.4), dy0 = cy1 + 48, dy1 = h - 26;
  const drv = (dk === "caf" ? data.caffeine : data.alcohol).filter(([t]) => t >= t0 - 10 * 60_000 && t <= t1);
  const top = niceUp(Math.max(d.per, ...drv.map((p) => p[1])));
  const CY = (v: number) => cy1 - (v / top) * (cy1 - cy0);
  const dev = c.dev.map((s) => [slotTime(s.i, day0), s.y] as [number, number]).filter(([t]) => t >= t0 && t <= t1);
  const [dTop, dTicks] = fitAround(dev.map((p) => p[1]), o.minAbs), DY = (v: number) => dy1 - ((Math.max(-dTop, Math.min(dTop, v)) + dTop) / (2 * dTop)) * (dy1 - dy0);
  const line = drv.map(([t, v], i) => `${i ? "L" : "M"}${X(t).toFixed(1)} ${CY(v).toFixed(1)}`).join("");
  const area = drv.length ? `M${X(drv[0][0]).toFixed(1)} ${cy1}${line.replace(/^M/, "L")}L${X(drv[drv.length - 1][0]).toFixed(1)} ${cy1}Z` : "";
  // Shaded: the driver in its top third (the scatter's top band).
  const thr = c.thirds?.hi, shade: [number, number][] = [];
  if (thr != null && thr > 0) { let run: number | null = null; drv.forEach(([t, v], i) => { if (v >= thr && run == null) run = t; if ((v < thr || i === drv.length - 1) && run != null) { shade.push([run, t]); run = null; } }); }
  const gyms = ok === "hr" ? data.workouts.filter((g) => g.end >= t0 && g.start <= t1) : [];
  let devPath = "", prev = -Infinity;
  if (ok === "hr") for (const [t, v] of dev) { devPath += `${t - prev <= 31 * 60_000 ? "L" : "M"}${X(t).toFixed(1)} ${DY(v).toFixed(1)}`; prev = t; }
  // Every 6 hours, or every 12 on a narrow screen; on the local clock (midnight, 06:00 … not UTC's).
  const every = (w - L - R) / 8 >= 56 ? 6 : 12, ticks: number[] = [];
  for (let k = 0; k <= 3; k++) for (let hr = 0; hr < 24; hr += every) { const t = atMinute(addDays(localDay(t0), k), hr * 60); if (t >= t0 && t <= t1) ticks.push(t); }
  const dayName = (t: number) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(t).getDay()];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="he-svg" role="img" aria-label={`${d.name} above; ${o.noun} minus your usual below; the last two days`}>
      {shade.map(([a, b]) => <rect key={a} x={X(a)} y={cy0 - 8} width={Math.max(1, X(b) - X(a))} height={dy1 - cy0 + 8} style={{ fill: d.color }} fillOpacity=".07" />)}
      {gyms.map((g) => <g key={g.start}><rect x={X(Math.max(t0, g.start - 10 * 60_000))} y={dy0 - 8} width={Math.max(2, X(Math.min(t1, g.end + HOUR)) - X(Math.max(t0, g.start - 10 * 60_000)))} height={dy1 - dy0 + 8} style={{ fill: "var(--gym)" }} fillOpacity=".08" />
        <text x={X(Math.max(t0, g.start)) + 4} y={dy0 - 12} className="cmp-gym">workout · left out</text></g>)}
      {ticks.map((t) => <g key={t}><line x1={X(t)} x2={X(t)} y1={cy0 - 8} y2={dy1} className="cmp-v" />
        <text x={X(t)} y={h - 8} textAnchor="middle" className="he-t">{new Date(t).getHours() === 0 ? dayName(t) : clock(t)}</text></g>)}
      {[0, top / 2, top].map((v) => <g key={v}><line x1={L} x2={w - R} y1={CY(v)} y2={CY(v)} className={v ? "he-grid" : "he-zero"} /><text x={w - R + 6} y={CY(v) + 3} className="he-t">{v}</text></g>)}
      {dTicks.map((v) => <g key={v}><line x1={L} x2={w - R} y1={DY(v)} y2={DY(v)} className={v ? "he-grid" : "he-zero"} /><text x={w - R + 6} y={DY(v) + 3} className="he-t">{tickText(v)}</text></g>)}
      {area && <path d={area} style={{ fill: d.color }} fillOpacity=".2" />}
      {line && <path d={line} fill="none" style={{ stroke: d.color }} strokeWidth="1.75" />}
      {ok === "hr" ? <path d={devPath} fill="none" style={{ stroke: o.color }} strokeWidth="1.5" strokeLinejoin="round" />
        : <path d={dev.map(([t, v]) => circ(X(t), DY(v), 3.5)).join("")} style={{ fill: o.color }} stroke="var(--i-panel)" strokeWidth="1.5" />}
      <text x={L} y={16} className="cmp-k">Aligned · last 2 days</text>
      {thr != null && thr > 0 && <text x={w - R} y={16} textAnchor="end" className="cmp-s">shaded: over {Math.round(thr)} {d.unit}</text>}
      <text x={L} y={cy0 - 14} className="cmp-n" style={{ fill: d.color }}>{d.name}, {d.unit}</text>
      <text x={L} y={dy0 - 26} className="cmp-n" style={{ fill: o.color }}>{o.name}, {o.unit}{ok === "hr" ? " (awake)" : " · each check-in"}</text>
      {!dev.length && <text x={(L + w - R) / 2} y={(dy0 + dy1) / 2} textAnchor="middle" className="cmp-s">{ok === "hr" ? "no heart rate in these two days" : "no check-ins in these two days"}</text>}
    </svg>
  );
}

/** Every point: the driver at the best delay against the outcome's distance from usual, with band averages. */
function Scatter({ w, h, c, d, o }: { w: number; h: number; c: Compared; d: Driver; o: Outcome }) {
  const L = 44, R = 14, T = 48, B = 30, lag = c.best!.lag * 10;
  // Round ticks (0, 50, 100, 150 — not 38, 113): the step first, the end a whole number of steps.
  const xs = c.points.map((p) => p.x).sort((a, b) => a - b), p98 = Math.max(1, xs[Math.floor((xs.length - 1) * 0.98)] ?? 1);
  const xStep = [1, 2, 2.5, 5].flatMap((k) => [1, 10, 100, 1000].map((m) => k * m)).sort((a, b) => a - b).find((st) => p98 / st <= 5) ?? 1000;
  const xMax = Math.ceil(p98 / xStep - 1e-9) * xStep;
  const [top, yTicks] = fitAround(c.points.map((p) => p.y), o.minAbs);
  const X = (v: number) => L + (Math.min(v, xMax) / xMax) * (w - L - R), Y = (v: number) => T + (1 - (Math.max(-top, Math.min(top, v)) + top) / (2 * top)) * (h - T - B);
  // Band averages: label as many as fit without touching, the top band first.
  const shown = new Set<number>(); let lastX = Infinity;
  [...c.bins].reverse().forEach((b) => { const x = X((b.x0 + Math.min(b.x1, xMax)) / 2); if (lastX - x >= 46) { shown.add(b.x0); lastX = x; } });
  const mx = c.points.reduce((s, p) => s + p.x, 0) / c.points.length, my = c.points.reduce((s, p) => s + p.y, 0) / c.points.length;
  const fit = c.slope != null ? `M${X(0).toFixed(1)} ${Y(my - c.slope * mx).toFixed(1)}L${X(xMax).toFixed(1)} ${Y(my + c.slope * (xMax - mx)).toFixed(1)}` : "";
  const dotR = c.points.length > 1500 ? 1.4 : 1.9;
  const xt: number[] = []; for (let v = 0; v <= xMax + 1e-9; v += xStep) xt.push(v);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="he-svg" role="img" aria-label={`Each dot: ${d.noun} ${lag} minutes earlier against ${o.noun} minus your usual; marks are averages per band of ${d.noun}`}>
      {xt.map((v) => <g key={v}><line x1={X(v)} x2={X(v)} y1={T} y2={h - B} className="he-grid" /><text x={X(v)} y={h - B + 14} textAnchor={v === xMax ? "end" : "middle"} className="he-t">{f1(v)}{v === xMax ? ` ${d.unit}` : ""}</text></g>)}
      {yTicks.map((v) => <g key={v}><line x1={L} x2={w - R} y1={Y(v)} y2={Y(v)} className={v ? "he-grid" : "he-zero"} /><text x={L - 8} y={Y(v) + 3} textAnchor="end" className="he-t">{tickText(v)}</text></g>)}
      <path d={c.points.map((p) => circ(X(p.x), Y(p.y), dotR)).join("")} fill="var(--i-ink-2)" fillOpacity=".28" />
      {fit && <path d={fit} fill="none" stroke="var(--i-ink)" strokeOpacity=".7" strokeWidth="1.25" strokeDasharray="5 4" />}
      {c.bins.map((b) => { const x = X((b.x0 + Math.min(b.x1, xMax)) / 2), e = Number.isFinite(b.se) ? 2 * b.se : 0; return (
        <g key={b.x0}>
          {e > 0 && <line x1={x} x2={x} y1={Y(b.mean - e)} y2={Y(b.mean + e)} style={{ stroke: d.color }} strokeWidth="2" />}
          <circle cx={x} cy={Y(b.mean)} r="4.5" style={{ fill: d.color }} stroke="var(--i-panel)" strokeWidth="2" />
          {shown.has(b.x0) && <text x={x} y={Y(b.mean + e) - 7} textAnchor="middle" className="cmp-b" style={{ fill: d.color }}>{sgn(b.mean)}</text>}
        </g>); })}
      <text x={12} y={16} className="cmp-k">Scatter · {o.unit === "bpm" ? "every 20 min, awake" : "every check-in"}</text>
      <text x={12} y={30} className="cmp-s">{d.noun} {lag} min earlier → {o.noun} vs the rest of that day</text>
      {c.slope != null && <text x={w - R - 4} y={T + 12} textAnchor="end" className="he-mark">{sgn(c.slope * d.per)} {o.unit} per {d.per} {d.unit}</text>}
    </svg>
  );
}

/** How strongly they go together at each delay; grey: what shuffled days reach by chance. */
function Delays({ w, h, c, d }: { w: number; h: number; c: Compared; d: Driver }) {
  const L = 44, R = 14, T = 52, B = 26, maxLag = d.lags[d.lags.length - 1] * 10;
  const top = Math.max(0.2, ...c.lags.map((p) => Math.abs(p.r) * 1.15), ...c.lags.map((p) => p.band * 1.15));
  const X = (m: number) => L + (m / maxLag) * (w - L - R), Y = (r: number) => T + (1 - (r + top) / (2 * top)) * (h - T - B);
  const band = `M${c.lags.map((p) => `${X(p.lag * 10).toFixed(1)} ${Y(p.band).toFixed(1)}`).join("L")}L${[...c.lags].reverse().map((p) => `${X(p.lag * 10).toFixed(1)} ${Y(-p.band).toFixed(1)}`).join("L")}Z`;
  const line = c.lags.map((p, i) => `${i ? "L" : "M"}${X(p.lag * 10).toFixed(1)} ${Y(p.r).toFixed(1)}`).join("");
  const b = c.best!, bx = X(b.lag * 10), by = Y(b.r), step = [30, 60, 120].find((m) => ((w - L - R) / maxLag) * m >= 52) ?? 120;
  const xt: number[] = []; for (let m = 0; m <= maxLag; m += step) xt.push(m);
  const rs = top <= 0.45 ? 0.1 : top <= 0.9 ? 0.2 : 0.5, rt: number[] = [];
  for (let v = -Math.floor(top / rs) * rs; v <= top + 1e-9; v += rs) rt.push(Math.round(v * 10) / 10);
  const sp = c.span!, right = bx > w * 0.6;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="he-svg" role="img" aria-label={`Correlation by delay from 0 to ${maxLag} minutes, strongest at ${b.lag * 10} minutes; grey is what chance alone gives`}>
      <path d={band} fill="var(--i-ink-2)" fillOpacity=".12" />
      {xt.map((m) => <g key={m}><line x1={X(m)} x2={X(m)} y1={T} y2={h - B} className="he-grid" /><text x={X(m)} y={h - 8} textAnchor={m === xt[xt.length - 1] ? "end" : "middle"} className="he-t">{m}{m === xt[xt.length - 1] ? " min" : ""}</text></g>)}
      {rt.map((v) => <g key={v}><line x1={L} x2={w - R} y1={Y(v)} y2={Y(v)} className={v ? "he-grid" : "he-zero"} /><text x={L - 8} y={Y(v) + 3} textAnchor="end" className="he-t">{v.toFixed(1).replace("-", "−")}</text></g>)}
      <rect x={X(sp[0] * 10) - 2} y={T - 9} width={X(sp[1] * 10) - X(sp[0] * 10) + 4} height="4" rx="2" style={{ fill: d.color }} fillOpacity=".55" />
      <path d={line} fill="none" stroke="var(--i-ink)" strokeWidth="2" strokeLinejoin="round" />
      <circle cx={bx} cy={by} r="5" style={{ fill: d.color }} stroke="var(--i-panel)" strokeWidth="2" />
      <text x={right ? bx - 9 : bx + 9} y={Math.max(T + 10, by + (b.r >= 0 ? -10 : 18))} textAnchor={right ? "end" : "start"} className="he-mark">strongest {lagText(b.lag * 10)} later · r {b.r.toFixed(2)}</text>
      <text x={12} y={16} className="cmp-k">Delay · how strongly they go together</text>
      <text x={12} y={30} className="cmp-s">{w >= 520 ? `bar: the likely delay, ${sp[0] * 10}–${sp[1] * 10} min · grey: what chance alone reaches` : `bar: likely delay ${sp[0] * 10}–${sp[1] * 10} min · grey: chance`}</text>
    </svg>
  );
}

function verdict(c: Compared, d: Driver, o: Outcome, ok: OK, span: number): string {
  if (c.sure === "too few" || !c.best) return c.days < MIN_DAYS
    ? `Not enough yet: ${c.days} of the ${MIN_DAYS} days needed with ${d.noun} logged and ${ok === "hr" ? "the band on" : "two or more check-ins"}.${span < 90 ? " Keep going, or try a longer stretch." : ""}`
    : `Not enough yet: ${c.n} ${ok === "hr" ? "readings" : "check-ins"} on days with ${d.noun} logged — at least 20 are needed.`;
  const lag = c.best.lag * 10, [s0, s1] = [c.span![0] * 10, c.span![1] * 10];
  if (c.sure === "not clear") return `No clear link over these ${c.days} days between ${d.noun} in your body and your ${o.noun} up to ${lagText(d.lags[d.lags.length - 1] * 10)} later. The strongest delay (${lagText(lag)}, r ${c.best.r.toFixed(2)}) is about what shuffled days give by chance.`;
  const up = c.best.r > 0, t = c.thirds;
  const thirds = t ? ` Above ${Math.round(t.hi)} ${d.unit} you run ${sgn(t.high)} ${o.unit} against the rest of that day, below ${Math.round(t.lo)} ${d.unit} ${sgn(t.low)}.` : "";
  return `More ${d.noun} in your body goes with ${up ? "higher" : "lower"} ${o.noun} about ${lagText(lag)} later (likely somewhere ${s0}–${s1} min): about ${sgn((c.slope ?? 0) * d.per)} ${o.unit} per ${d.per} ${d.unit}.${thirds} How sure: ${c.sure}.`
    + (span < 90 && c.sure === "likely" ? " More days will make it surer either way." : "");
}

function Say({ c, d, o, dk, ok, span }: { c: Compared; d: Driver; o: Outcome; dk: DK; ok: OK; span: number }) {
  const b = c.best, band = b ? c.lags.find((p) => p.lag === b.lag)?.band : null;
  return (
    <section className="cmp-p cmp-say" aria-label="What it says">
      <div className="cmp-sayt">
        <span className="cmp-k">What it says</span>
        <p className="cmp-verdict" data-sure={c.sure}>{verdict(c, d, o, ok, span)}</p>
        <p className="cmp-note">Goes with, not proof of cause: {dk === "caf" ? "a stressful hour can bring both a coffee and a higher heart rate" : "an evening out brings more than the drink"}.
          {" "}It looks within each day — hours with more {d.noun} against hours with less, the same day — so a day you run high anyway doesn't count.
          {ok === "hr" ? " Workouts and the hour after them are left out, and sleep." : " Days with one check-in can't be compared within the day."} Days with nothing logged are left out.
          {dk === "caf" && ok === "hr" ? <> For single coffees, <a href="#insights/heart">see each coffee lined up</a>.</> : null}</p>
      </div>
      {b && <dl className="cmp-stats">
        <dt>days · points</dt><dd>{c.days} · {c.n}</dd>
        <dt>per {d.per} {d.unit}</dt><dd>{sgn((c.slope ?? 0) * d.per)} {o.unit}{c.slopeSe ? ` (chance ±${(2 * c.slopeSe * d.per).toFixed(1)})` : ""}</dd>
        <dt>strongest delay</dt><dd>{lagText(b.lag * 10)} · r {b.r.toFixed(2)}</dd>
        <dt>likely delay</dt><dd>{c.span![0] * 10}–{c.span![1] * 10} min</dd>
        <dt>chance alone reaches</dt><dd>r ±{(band ?? 0).toFixed(2)}</dd>
        <dt>how sure (days shuffled)</dt><dd>{c.sure} · p {c.p! < 0.001 ? "<0.001" : c.p!.toFixed(3)}</dd>
      </dl>}
    </section>
  );
}
