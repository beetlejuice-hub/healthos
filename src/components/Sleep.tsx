/**
 * Insights → Sleep (PLAN 54, the owner's picks on the canvas, 8 Oct): B · last night in depth on top, A · the night
 * log under it (explained, with how regular you are), C · what goes with your sleep at the bottom. Numbers from
 * lib/sleep (tested against known answers); this file only draws. Words say what was different, never why.
 */

import { useEffect, useMemo, useState } from "react";
import type { BandData } from "../lib/band";
import { loadBandBefore } from "../lib/band-client";
import { caffeineAt } from "../lib/caffeine";
import type { Lanes } from "../lib/insights";
import { clockH, evenings, facts, firstAt, FACTORS, goesWith, nights, OUTCOMES, regularity, usual, usualNightHr, weekendShift, type Cell, type Evening, type Night, type Range } from "../lib/sleep";
import { addDays, atMinute, clock, dayLabel, DAY, HOUR, MIN } from "../lib/time";
import type { Entry } from "../lib/types";
import { useWidth } from "./useWidth";

const ST = { awake: "#eef1f2", rem: "#7fadf0", light: "#4f86dc", deep: "#2f5cc0" } as const;
/** The same stages as text: the dark blues are fills, too dark to read as words on the panel. */
const ST_TEXT = { awake: "#eef1f2", rem: "#a9c8f5", light: "#8db4f0", deep: "#7c9fe6" } as const;
const ROW = { awake: 0, rem: 1, light: 2, deep: 3 } as const;
const pad = (n: number) => String(n).padStart(2, "0");
const dur = (min: number) => { const t = Math.round(min); return `${Math.floor(t / 60)} h ${pad(t % 60)}`; };
const hmm = (min: number) => { const t = Math.round(min); return `${Math.floor(t / 60)}:${pad(t % 60)}`; };
const sgn = (v: number, d = 0) => { const t = Math.abs(v).toFixed(d); return Number(t) === 0 ? `±${t}` : `${v > 0 ? "+" : "−"}${t}`; };
const diam = (x: number, y: number, r: number) => `M${x.toFixed(1)} ${(y - r).toFixed(1)}l${r} ${r}l${-r} ${r}l${-r} ${-r}Z`;
const short = (n: Night) => dayLabel(atMinute(n.eve, 720)).slice(0, -4);
const nightName = (n: Night) => `${dayLabel(atMinute(n.eve, 720)).slice(0, 3)} ${dayLabel(atMinute(n.eve, 720)).split(" ")[1]} → ${dayLabel(atMinute(n.day, 720))}`;

export function SleepNights({ data, band, now, entries, halfLifeMin }: { data: Lanes; band: BandData | null; now: number; entries: Entry[]; halfLifeMin: number }) {
  const [span, setSpan] = useState<14 | 30 | 90>(30);
  // The nights need the band's older weeks; each load changes `band`, so this asks again until they're in.
  useEffect(() => { if (band) void loadBandBefore(now - (span + 2) * DAY); }, [band, now, span]);
  const all = useMemo(() => (band ? nights(band.sleep, band.hr, band.rhr, band.hrv) : []), [band]);
  const ns = useMemo(() => all.filter((n) => n.up >= now - span * DAY && n.up <= now), [all, now, span]);
  const evs = useMemo(() => evenings(ns, {
    drinks: data.drinks, caffeineAt: (t) => caffeineAt(data.doses.map((d) => ({ at: d.at, mg: d.mg })), t, halfLifeMin),
    workouts: data.workouts, meals: entries.filter((e) => e.kind === "food"), ratings: entries.flatMap((e) => (e.kind === "sleep" ? [{ at: e.at, rating: e.rating }] : [])),
  }), [ns, data, entries, halfLifeMin]);
  const [selId, setSel] = useState<string | null>(null);
  const si = Math.max(0, ns.findIndex((n) => n.id === selId) >= 0 ? ns.findIndex((n) => n.id === selId) : ns.length - 1);
  // Measured from the first render (useWidth only looks on mount), so the box is there before the band's data is.
  const [ref, w] = useWidth<HTMLDivElement>();
  if (!band) return <div className="sl" ref={ref} hidden />;
  if (!ns.length) return <div className="sl" data-sec="sleep" ref={ref}><div className="sl-empty">No nights from your band in these {span} days yet. Wear it to bed and they show up here the next morning.</div></div>;
  const wide = w >= 760, n = ns[si], e = evs[si];
  return (
    <div className="sl" data-sec="sleep" ref={ref} data-nights={ns.length}>
      <div className="sl-bar">
        <button type="button" className="ibtn" disabled={si === 0} onClick={() => setSel(ns[si - 1].id)} aria-label="The night before">‹ {si > 0 ? short(ns[si - 1]) : ""}</button>
        <h2 className="sl-title">{si === ns.length - 1 ? "Last night" : "Night"} · {nightName(n)}</h2>
        <button type="button" className="ibtn" disabled={si === ns.length - 1} onClick={() => setSel(ns[si + 1].id)} aria-label="The night after">{si < ns.length - 1 ? short(ns[si + 1]) : ""} ›</button>
        <div className="iseg" role="group" aria-label="Nights to compare with">
          {([14, 30, 90] as const).map((d) => <button key={d} type="button" aria-pressed={span === d} onClick={() => setSpan(d)}>{d} nights</button>)}
        </div>
      </div>
      <LastNight n={n} e={e} ns={ns} evs={evs} band={band} data={data} wide={wide} w={w} />
      <Minis ns={ns.slice(-14)} sel={n.id} onSel={setSel} w={w} />
      <NightLog ns={ns} evs={evs} sel={n} onSel={setSel} wide={wide} w={w} workouts={data.workouts} meals={data.meals} />
      <GoesWith ns={ns} evs={evs} wide={wide} w={w} />
    </div>
  );
}

/* ------------------------------------------------------------------ B · last night, in depth */

function LastNight({ n, e, ns, evs, band, data, wide, w }: { n: Night; e: Evening; ns: Night[]; evs: Evening[]; band: BandData; data: Lanes; wide: boolean; w: number }) {
  const others = ns.filter((x) => x.id !== n.id);
  const said = facts(n, e, ns, { clock, dur: (m) => (m < 60 ? `${Math.round(m)} min` : dur(m)) });
  const cw = wide ? w - 360 - 12 : w;
  return (
    <section className="sl-b" aria-label="The night in depth">
      <div className={`sl-b-grid${wide ? " wide" : ""}`}>
        <div className="sl-p sl-chart"><NightChart n={n} ns={ns} band={band} data={data} w={cw - 2} wide={wide} /></div>
        <div className="sl-p sl-nums">
          <div className="sl-asleep"><b>{dur(n.asleep)}</b> <span>asleep · {dur((n.up - n.bed) / MIN)} in bed · {Math.round((n.asleep / ((n.up - n.bed) / MIN)) * 100)} % of it asleep</span></div>
          <Bullets n={n} e={e} ns={ns} ratings={evs.map((x) => x.rating)} />
          <div className="sl-facts">
            <span className="cmp-k">What was different</span>
            {said.length ? said.map((s) => <p key={s}>{s}</p>) : <p>Nothing stood out against your other {others.length} nights.</p>}
            <p className="sl-note">Facts about this night, not causes. What goes with what across many nights is at the bottom.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function NightChart({ n, ns, band, data, w, wide }: { n: Night; ns: Night[]; band: BandData; data: Lanes; w: number; wide: boolean }) {
  const L = wide ? 62 : 48, R = wide ? 44 : 30, t0 = atMinute(n.eve, (wide ? 13 : 18) * 60), t1 = n.up + 20 * MIN;
  const X = (t: number) => L + ((t - t0) / (t1 - t0)) * (w - L - R);
  const ey0 = 44, ey1 = 128, hy0 = 168, RW = wide ? 24 : 19, ry0 = hy0 + 4 * RW + 48, ry1 = ry0 + (wide ? 210 : 160), H = ry1 + 28;
  const inWin = (t: number) => t >= t0 && t <= t1;
  // evening: caffeine (mg) and alcohol (g) in the body, from what was logged
  const caf = data.caffeine.filter(([t]) => inWin(t) && t <= n.up), alc = data.alcohol.filter(([t]) => inWin(t) && t <= n.up);
  const cTop = Math.max(100, ...caf.map((p) => p[1])), aTop = Math.max(25, ...alc.map((p) => p[1]));
  const CY = (v: number) => ey1 - (Math.min(v, cTop) / cTop) * (ey1 - ey0), AY = (g: number) => ey1 - (Math.min(g, aTop) / aTop) * (ey1 - ey0);
  const line = (pts: [number, number][], Y: (v: number) => number) => pts.map(([t, v], i) => `${i ? "L" : "M"}${X(t).toFixed(1)} ${Y(v).toFixed(1)}`).join("");
  const area = (pts: [number, number][], Y: (v: number) => number) => (pts.length ? `M${X(pts[0][0]).toFixed(1)} ${ey1}${line(pts, Y).replace(/^M/, "L")}L${X(pts.at(-1)![0]).toFixed(1)} ${ey1}Z` : "");
  const atBed = (pts: [number, number][]) => { const p = pts.filter(([t]) => t <= n.bed).at(-1); return p ? p[1] : 0; };
  const doses = data.doses.filter((d) => inWin(d.at) && d.at < n.bed), drinks = data.drinks.filter((d) => inWin(d.at) && d.at < n.bed);
  const meals = data.meals.filter((m) => inWin(m.at) && m.at < n.bed && m.kcal >= 150), gyms = data.workouts.filter((g) => g.end > t0 && g.start < n.bed);
  // heart rate asleep, and the middle half of the other nights at each 10 minutes
  const i0 = firstAt(band.hr, n.bed), hr: [number, number][] = [];
  for (let i = i0; i < band.hr.length && band.hr[i][0] <= n.up; i++) hr.push([band.hr[i][0], band.hr[i][1]]);
  // The line you read is a 5-minute average (the same one the lowest point is taken from); the minutes stay faint behind it.
  const smooth: [number, number][] = hr.map(([t], i) => { let s = 0, c = 0; for (let j = i; j >= 0 && t - hr[j][0] < 5 * MIN; j--) { s += hr[j][1]; c++; } for (let j = i + 1; j < hr.length && hr[j][0] - t < 5 * MIN; j++) { s += hr[j][1]; c++; } return [t, s / c]; });
  const usualBand = usualNightHr(ns, band.hr, n.id).map((b) => ({ ...b, t: atMinute(n.eve, 0) + b.h * HOUR })).filter((b) => b.t >= n.bed && b.t <= n.up);
  const vals = [...hr.map((p) => p[1]), ...usualBand.flatMap((b) => [b.lo, b.hi])];
  const hLo = vals.length ? Math.floor(Math.min(...vals) - 2) : 45, hHi = vals.length ? Math.max(hLo + 20, Math.ceil(Math.max(...vals) + 2)) : 75;
  const HY = (v: number) => ry1 - ((v - hLo) / (hHi - hLo)) * (ry1 - ry0);
  const others = ns.filter((x) => x.id !== n.id), uLow = usual(others.map((x) => x.low)), uLowAt = usual(others.map((x) => (x.lowAt == null ? null : clockH(x.lowAt, x.eve))));
  const step = wide ? 3 : 4, ticks: number[] = [];
  for (let k = 0; k <= 1; k++) for (let h = 0; h < 24; h += step) { const t = atMinute(addDays(n.eve, k), h * 60); if (t >= t0 && t <= t1) ticks.push(t); }
  const hTicks: number[] = []; for (let v = Math.ceil(hLo / 5) * 5; v <= hHi; v += 5) hTicks.push(v);
  const sum = (t: keyof typeof ROW) => (t === "awake" ? n.awake + n.latency : (n[t] ?? 0));
  return (
    <svg width={w} height={H} viewBox={`0 0 ${w} ${H}`} className="he-svg" role="img" aria-label={`The evening and the night of ${nightName(n)}: what was in your body, the sleep stages, and heart rate asleep against your usual`}>
      <rect x={X(n.bed)} y={30} width={X(n.up) - X(n.bed)} height={ry1 - 30} fill="var(--i-ink)" fillOpacity=".025" />
      {ticks.map((t) => <g key={t}><line x1={X(t)} x2={X(t)} y1={30} y2={ry1} className="cmp-v" /><text x={X(t)} y={H - 8} textAnchor="middle" className="he-t">{clock(t)}</text></g>)}
      <line x1={0} x2={w} y1={ey1 + 22} y2={ey1 + 22} className="cmp-v" /><line x1={0} x2={w} y1={hy0 + 4 * RW + 24} y2={hy0 + 4 * RW + 24} className="cmp-v" />
      <text x={12} y={16} className="cmp-k">{wide ? "The evening" : "Evening"}</text>
      {caf.length > 0 && <><text x={w - R + 6} y={CY(cTop) + 3} className="he-t" style={{ fill: "var(--caf)" }}>{Math.round(cTop)} mg</text><line x1={L} x2={w - R} y1={CY(cTop)} y2={CY(cTop)} className="he-grid" /></>}
      {alc.some((p) => p[1] > 0) && <text x={L - 6} y={AY(aTop) + 3} textAnchor="end" className="he-t" style={{ fill: "#c3a3be" }}>{Math.round(aTop)} g</text>}
      <line x1={L} x2={w - R} y1={ey1} y2={ey1} className="he-zero" />
      <text x={12} y={ey1 + 40} className="cmp-k">Stages</text>
      <text x={12} y={hy0 + 4 * RW + 42} className="cmp-k">Heart rate asleep · bpm</text>
      {gyms.map((g) => <g key={g.start}><rect x={X(Math.max(t0, g.start))} y={ey0 - 8} width={Math.max(2, X(Math.min(n.bed, g.end)) - X(Math.max(t0, g.start)))} height={ey1 - ey0 + 8} fill="var(--gym)" fillOpacity=".14" /><text x={X(Math.max(t0, g.start)) + 3} y={ey0 - 12} className="sl-tag" style={{ fill: "#d9b54a" }}>{g.name}</text></g>)}
      {n.nap && inWin(n.nap.start) && <g><rect x={X(n.nap.start)} y={ey1 - 12} width={Math.max(2, X(n.nap.end) - X(n.nap.start))} height={12} fill={ST.light} /><text x={X(n.nap.start)} y={ey1 + 16} className="sl-tag" style={{ fill: ST.rem }}>nap {clock(n.nap.start)} · {Math.round(n.nap.min)} min</text></g>}
      {caf.length > 0 && <><path d={area(caf, CY)} fill="var(--caf)" fillOpacity=".18" /><path d={line(caf, CY)} fill="none" stroke="var(--caf)" strokeWidth="1.6" /></>}
      {alc.some((p) => p[1] > 0) && <><path d={area(alc, AY)} fill="var(--alc)" fillOpacity=".22" /><path d={line(alc, AY)} fill="none" stroke="var(--alc)" strokeWidth="1.6" /></>}
      {doses.map((d) => <circle key={d.at} cx={X(d.at)} cy={CY(caf.find(([t]) => t >= d.at)?.[1] ?? 0)} r={4} fill="var(--caf)" stroke="var(--i-panel)" strokeWidth="1.5" />)}
      {meals.map((m) => <rect key={m.at} x={X(m.at) - 4} y={ey1 - 9} width={8} height={8} fill="var(--kcal)" />)}
      {drinks.map((d, i) => <path key={d.at} d={diam(X(d.at), ey1 - 22 - (i % 3) * 11, 5)} fill="var(--alc)" stroke="var(--i-panel)" strokeWidth="1.5" />)}
      {wide && doses.slice(-1).map((d) => <text key={d.at} x={X(d.at) + 7} y={ey0 + 4} className="sl-tag" style={{ fill: "var(--caf)" }}>coffee {clock(d.at)}</text>)}
      {wide && meals.slice(-1).map((m) => <text key={m.at} x={X(m.at) - 4} y={ey1 + 16} className="sl-tag" style={{ fill: "var(--kcal)" }}>{m.name.toLowerCase()} {clock(m.at)}</text>)}
      {drinks.length > 0 && <text x={X(drinks.at(-1)!.at) + 8} y={ey1 - 30 - Math.min(2, drinks.length - 1) * 11} className="sl-tag" style={{ fill: "#c3a3be" }}>{drinks.length} drink{drinks.length > 1 ? "s" : ""}</text>}
      <line x1={X(n.bed)} x2={X(n.bed)} y1={30} y2={ry1} className="sl-mark" /><line x1={X(n.up)} x2={X(n.up)} y1={30} y2={ry1} className="sl-mark" />
      <text x={X(n.bed) + 5} y={30} className="sl-tag" style={{ fill: "var(--i-ink)" }}>in bed {clock(n.bed)}</text>
      {wide && <text x={X(n.bed) + 5} y={44} className="cmp-s">{[atBed(caf) >= 1 && `${Math.round(atBed(caf))} mg caffeine`, atBed(alc) >= 1 && `${Math.round(atBed(alc))} g alcohol`].filter(Boolean).join(", ") ? `at bed: ${[atBed(caf) >= 1 && `${Math.round(atBed(caf))} mg caffeine`, atBed(alc) >= 1 && `${Math.round(atBed(alc))} g alcohol`].filter(Boolean).join(", ")}` : ""}</text>}
      <text x={X(n.up) - 5} y={30} textAnchor="end" className="sl-tag" style={{ fill: "var(--i-ink)" }}>up {clock(n.up)}</text>
      {(["awake", "rem", "light", "deep"] as const).map((s) => <g key={s}>
        <text x={L - 6} y={hy0 + ROW[s] * RW + RW / 2 + 4} textAnchor="end" className="sl-tag" style={{ fill: ST_TEXT[s] }}>{s === "rem" ? "REM" : s[0].toUpperCase() + s.slice(1)}</text>
        <line x1={L} x2={w - R} y1={hy0 + ROW[s] * RW + RW} y2={hy0 + ROW[s] * RW + RW} className="he-grid" />
        <text x={w - R + 6} y={hy0 + ROW[s] * RW + RW / 2 + 4} className="he-t">{Math.round(sum(s))}m</text>
      </g>)}
      {n.stages.map((s) => <rect key={s.start} x={X(s.start)} y={hy0 + ROW[s.type] * RW + 2} width={Math.max(0.8, X(s.end) - X(s.start))} height={RW - 4} fill={ST[s.type]} fillOpacity={s.type === "awake" ? 0.85 : 1} />)}
      {!n.stages.length && <text x={(X(n.bed) + X(n.up)) / 2} y={hy0 + 2 * RW} textAnchor="middle" className="cmp-s">no stages for this night</text>}
      {hTicks.map((v) => <g key={v}><line x1={L} x2={w - R} y1={HY(v)} y2={HY(v)} className="he-grid" /><text x={w - R + 6} y={HY(v) + 3} className="he-t">{v}</text></g>)}
      {usualBand.length > 1 && <>
        <path d={`M${usualBand.map((b) => `${X(b.t).toFixed(1)} ${HY(b.hi).toFixed(1)}`).join("L")}L${[...usualBand].reverse().map((b) => `${X(b.t).toFixed(1)} ${HY(b.lo).toFixed(1)}`).join("L")}Z`} fill="var(--i-ink-2)" fillOpacity=".16" />
        <path d={`M${usualBand.map((b) => `${X(b.t).toFixed(1)} ${HY(b.mid).toFixed(1)}`).join("L")}`} fill="none" stroke="var(--i-ink-2)" strokeOpacity=".6" strokeDasharray="4 3" />
      </>}
      {hr.length > 1 && <>
        <path d={hr.map(([t, v], i) => `${i && t - hr[i - 1][0] <= 20 * MIN ? "L" : "M"}${X(t).toFixed(1)} ${HY(v).toFixed(1)}`).join("")} fill="none" stroke="var(--hr)" strokeOpacity=".3" strokeWidth="1" />
        <path d={smooth.map(([t, v], i) => `${i && t - smooth[i - 1][0] <= 20 * MIN ? "L" : "M"}${X(t).toFixed(1)} ${HY(v).toFixed(1)}`).join("")} fill="none" stroke="var(--hr)" strokeWidth="2" strokeLinejoin="round" />
      </>}
      {!hr.length && <text x={(X(n.bed) + X(n.up)) / 2} y={(ry0 + ry1) / 2} textAnchor="middle" className="cmp-s">no heart rate for this night</text>}
      {uLow && uLowAt && <circle cx={X(atMinute(n.eve, 0) + uLowAt.mid * HOUR)} cy={HY(uLow.mid)} r={4.5} fill="none" stroke="var(--i-ink-2)" strokeWidth="1.5" />}
      {n.low != null && n.lowAt != null && <>
        <circle cx={X(n.lowAt)} cy={HY(n.low)} r={5} fill="var(--hr)" stroke="var(--i-panel)" strokeWidth="2" />
        <text x={X(n.lowAt) + (X(n.lowAt) > w * 0.7 ? -9 : 9)} y={HY(n.low) + 18} textAnchor={X(n.lowAt) > w * 0.7 ? "end" : "start"} className="he-mark">lowest {Math.round(n.low)} at {clock(n.lowAt)}</text>
      </>}
      {uLow && uLowAt && <text x={X(atMinute(n.eve, 0) + uLowAt.mid * HOUR)} y={HY(uLow.mid) - 10} textAnchor="middle" className="cmp-s">usually ~{Math.round(uLow.mid)}</text>}
      {usualBand.length > 1 && wide && <text x={w - R} y={hy0 + 4 * RW + 42} textAnchor="end" className="cmp-s">grey: the middle half of your other nights at each time · red: a 5-minute average</text>}
    </svg>
  );
}

function Bullets({ n, e, ns, ratings }: { n: Night; e: Evening; ns: Night[]; ratings: (number | null)[] }) {
  const evs = (k: (x: Night) => number | null) => ns.map(k);
  const rows: [string, number | null, (number | null)[], (v: number) => string][] = [
    ["Fell asleep in", n.latency, evs((x) => x.latency), (v) => `${Math.round(v)} min`],
    ["Awake in the night", n.awake, evs((x) => x.awake), (v) => `${Math.round(v)} min`],
    ["Deep sleep", n.deep, evs((x) => x.deep), (v) => `${Math.round(v)} min`],
    ["REM", n.rem, evs((x) => x.rem), (v) => `${Math.round(v)} min`],
    ["Nap that day", n.nap?.min ?? 0, [], (v) => (v ? `${Math.round(v)} min` : "none")],
    ["Lowest heart rate", n.low, evs((x) => x.low), (v) => `${Math.round(v)} bpm`],
    ["…came at", n.lowAt == null ? null : clockH(n.lowAt, n.eve), evs((x) => (x.lowAt == null ? null : clockH(x.lowAt, x.eve))), (v) => clock(atMinute(n.eve, 0) + v * HOUR)],
    ["HRV", n.hrv, evs((x) => x.hrv), (v) => `${Math.round(v)} ms`],
    ["Resting heart rate", n.rhr, evs((x) => x.rhr), (v) => `${Math.round(v)} bpm`],
    ["Your rating", e.rating, ratings, (v) => `${v}/10`],
  ];
  const BW = 130, RH = 30;
  return (
    <div className="sl-bul" role="list" aria-label="Each number from this night against the middle half of your nights">
      {rows.map(([name, v, all, fmt]) => {
        const s = all.filter((x): x is number => x != null), u = usual(s), mn = Math.min(...s, v ?? Infinity), mx = Math.max(...s, v ?? -Infinity);
        const BX = (x: number) => 6 + ((x - mn) / (mx - mn || 1)) * (BW - 12), out = u && v != null && (v < u.lo || v > u.hi);
        return (
          <div key={name} className="sl-bul-r" role="listitem" data-out={out || undefined}>
            <span>{name}</span><b>{v == null ? "–" : fmt(v)}</b>
            <svg width={BW} height={RH - 10} viewBox={`0 0 ${BW} ${RH - 10}`} aria-hidden="true">
              {u && <><rect x={BX(u.lo)} y={5} width={Math.max(2, BX(u.hi) - BX(u.lo))} height={10} fill="var(--i-ink-2)" fillOpacity=".2" /><line x1={BX(u.mid)} x2={BX(u.mid)} y1={3} y2={17} stroke="var(--i-ink-2)" strokeWidth="1.5" /></>}
              {v != null && u && <circle cx={BX(v)} cy={10} r={4.5} fill="var(--i-ink)" stroke="var(--i-panel)" strokeWidth="2" />}
            </svg>
          </div>
        );
      })}
      <span className="sl-bul-k">grey: the middle half of your nights · dot: this night</span>
    </div>
  );
}

/** The last 14 nights, small; tap one to open it above. */
function Minis({ ns, sel, onSel, w }: { ns: Night[]; sel: string; onSel: (id: string) => void; w: number }) {
  const per = w >= 760 ? ns.length : 7, cw = Math.floor((w - 2) / per) - 4;
  return (
    <div className="sl-minis" role="group" aria-label="The last nights, small — tap one to open it">
      {ns.map((n) => {
        const X = (t: number) => 4 + ((clockH(t, n.eve) - 21.5) / (34 - 21.5)) * (cw - 8);
        return (
          <button key={n.id} type="button" className="sl-mini" aria-pressed={n.id === sel} onClick={() => onSel(n.id)} style={{ width: cw }} aria-label={`Night of ${nightName(n)}: ${dur(n.asleep)} asleep`}>
            <span className="d">{short(n)}</span><span className="v">{hmm(n.asleep)}</span>
            <svg width={cw - 2} height={52} viewBox={`0 0 ${cw - 2} 52`} aria-hidden="true">
              {n.stages.map((s) => <rect key={s.start} x={X(s.start)} y={2 + ROW[s.type] * 12} width={Math.max(0.5, X(s.end) - X(s.start))} height={10} fill={ST[s.type]} />)}
            </svg>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ A · the night log */

function NightLog({ ns, evs, sel, onSel, wide, w, workouts, meals }: { ns: Night[]; evs: Evening[]; sel: Night; onSel: (id: string) => void; wide: boolean; w: number; workouts: { start: number; end: number }[]; meals: { at: number }[] }) {
  const U = {
    asleep: usual(ns.map((n) => n.asleep)), deep: usual(ns.map((n) => n.deep)), rem: usual(ns.map((n) => n.rem)), awake: usual(ns.map((n) => n.awake)),
    low: usual(ns.map((n) => n.low)), hrv: usual(ns.map((n) => n.hrv)), bed: usual(ns.map((n) => clockH(n.bed, n.eve))), up: usual(ns.map((n) => clockH(n.up, n.eve))),
    lat: usual(ns.map((n) => n.latency)), wake: usual(ns.map((n) => clockH(n.wake, n.eve))),
  };
  const reg = regularity(ns), shift = weekendShift(ns), naps = ns.filter((n) => n.nap);
  const hm = (h: number) => clock(atMinute("2026-01-01", 0) + h * HOUR);
  const typical = U.bed && U.up && U.asleep && U.lat
    ? `You’re usually in bed by ${hm(U.bed.mid)}, asleep ${Math.round(U.lat.mid)} minutes later, and up at ${hm(U.up.mid)} — about ${dur(U.asleep.mid)} of sleep.${shift != null && Math.abs(shift) >= 20 ? ` Friday and Saturday nights run about ${shift < 60 ? `${Math.round(Math.abs(shift))} min` : dur(Math.abs(shift))} ${shift > 0 ? "later" : "earlier"}.` : ""}`
    : `A typical night needs at least 5 nights — ${ns.length} so far.`;
  // the log: each night a strip on one clock (18:00 → 11:00), its numbers beside it
  const cols: [string, string, (n: Night, e: Evening) => number | null, Range | null, (v: number) => string][] = wide ? [
    ["Asleep", "h:mm", (n) => n.asleep, U.asleep, hmm], ["Deep", "min", (n) => n.deep, U.deep, (v) => String(Math.round(v))], ["REM", "min", (n) => n.rem, U.rem, (v) => String(Math.round(v))],
    ["Awake", "min", (n) => n.awake, U.awake, (v) => String(Math.round(v))], ["Lowest HR", "bpm", (n) => n.low, U.low, (v) => String(Math.round(v))], ["HRV", "ms", (n) => n.hrv, U.hrv, (v) => String(Math.round(v))],
    ["Nap", "that day", (n) => n.nap?.min ?? null, null, (v) => `${Math.round(v)}m`], ["Rating", "you gave", (_, e) => e.rating, null, (v) => String(v)],
  ] : [["Asleep", "", (n) => n.asleep, U.asleep, hmm]];
  const CW = wide ? 62 : 54, tx = w - 6 - cols.length * CW, sx0 = wide ? 104 : 50, sx1 = tx - 14, c0 = 18, c1 = 35;
  const X = (h: number) => sx0 + ((h - c0) / (c1 - c0)) * (sx1 - sx0), top = 50, RH = wide ? 22 : 25, list = [...ns].reverse(), H = top + list.length * RH + 8;
  const D = { awake: 3, rem: 7, light: 11, deep: 15 } as const;
  const ticks: number[] = []; for (let h = 18; h <= 35; h += wide ? 3 : 4) ticks.push(h);
  return (
    <section className="sl-a" aria-label="Your nights, one per row">
      <div className={`sl-a-top${wide ? " wide" : ""}`}>
        <div className="sl-p sl-typical"><span className="cmp-k">A typical night for you</span><p>{typical}</p>
          {U.deep && U.low && <div className="sl-chips"><span>deep <b>{Math.round(U.deep.mid)} min</b></span>{U.rem && <span>REM <b>{Math.round(U.rem.mid)} min</b></span>}<span>lowest heart rate <b>{Math.round(U.low.mid)} bpm</b></span>{U.hrv && <span>HRV <b>{Math.round(U.hrv.mid)} ms</b></span>}<span>naps <b>{naps.length} of {ns.length} days</b></span></div>}
        </div>
        <div className="sl-p sl-reg" data-score={reg ? Math.round(reg.score) : undefined}>
          <span className="cmp-k">Regularity</span>
          {reg ? <>
            <div className="sl-reg-n"><b>{Math.round(reg.score)}</b><span>/ 100 · {reg.score >= 80 ? "steady" : reg.score >= 65 ? "fairly steady" : "varies a lot"}</span></div>
            <svg width="300" height="24" viewBox="0 0 300 24" aria-label={`Regularity ${Math.round(reg.score)} on a 0 to 100 scale; most adults are between 60 and 90`} role="img">
              <rect x="0" y="6" width="300" height="6" fill="var(--i-line)" /><rect x={180} y="6" width={90} height="6" fill="var(--i-ink-2)" fillOpacity=".3" />
              <circle cx={Math.max(6, Math.min(294, reg.score * 3))} cy="9" r="6" fill="var(--i-ink)" stroke="var(--i-panel)" strokeWidth="2" />
            </svg>
            <div className="sl-reg-k"><span>0</span><span>most adults 60–90</span><span>100</span></div>
            <p>How alike your days are: on {Math.round((reg.score + 100) / 2)} % of the day you were asleep or awake at the same times as the day before. Naps count.</p>
            {U.bed && U.wake && <p className="sl-mono">bedtime ±{Math.round((U.bed.hi - U.bed.lo) * 30)} min · wake ±{Math.round((U.wake.hi - U.wake.lo) * 30)} min · from {reg.pairs} pairs of days</p>}
          </> : <p>Needs 5 pairs of days in a row with the band on — keep wearing it to bed.</p>}
        </div>
      </div>
      <div className="sl-p sl-log">
        <div className="sl-log-key">
          <span><i style={{ background: ST.deep, height: 15 }} /><i style={{ background: ST.light, height: 11 }} /><i style={{ background: ST.rem, height: 7 }} /><i style={{ background: ST.awake, height: 3 }} /> deep · light · REM · awake — <b>taller and darker is deeper sleep</b></span>
          <span><i className="dia" /> drink</span><span><i style={{ background: "var(--kcal)", height: 7, width: 7 }} /> meal after 21:00</span><span><i style={{ background: "var(--gym)", height: 3, width: 14 }} /> workout</span>
          <span><i style={{ background: "var(--hr)", height: 8, width: 2 }} /> lowest heart rate</span><span>┆ your usual bed and up times</span>{wide && <span>↑ ↓ more or less than on most of your nights</span>}
        </div>
        <div className="sl-log-body" style={{ height: H }}>
          <svg width={w - 2} height={H} viewBox={`0 0 ${w - 2} ${H}`} role="img" aria-label="Your nights, newest at the top, each a strip from 18:00 to 11:00 with its numbers">
            {list.map((n, j) => [5, 6].includes(new Date(atMinute(n.eve, 720)).getDay()) && <rect key={n.id} x={0} y={top + j * RH} width={w} height={RH} fill="var(--i-ink)" fillOpacity=".025" />)}
            {ticks.map((h) => <g key={h}><line x1={X(h)} x2={X(h)} y1={top - 6} y2={H - 8} className="cmp-v" /><text x={X(h)} y={16} textAnchor="middle" className="he-t">{hm(h)}</text></g>)}
            {U.bed && U.up && <><line x1={X(U.bed.mid)} x2={X(U.bed.mid)} y1={top - 8} y2={H - 8} className="sl-usual" /><line x1={X(U.up.mid)} x2={X(U.up.mid)} y1={top - 8} y2={H - 8} className="sl-usual" />
              {wide && <><text x={X(U.bed.mid) - 4} y={34} textAnchor="end" className="cmp-s">usual bed {hm(U.bed.mid)}</text><text x={X(U.up.mid) + 4} y={34} className="cmp-s">usual up {hm(U.up.mid)}</text></>}</>}
            {cols.map(([name, unit], ci) => <g key={name}><text x={tx + ci * CW + CW - 10} y={16} textAnchor="end" className="sl-colh">{name}</text>{unit && <text x={tx + ci * CW + CW - 10} y={30} textAnchor="end" className="he-t">{unit}</text>}</g>)}
            {list.map((n, j) => {
              const y = top + j * RH, base = y + RH - 4, e = evs[ns.indexOf(n)];
              return (
                <g key={n.id}>
                  <text x={sx0 - 8} y={y + RH / 2 + 4} textAnchor="end" className="sl-day" data-sel={n.id === sel.id || undefined}>{wide ? dayLabel(atMinute(n.eve, 720)).slice(0, -4) : short(n)}</text>
                  <line x1={X(clockH(n.bed, n.eve))} x2={X(clockH(n.up, n.eve))} y1={base + 0.5} y2={base + 0.5} stroke="var(--i-line-2)" />
                  {n.stages.map((s) => <rect key={s.start} x={X(clockH(s.start, n.eve))} y={base - D[s.type]} width={Math.max(0.7, X(clockH(s.end, n.eve)) - X(clockH(s.start, n.eve)))} height={D[s.type]} fill={ST[s.type]} fillOpacity={s.type === "awake" ? 0.85 : 1} />)}
                  {!n.stages.length && <rect x={X(clockH(n.onset, n.eve))} y={base - 11} width={X(clockH(n.wake, n.eve)) - X(clockH(n.onset, n.eve))} height={11} fill={ST.light} fillOpacity=".6" />}
                  {n.lowAt != null && <line x1={X(clockH(n.lowAt, n.eve))} x2={X(clockH(n.lowAt, n.eve))} y1={base - 18} y2={base - 13} stroke="var(--hr)" strokeWidth="2" />}
                  {workouts.filter((g) => g.end > atMinute(n.eve, c0 * 60) && g.start < n.bed).map((g) => <rect key={g.start} x={X(Math.max(c0, clockH(g.start, n.eve)))} y={base - 3} width={Math.max(2, X(clockH(g.end, n.eve)) - X(Math.max(c0, clockH(g.start, n.eve))))} height={3} fill="var(--gym)" fillOpacity=".8" />)}
                  {meals.filter((m) => m.at >= atMinute(n.eve, 21 * 60) && m.at < n.bed).map((m) => <rect key={m.at} x={X(clockH(m.at, n.eve)) - 3} y={base - 9} width={6} height={6} fill="var(--kcal)" />)}
                  {e.drinks.filter((t) => clockH(t, n.eve) >= c0).map((t) => <path key={t} d={diam(X(clockH(t, n.eve)), base - 6, 4.2)} fill="var(--alc)" stroke="var(--i-panel)" strokeWidth="1.2" />)}
                  {cols.map(([name, , get, u, fmt], ci) => {
                    const v = get(n, e), x = tx + ci * CW + CW - 10;
                    if (v == null) return <text key={name} x={x} y={y + RH / 2 + 4} textAnchor="end" className="sl-num" data-none>–</text>;
                    const arrow = u ? (v > u.hi ? "↑" : v < u.lo ? "↓" : "") : "";
                    return <g key={name}><text x={x} y={y + RH / 2 + 4} textAnchor="end" className="sl-num" data-out={arrow ? true : undefined}>{fmt(v)}</text>{arrow && <text x={x + 2} y={y + RH / 2 + 4} className="sl-arrow">{arrow}</text>}</g>;
                  })}
                  {!wide && n.nap && <text x={sx1 + 4} y={y + RH / 2 + 4} className="sl-nap">nap</text>}
                  {n.id === sel.id && <rect x={2.5} y={y + 0.5} width={w - 7} height={RH - 1} fill="none" stroke="var(--i-line-2)" />}
                </g>
              );
            })}
          </svg>
          {list.map((n, j) => <button key={n.id} type="button" className="sl-rowbtn" style={{ top: top + j * RH, height: RH }} aria-pressed={n.id === sel.id} aria-label={`Open the night of ${nightName(n)}`} onClick={() => { onSel(n.id); document.querySelector(".sl-b")?.scrollIntoView({ behavior: "smooth", block: "start" }); }} />)}
        </div>
        <p className="sl-note">Tap a night to open it at the top. Naps: Fitbit records one by itself from about an hour; a shorter one shows if you log it.</p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ C · what goes with your sleep */

function GoesWith({ ns, evs, wide, w }: { ns: Night[]; evs: Evening[]; wide: boolean; w: number }) {
  const cells = useMemo(() => goesWith(ns, evs), [ns, evs]);
  const outs = wide ? OUTCOMES : OUTCOMES.filter((o) => o.id !== "awake" && o.id !== "rating");
  const [open, setOpen] = useState<{ f: string; o: string } | null>(null);
  const firstClear = cells.filter((c) => c.sure === "clear" && outs.some((o) => o.id === c.outcome)).sort((a, b) => a.p! - b.p!)[0];
  const cur = open ?? (firstClear ? { f: firstClear.factor, o: firstClear.outcome } : null);
  const fmt = (c: Cell) => {
    const o = OUTCOMES.find((x) => x.id === c.outcome)!, d = c.diff!;
    if (Math.abs(d) < 0.05) return "±0";
    if (o.unit === "min") return `${sgn(d)}m`;
    if (o.unit === "clock") return Math.abs(d) >= 60 ? `${d > 0 ? "+" : "−"}${hmm(Math.abs(d))}` : `${sgn(d)}m`;
    return sgn(d, 1);
  };
  const shown = FACTORS.filter((f) => cells.some((c) => c.factor === f.id && c.sure !== "too few"));
  const hidden = FACTORS.filter((f) => !shown.includes(f)).map((f) => { const c = cells.find((x) => x.factor === f.id)!; return `${f.name.toLowerCase()} (${c.nWith} with, ${c.nWithout} without)`; });
  if (ns.length < 10) return <section className="sl-p sl-c" aria-label="What goes with your sleep"><span className="cmp-k">What goes with your sleep</span><p>Needs at least 10 nights with the band, and 5 with and 5 without each thing — {ns.length} nights so far.</p></section>;
  return (
    <section className="sl-p sl-c" aria-label="What goes with your sleep">
      <span className="cmp-k">What goes with your sleep</span>
      <p className="sl-c-sub">Each cell: nights with the thing against nights without it. Filled: clear · faint: likely · empty: not clear yet. Goes with, not proof of cause.</p>
      <div className={`sl-c-grid${wide ? " wide" : ""}`}>
        <div className="sl-matrix" style={{ gridTemplateColumns: `minmax(${wide ? 170 : 88}px, 1fr) repeat(${outs.length}, ${wide ? 50 : 38}px)` }} role="table" aria-label="Evening things against sleep measures">
          <span role="columnheader" />
          {outs.map((o) => <span key={o.id} role="columnheader" className="sl-mh">{o.name}</span>)}
          {shown.map((f) => {
            const row = cells.filter((c) => c.factor === f.id), any = row[0];
            return [
              <span key={f.id} role="rowheader" className="sl-mf">{f.name}<small>{any ? `${any.nWith} vs ${any.nWithout} nights` : ""}</small></span>,
              ...outs.map((o) => {
                const c = row.find((x) => x.outcome === o.id)!, isOpen = cur?.f === f.id && cur?.o === o.id;
                return <button key={o.id} type="button" role="cell" className="sl-cell" data-sure={c.sure} data-toward={c.toward ?? undefined} aria-pressed={isOpen} disabled={c.sure === "too few"}
                  aria-label={`${f.name} and ${o.name}: ${c.sure === "too few" ? "too few nights" : `${fmt(c)}, ${c.sure}`}`} onClick={() => setOpen({ f: f.id, o: o.id })}>{c.sure === "too few" ? "·" : fmt(c)}</button>;
              }),
            ];
          })}
        </div>
        {cur && <Opened ns={ns} evs={evs} cell={cells.find((c) => c.factor === cur.f && c.outcome === cur.o)!} w={wide ? Math.min(460, w - 640) : w - 32} />}
      </div>
      {hidden.length > 0 && <p className="sl-note">Not enough nights yet — 5 with and 5 without — for: {hidden.join(", ")}.</p>}
      <div className="sl-c-key"><span><i style={{ background: "#4f86dc" }} />toward more sleep, deeper, a calmer heart</span><span><i style={{ background: "#d9822b" }} />the other way</span></div>
    </section>
  );
}

function Opened({ ns, evs, cell, w }: { ns: Night[]; evs: Evening[]; cell: Cell; w: number }) {
  const f = FACTORS.find((x) => x.id === cell.factor)!, o = OUTCOMES.find((x) => x.id === cell.outcome)!;
  const pts = ns.flatMap((n, i) => { const v = o.of(n, evs[i]); return v == null ? [] : [{ v, has: f.has(n, evs[i]) }]; });
  if (cell.sure === "too few" || pts.length < 2) return null;
  const vs = pts.map((p) => p.v), lo = Math.min(...vs), hi = Math.max(...vs), span = hi - lo || 1;
  const X = (v: number) => 20 + ((v - lo) / span) * (w - 40), fmtV = (v: number) => (o.unit === "clock" ? clock(atMinute("2026-01-01", 0) + v * MIN) : o.unit === "min" ? `${Math.round(v)}m` : (Math.round(v * 10) / 10).toString());
  const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length, mW = mean(pts.filter((p) => p.has).map((p) => p.v)), mWo = mean(pts.filter((p) => !p.has).map((p) => p.v));
  const unit = o.unit === "min" ? " min" : o.unit === "bpm" ? " bpm" : o.unit === "ms" ? " ms" : o.unit === "/10" ? " points" : "";
  const d = cell.diff!, words = o.unit === "clock" ? `${Math.round(Math.abs(d))} min ${d > 0 ? "later" : "earlier"}` : `${sgn(d, o.unit === "min" ? 0 : 1)}${unit}`;
  return (
    <div className="sl-open" data-factor={cell.factor} data-outcome={cell.outcome}>
      <span className="cmp-k">Opened · {f.name} → {o.name}</span>
      <svg width={w} height={150} viewBox={`0 0 ${w} 150`} role="img" aria-label={`${o.name} on each night with and without: ${f.name.toLowerCase()}`}>
        {[["with", 40, "var(--i-ink)", true], ["without", 100, "var(--i-dim)", false]].map(([name, y, col, has]) => <g key={name as string}>
          <text x={4} y={(y as number) - 20} className="sl-tag" style={{ fill: col as string }}>{name} · {pts.filter((p) => p.has === has).length} nights</text>
          {pts.filter((p) => p.has === has).map((p, i) => <circle key={i} cx={X(p.v)} cy={(y as number) + ((i * 7) % 5 - 2) * 4} r={4} fill={col as string} fillOpacity=".8" stroke="var(--i-panel)" strokeWidth="1.2" />)}
          <line x1={X(has ? mW : mWo)} x2={X(has ? mW : mWo)} y1={(y as number) - 14} y2={(y as number) + 14} stroke="var(--i-ink)" strokeWidth="2.5" />
        </g>)}
        <text x={20} y={142} className="he-t">{fmtV(lo)}</text><text x={w - 20} y={142} textAnchor="end" className="he-t">{fmtV(hi)}</text>
      </svg>
      <p className="sl-open-v"><b>{words}</b> on nights with it · {cell.sure}{cell.p != null ? ` (p ${cell.p < 0.001 ? "<0.001" : cell.p.toFixed(3)})` : ""}</p>
      <p className="sl-note">Every night is a dot, so you can see what the average hides. Nights with one thing often have others too (drinks, weekends, late bedtimes) — read the rows together.</p>
    </div>
  );
}
