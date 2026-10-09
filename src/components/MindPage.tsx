/**
 * Insights → Mind, the band's side (PLAN 58; owner, 9 Oct: "yea lets do it" to "C, with A's calendar under it"):
 * this morning from the band in one line, what goes with how you felt that day (the Sleep and Heart pages' grid),
 * a feeling against hours asleep, and the month as a calendar against your usual mood. Numbers from lib/mind and
 * lib/sleep (tested with planted effects); this file only draws. Words say "goes with", never "because".
 */

import { useEffect, useMemo, useState, type MouseEvent, type PointerEvent } from "react";
import type { BandData } from "../lib/band";
import { loadBandBefore } from "../lib/band-client";
import type { GlanceDay } from "../lib/glance";
import type { Lanes } from "../lib/insights";
import { FEELING_NAMES, mindFactors, mindOutcomes, moodMonth, sleepSlope, thisMorning, type CalDay, type Feeling, type MorningLink } from "../lib/mind";
import { goesWith, type Evening, type Night } from "../lib/sleep";
import { atMinute, dayLabel, localDay, DAY } from "../lib/time";
import type { Entry } from "../lib/types";
import { GoesWith, type GridCopy } from "./Sleep";
import { useNights } from "./useNights";
import { useWidth } from "./useWidth";

/** The feelings' colours (lib/feelgraph's, dataviz-checked on the dark panel). */
const COL: Record<Feeling, string> = { mood: "#3987e5", energy: "#c98500", stress: "#d55181", focus: "#93a0a4" };
/** Mood against your usual: red below, blue above, grey about usual (each side checked as a ramp on the panel, 9 Oct). */
const STEP: Record<number, string> = { [-3]: "#f0806e", [-2]: "#c06a5c", [-1]: "#93524a", 0: "#273035", 1: "#46699f", 2: "#5584d0", 3: "#7aa3ea" };
const MIND_COPY: GridCopy = {
  title: "What goes with how you felt that day", what: "days", minNights: 10, toward: "toward a better mood, more energy and focus, less stress",
  sub: "Each cell: days with the thing against days without — last night, this morning, the evening before, the day. Filled: clear · faint: likely · empty: not clear yet. Goes with, not proof of cause.",
};
const pad = (n: number) => String(n).padStart(2, "0");
const sgn = (v: number, d = 1) => { const t = Math.abs(v).toFixed(d); return Number(t) === 0 ? `±${t}` : `${v > 0 ? "+" : "−"}${t}`; };
const dur = (min: number) => { const t = Math.round(min); return `${Math.floor(t / 60)} h ${pad(t % 60)}`; };

export function MindPage({ data, band, now, entries, halfLifeMin, days, period }: { data: Lanes; band: BandData | null; now: number; entries: Entry[]; halfLifeMin: number; days: GlanceDay[]; period: number }) {
  const span = Math.max(30, period), today = localDay(now);
  useEffect(() => { if (band) void loadBandBefore(now - (span + 2) * DAY); }, [band, now, span]);
  const { ns, evs } = useNights(band, data, entries, halfLifeMin, now, span);
  const byDay = useMemo(() => new Map(days.map((d) => [d.day, d])), [days]);
  // The grid and the slope learn from finished days: today's feelings so far are only its morning.
  const doneDays = useMemo(() => new Map(days.filter((d) => d.day < today).map((d) => [d.day, d])), [days, today]);
  const outcomes = useMemo(() => mindOutcomes(doneDays), [doneDays]);
  const factors = useMemo(() => mindFactors(ns, (d) => byDay.get(d)?.trained ?? false), [ns, byDay]);
  const cells = useMemo(() => goesWith(ns, evs, { factors, outcomes }), [ns, evs, factors, outcomes]);
  const asleepOn = useMemo(() => { const m = new Map(ns.map((n) => [n.day, n.asleep])); return (d: string) => m.get(d) ?? null; }, [ns]);
  const month = useMemo(() => moodMonth(days, span, asleepOn), [days, span, asleepOn]);
  const [ref, w] = useWidth<HTMLDivElement>();
  const wide = w >= 980, haveNights = ns.length > 0;
  const last = ns.at(-1), lastIsToday = last?.day === today, li = ns.length - 1;
  return (
    <div className="mp" data-sec="mind" ref={ref} data-nights={ns.length}>
      {haveNights && <ThisMorning n={lastIsToday ? last! : null} e={lastIsToday ? evs[li] : null} links={lastIsToday ? thisMorning(last!, evs[li], factors, cells) : []} enough={ns.length >= MIND_COPY.minNights} ns={ns} />}
      {haveNights && <div className={`mp-two${wide ? " wide" : ""}`}>
        <GoesWith ns={ns} evs={evs} wide={false} w={wide ? Math.floor((w - 12) * 0.56) : w} outcomes={outcomes} factors={factors} narrow={outcomes} copy={MIND_COPY} />
        <SleepAgainst ns={ns} byDay={doneDays} w={wide ? w - 12 - Math.floor((w - 12) * 0.56) : w} />
      </div>}
      {month.days.some((d) => d.mood != null) && <Month month={month} today={today} w={w} band={haveNights} />}
    </div>
  );
}

function ThisMorning({ n, e, links, enough, ns }: { n: Night | null; e: Evening | null; links: MorningLink[]; enough: boolean; ns: Night[] }) {
  const hrv = ns.map((x) => x.hrv).filter((v): v is number => v != null).sort((a, b) => a - b), q1 = hrv.length >= 8 ? hrv[Math.floor((hrv.length - 1) * 0.25)] : null;
  // One per feeling — the surest — so the line doesn't say "energy" twice.
  const seen = new Set<string>(), per = links.filter((l) => (seen.has(l.cell.outcome) ? false : (seen.add(l.cell.outcome), true)));
  return (
    <section className="sl-p mp-morning" aria-label="This morning, from your band">
      <span className="cmp-k">This morning · from your band</span>
      {!n || !e ? <p className="mp-big">No night from your band for last night yet — it shows here once it syncs.</p> : <>
        <p className="mp-big">Last night: {dur(n.asleep)} asleep{n.hrv != null ? `, HRV ${Math.round(n.hrv)} ms${q1 != null && n.hrv <= q1 ? " (your lowest quarter)" : ""}` : ""}{e.drinks.length ? ", after drinks" : ""}.</p>
        <p className="mp-small">{!enough ? "Once there are 10 nights with the band, this says what mornings like this have gone with."
          : per.length ? <>Mornings like this have gone with {per.map((l, i) => <span key={l.cell.outcome}>{i ? ", " : ""}<b style={{ color: COL[l.cell.outcome as Feeling] }}>{FEELING_NAMES.find(([k]) => k === l.cell.outcome)![1].toLowerCase()} {sgn(l.cell.diff!)}</b></span>)} through the day ({per.map((l) => l.factor.name.toLowerCase()).filter((v, i, a) => a.indexOf(v) === i).join("; ")}) — what your days so far show, not a forecast.</>
          : "Nothing in your days so far goes clearly with mornings like this."}</p>
      </>}
    </section>
  );
}

function SleepAgainst({ ns, byDay, w }: { ns: Night[]; byDay: Map<string, GlanceDay>; w: number }) {
  const [k, setK] = useState<Feeling>("energy");
  const s = useMemo(() => sleepSlope(ns, (n) => byDay.get(n.day)?.[k] ?? null), [ns, byDay, k]);
  const name = FEELING_NAMES.find(([x]) => x === k)![1], cw = w - 2, H = 230, L = 34, R = 14, T = 14, B = 24;
  const xs = s.pts.map((p) => p[0]), x0 = Math.min(5, ...xs.map((x) => Math.floor(x))), x1 = Math.max(9, ...xs.map((x) => Math.ceil(x)));
  const X = (h: number) => L + ((h - x0) / (x1 - x0)) * (cw - L - R), Y = (v: number) => T + (1 - (v - 1) / 9) * (H - T - B);
  const mx = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0, my = s.pts.length ? s.pts.reduce((a, p) => a + p[1], 0) / s.pts.length : 0;
  const words = s.sure === "too few" ? `Needs 10 days with a night from the band and a check-in — ${s.pts.length} so far.`
    : s.sure === "not clear" ? `No clear link yet: ${sgn(s.slope!)} ${name.toLowerCase()} per hour asleep, which chance alone could give.`
      : `${name} goes with ${sgn(s.slope!)} per hour asleep the night before. How sure: ${s.sure}.`;
  return (
    <section className="sl-p mp-sleep" aria-label={`${name} against hours asleep the night before`}>
      <div className="mp-head"><span className="cmp-k">Last night's sleep → that day</span>
        <div className="iseg" role="group" aria-label="Feeling">{FEELING_NAMES.map(([x, n]) => <button key={x} type="button" aria-pressed={k === x} onClick={() => setK(x)}>{n}</button>)}</div></div>
      {s.pts.length > 0 && <svg width={cw} height={H} viewBox={`0 0 ${cw} ${H}`} role="img" aria-label={`Each day a dot: hours asleep the night before against the ${name.toLowerCase()} you gave that day, with the fitted line`}>
        {[2, 4, 6, 8, 10].map((v) => <g key={v}><line x1={L} x2={cw - R} y1={Y(v)} y2={Y(v)} className="he-grid" /><text x={L - 6} y={Y(v) + 3} textAnchor="end" className="hp-t">{v}</text></g>)}
        {Array.from({ length: x1 - x0 + 1 }, (_, i) => x0 + i).map((h) => <text key={h} x={X(h)} y={H - 6} textAnchor={h === x0 ? "start" : h === x1 ? "end" : "middle"} className="hp-t">{h} h</text>)}
        {s.pts.map((p, i) => <circle key={i} cx={X(p[0])} cy={Y(p[1])} r={3.6} fill={COL[k]} fillOpacity=".85" stroke="var(--i-panel)" strokeWidth="1.2"><title>{`${dur(p[0] * 60)} asleep · ${name.toLowerCase()} ${p[1].toFixed(1)}`}</title></circle>)}
        {s.slope != null && <line x1={X(x0 + 0.2)} x2={X(x1 - 0.2)} y1={Y(my + s.slope * (x0 + 0.2 - mx))} y2={Y(my + s.slope * (x1 - 0.2 - mx))} stroke="var(--i-ink)" strokeDasharray="5 4" strokeWidth="1.3" />}
      </svg>}
      <p className="he-words" data-sure={s.sure}>{words}</p>
      <p className="sl-note">Each dot: a day — hours asleep the night before, and the average {name.toLowerCase()} you gave that day. Four feelings to pick from, so it takes more to say "clear".</p>
    </section>
  );
}

function Month({ month, today, w, band }: { month: ReturnType<typeof moodMonth>; today: string; w: number; band: boolean }) {
  const [hov, setHov] = useState<CalDay | null>(null);
  const first = month.days[0].day, lead = (new Date(atMinute(first, 720)).getDay() + 6) % 7, rows = Math.ceil((lead + month.days.length) / 7);
  const phone = w < 640, calW = Math.min(w - 2, 640), gap = 4, cell = (calW - 28 - 6 * gap) / 7, ch = phone ? cell : Math.min(cell * 0.78, 64), H = 30 + rows * (ch + gap);
  const pos = (i: number) => ({ x: 14 + ((lead + i) % 7) * (cell + gap), y: 30 + Math.floor((lead + i) / 7) * (ch + gap) });
  const pick = (e: PointerEvent<SVGSVGElement> | MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    setHov(month.days.find((_, i) => { const p = pos(i); return x >= p.x && x < p.x + cell && y >= p.y && y < p.y + ch; }) ?? null);
  };
  const dark = (st: number | null) => st != null && Math.abs(st) >= 2;
  return (
    <section className="sl-p mp-month" aria-label="Your mood each day against your usual">
      <span className="cmp-k">The last {month.days.length} days · mood against your usual{month.usual != null ? ` (${month.usual.toFixed(1)})` : ""}</span>
      <div className="mp-cal">
        <svg width={calW} height={H} viewBox={`0 0 ${calW} ${H}`} role="img" aria-label="A calendar of the last weeks: each day coloured by your mood against your usual, red below, blue above; marks for drinks the evening before, a short night and training" onPointerMove={pick} onPointerLeave={() => setHov(null)} onClick={pick}>
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => <text key={d} x={14 + i * (cell + gap) + cell / 2} y={16} textAnchor="middle" className="hp-t">{d}</text>)}
          {month.days.map((d, i) => {
            const p = pos(i), date = +d.day.slice(8), mx = p.x + cell / 2 - 9, my = p.y + ch - (phone ? 7 : 9);
            return <g key={d.day} data-day={d.day} data-step={d.step ?? ""}>
              <rect x={p.x} y={p.y} width={cell} height={ch} rx="5" fill={d.step == null ? "none" : STEP[d.step]} stroke={d.step == null ? "var(--i-line)" : "none"} />
              {d.day === today && <rect x={p.x - 1.5} y={p.y - 1.5} width={cell + 3} height={ch + 3} rx="6" fill="none" stroke="var(--i-ink)" strokeWidth="1.5" />}
              <text x={p.x + 5} y={p.y + 12} className="mp-date">{date}</text>
              {d.mood != null && <text x={p.x + cell / 2} y={p.y + ch / 2 + (phone ? 2 : 4)} textAnchor="middle" className="mp-v" style={{ fill: dark(d.step) ? "#0d1012" : "var(--i-ink)" }}>{d.mood.toFixed(1)}</text>}
              {d.drinksBefore && <path d={`M${mx} ${my - 3.5}l3.5 3.5l-3.5 3.5l-3.5 -3.5Z`} fill="var(--alc)" />}
              {d.short && <circle cx={mx + 9} cy={my} r={3} fill="#7fadf0" />}
              {d.trained && <rect x={mx + 15} y={my - 2} width={6} height={4} fill="var(--gym)" />}
            </g>;
          })}
        </svg>
        <div className="mp-cal-side">
          <div className="mp-scale">{[-3, -2, -1, 0, 1, 2, 3].map((st) => <i key={st} style={{ background: STEP[st] }} />)}</div>
          <div className="mp-scale-k"><span>lower</span><span>about usual</span><span>higher</span></div>
          <div className="hp-key mp-key"><span><i className="dia" />drinks the evening before</span>{band && <span><i className="dot" style={{ background: "#7fadf0" }} />under 6 h 30 asleep</span>}<span><i style={{ background: "var(--gym)" }} />trained</span></div>
          <p className="sl-note mp-hov">{hov ? <><b>{dayLabel(atMinute(hov.day, 720))}</b> · {hov.mood != null ? `mood ${hov.mood.toFixed(1)}${hov.dev != null ? ` (${sgn(hov.dev)} vs usual)` : ""}` : "no check-in"}{hov.drinksBefore ? " · after drinks" : ""}{hov.short ? " · short night" : ""}{hov.trained ? " · trained" : ""}</>
            : <>Your usual: the middle of these days' moods. Tap a day for its numbers.</>}</p>
        </div>
      </div>
    </section>
  );
}
