/**
 * Insights → At a glance (the approved desktop prototype v2, phase 1). Left: your week in plain words
 * and day by day. Right: every measure with its sparkline, this week, your usual week and the
 * difference. Numbers from lib/glance; this file only draws.
 */

import { useMemo, type ReactNode } from "react";
import { useStore } from "../lib/store";
import { dayTone, glance, glanceDays, glanceSpan, weekDays, type GlanceDay, type MeasureStat } from "../lib/glance";
import type { Report } from "../lib/findings";
import { dayLabel, atMinute, localDay } from "../lib/time";

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const fmt = (m: MeasureStat, v: number) => (m.dec === 0 ? Math.round(v).toLocaleString("en-GB") : v.toFixed(1));
const unitOf = (m: MeasureStat) => (m.unit === "/10" || m.unit === "/week" ? m.unit : ` ${m.unit}`);
const noon = (day: string) => atMinute(day, 12 * 60);

export function useGlance(now: number, trendDays: number) {
  const entries = useStore((s) => s.entries), workouts = useStore((s) => s.workouts), settings = useStore((s) => s.settings);
  const today = localDay(now);
  return useMemo(() => {
    const span = glanceSpan(today, trendDays);
    const days = glanceDays(entries, workouts, settings, span.from, span.to);
    return { today, days, stats: glance(days, today, trendDays), week: weekDays(days, today) };
  }, [entries, workouts, settings, today, trendDays]);
}

export function Glance({ now, trendDays, report }: { now: number; trendDays: number; report: Report }) {
  const { today, stats, week } = useGlance(now, trendDays);
  const shown = stats.filter((m) => m.week != null || m.trend.some((v) => v != null));
  if (!shown.length) return null;
  return (
    <div className="gl" id="ins-glance">
      <WeekCard stats={shown} week={week} today={today} report={report} />
      <Vitals stats={shown} trendDays={trendDays} />
    </div>
  );
}

/* ------------------------------------------------------------------ your week, in plain words */

function WeekCard({ stats, week, today, report }: { stats: MeasureStat[]; week: GlanceDay[]; today: string; report: Report }) {
  const judged = stats.filter((m) => m.state === "ok" || m.state === "hi" || m.state === "lo");
  const inN = judged.filter((m) => m.state === "ok").length, hiN = judged.filter((m) => m.state === "hi").length, loN = judged.filter((m) => m.state === "lo").length;
  const building = stats.filter((m) => m.state === "building");
  const M = Object.fromEntries(stats.map((m) => [m.k, m])) as Partial<Record<MeasureStat["k"], MeasureStat>>;
  const bul: { ic: string; tone: string; text: ReactNode }[] = [];
  const feel = [M.mood, M.energy, M.stress].filter((m): m is MeasureStat => m?.week != null);
  if (feel.length) {
    const off = feel.filter((m) => m.state === "hi" || m.state === "lo");
    bul.push({ ic: "◐", tone: "mind", text: <>{feel.map((m, i) => <span key={m.k}>{i ? ", " : ""}{m.name.toLowerCase().replace(/^./, (c) => (i ? c : c.toUpperCase()))} <b>{fmt(m, m.week!)}</b></span>)} — {off.length ? off.map((m) => `${m.name.toLowerCase()} ${m.state === "hi" ? "higher" : "lower"} than a usual week`).join(", ") + "." : feel.some((m) => m.state === "building") ? "your usual is still being learned." : "a typical week for you."}</> });
  } else bul.push({ ic: "◐", tone: "mind", text: <>No check-ins this week yet — how you feel is what everything else gets compared with.</> });
  if (M.sleep?.week != null) bul.push({ ic: "☾", tone: "sleep", text: <>You rated your sleep <b>{fmt(M.sleep, M.sleep.week)}</b>/10 on average{M.sleep.usualWeek ? <> (a usual week {fmt(M.sleep, M.sleep.usualWeek.p10)}–{fmt(M.sleep, M.sleep.usualWeek.p90)})</> : null}.</> });
  const biggest = [...judged].filter((m) => m.state !== "ok").sort((a, b) => Math.abs(b.delta! / (b.usualWeek!.p90 - b.usualWeek!.p10 || 1)) - Math.abs(a.delta! / (a.usualWeek!.p90 - a.usualWeek!.p10 || 1)))[0];
  if (biggest) bul.push({ ic: "!", tone: biggest.better == null ? "neutral" : biggest.better ? "good" : "warn", text: <>Biggest change: <b>{biggest.name.toLowerCase()}</b> {biggest.state === "hi" ? "up" : "down"} to {fmt(biggest, biggest.week!)}{unitOf(biggest)} (a usual week {fmt(biggest, biggest.usualWeek!.p10)}–{fmt(biggest, biggest.usualWeek!.p90)}).</> });
  const link = report.found.find((f) => f.area === "feel" || f.area === "caffeine" || f.area === "stack") ?? report.found[0];
  if (link) bul.push({ ic: "↗", tone: "link", text: <>Clearest finding: <b>{link.title}</b> <span className="gl-dim">({link.sure})</span></> });
  if (building.length) bul.push({ ic: "…", tone: "neutral", text: <>Still learning your usual for {building.map((m) => m.name.toLowerCase()).join(", ")} — it takes 3 weeks of logging.</> });
  const from = week[0]?.day, to = week[week.length - 1]?.day;
  return (
    <section className="gp gl-week" aria-label="Your week">
      <header className="gp-h"><div><span className="gp-k">At a glance · last 7 days</span><h2>Your week, in plain words</h2></div>
        {from && <span className="gp-meta">{dayLabel(noon(from))} – {dayLabel(noon(to!))}</span>}</header>
      {judged.length > 0 && <div className="gl-in">
        <div className="gl-big">{inN}<small>of {judged.length} measures in your usual range</small></div>
        <div className="gl-stack" aria-hidden="true"><span style={{ flex: inN }} className="t" />{hiN > 0 && <span style={{ flex: hiN }} className="h" />}{loN > 0 && <span style={{ flex: loN }} className="l" />}</div>
        <div className="gp-f"><span className="lgd"><i className="t" />{inN} typical</span><span className="lgd"><i className="h" />{hiN} higher</span><span className="lgd"><i className="l" />{loN} lower</span></div>
      </div>}
      <ul className="gl-bul">{bul.map((b, i) => <li key={i}><span className={`ic ${b.tone}`}>{b.ic}</span><span>{b.text}</span></li>)}</ul>
      <DayStrip stats={stats} week={week} today={today} />
    </section>
  );
}

function DayStrip({ stats, week, today }: { stats: MeasureStat[]; week: GlanceDay[]; today: string }) {
  const rows = (["mood", "energy", "stress", "sleep", "kcal"] as const).map((k) => stats.find((m) => m.k === k)).filter((m): m is MeasureStat => !!m && week.some((d) => d[m.k] != null));
  if (!rows.length) return null;
  const ev = (d: GlanceDay) => [d.trained && "●", d.lateCaffeine && "✕", (d.drinks ?? 0) > 0 && "◆", d.note && "✎"].filter(Boolean).join(" ");
  const short = (m: MeasureStat, v: number) => (m.k === "kcal" ? `${(v / 1000).toFixed(1)}k` : fmt(m, v));
  return (
    <div className="gl-strip">
      <div className="tscroll"><table className="gl-days" aria-label="This week, day by day">
        <thead><tr><th />{week.map((d) => { const dt = new Date(noon(d.day)); return <th key={d.day} className="n">{d.day === today ? "Today" : WD[dt.getDay()]}<small>{dt.getDate()}</small></th>; })}</tr></thead>
        <tbody>
          {rows.map((m) => <tr key={m.k}><th>{m.k === "sleep" ? "Sleep" : m.k === "kcal" ? "kcal" : m.name}</th>{week.map((d) => {
            const v = d[m.k], tone = dayTone(m, v);
            return <td key={d.day} className={`n${tone ? ` out ${tone}` : ""}`} title={v == null ? undefined : `${dayLabel(noon(d.day))}: ${m.name} ${fmt(m, v)}${unitOf(m)}${m.day ? ` · a usual day ${fmt(m, m.day.p10)}–${fmt(m, m.day.p90)}` : ""}${d.day === today && m.partialToday ? " (so far)" : ""}`}>{v == null ? <span className="gl-dim">–</span> : short(m, v)}</td>;
          })}</tr>)}
          <tr className="ev"><th>Events</th>{week.map((d) => <td key={d.day} className="n">{ev(d) || <span className="gl-dim">·</span>}</td>)}</tr>
        </tbody>
      </table></div>
      <div className="gp-f"><span>● trained</span><span>✕ caffeine after 14:00</span><span>◆ drinks</span><span>✎ a note</span><span className="lgd"><i className="dot better" />/<i className="dot worse" /> outside a usual day</span></div>
    </div>
  );
}

/* ------------------------------------------------------------------ vitals and measures */

function Spark({ m }: { m: MeasureStat }) {
  const w = 240, h = 22, pad = 3, vals = m.trend, pts = vals.map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => p[1] != null);
  if (pts.length < 2) return <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true" />;
  const ys = pts.map((p) => p[1]), lo = Math.min(m.day?.p10 ?? Infinity, ...ys), hi = Math.max(m.day?.p90 ?? -Infinity, ...ys);
  const x = (i: number) => pad + (i / Math.max(1, vals.length - 1)) * (w - pad * 2 - 3), y = (v: number) => pad + (1 - (v - lo) / (hi - lo || 1)) * (h - pad * 2);
  const path = (ps: (readonly [number, number])[]) => ps.map((p, k) => `${k ? "L" : "M"}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join("");
  const wk = pts.filter((p) => p[0] >= vals.length - 7), last = pts[pts.length - 1];
  const tone = m.state === "hi" || m.state === "lo" ? (m.better === false ? "worse" : "now") : "now";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true" className={`spark ${tone}`}>
      {m.day && <rect x="0" y={y(m.day.p90)} width={w} height={Math.max(1.5, y(m.day.p10) - y(m.day.p90))} className="band" />}
      <path d={path(pts)} className="before" />
      {wk.length > 1 && <path d={path(wk)} className="week" />}
      <circle cx={x(last[0])} cy={y(last[1])} r="2.6" className="end" />
    </svg>
  );
}

function Vitals({ stats, trendDays }: { stats: MeasureStat[]; trendDays: number }) {
  const groups = ["Mind", "Sleep", "Body & intake"] as const;
  const judged = stats.filter((m) => m.state === "ok" || m.state === "hi" || m.state === "lo"), out = judged.filter((m) => m.state !== "ok");
  const delta = (m: MeasureStat) => {
    if (m.delta == null) return "";
    const mag = fmt(m, Math.abs(m.delta));
    return (/^0(\.0)?$/.test(mag) ? "±" : m.delta >= 0 ? "+" : "−") + mag;
  };
  return (
    <section className="gp gl-vitals" aria-label="Vitals and measures">
      <header className="gp-h"><div><span className="gp-k">At a glance · vs your usual</span><h2>Vitals and measures</h2>
        {judged.length > 0 && <p className="gp-ans"><b>{judged.length - out.length} of {judged.length}</b> in your usual range this week.{out.length ? ` Outside it: ${out.map((m) => `${m.name.toLowerCase()} ${m.state === "hi" ? "higher" : "lower"}`).join(", ")}.` : ""}</p>}</div>
        <span className="gp-meta">7-day average vs your usual week<br />(the 8 weeks before)</span></header>
      <div className="tscroll"><table className="gl-vt">
        <thead><tr><th>Measure</th><th>Daily, last {trendDays === 84 ? "12 weeks" : `${trendDays} days`} · a usual day shaded</th><th className="n">This week</th><th className="n">Usual week</th><th className="n">vs usual</th><th>Status</th></tr></thead>
        <tbody>{groups.map((g) => {
          const list = stats.filter((m) => m.group === g);
          if (!list.length) return null;
          return [<tr key={g} className="grp"><td colSpan={6}>{g}</td></tr>, ...list.map((m) => {
            const dcls = m.state === "hi" || m.state === "lo" ? (m.better == null ? "flat" : m.better ? "good" : "bad") : "flat";
            const tip = `${m.name}${m.why ? ` — ${m.why}` : ""}\nThis week: ${m.week != null ? fmt(m, m.week) + unitOf(m) : "not enough days"} (${m.weekDays} of 7 days)\n${m.usualWeek ? `A usual week: ${fmt(m, m.usualWeek.p10)}–${fmt(m, m.usualWeek.p90)}` : "Usual week: needs 3 weeks of history"}${m.day ? `\nA usual day: ${fmt(m, m.day.p10)}–${fmt(m, m.day.p90)}` : ""}`;
            return (
              <tr key={m.k} title={tip}>
                <td className="nm">{m.name}</td>
                <td className="sp"><Spark m={m} /></td>
                <td className="wv">{m.week != null ? <>{fmt(m, m.week)}<small>{m.unit}</small></> : <span className="gl-dim">–</span>}</td>
                <td className="n gl-dim2">{m.usualWeek ? `${fmt(m, m.usualWeek.p10)}–${fmt(m, m.usualWeek.p90)}` : ""}</td>
                <td className={`n dlt ${dcls}`}>{delta(m)}</td>
                <td>{m.state === "ok" ? <span className="st typ">Typical</span> : m.state === "hi" || m.state === "lo" ? <span className={`st ${m.better == null ? "neutral" : m.better ? "better" : "worse"}`}>{m.state === "hi" ? "▲ Higher" : "▼ Lower"}</span> : m.state === "building" ? <span className="st typ">Learning</span> : <span className="gl-dim">few days</span>}</td>
              </tr>
            );
          })];
        })}</tbody>
      </table></div>
      <footer className="gp-f"><span className="lgd"><i className="band" />a usual day (middle 80%)</span><span className="lgd"><i className="ln now" />last 7 days</span><span className="lgd"><i className="ln before" />before</span><span className="lgd"><i className="dot better" />better</span><span className="lgd"><i className="dot worse" />worse</span><span className="lgd"><i className="dot neutral" />neither</span><span className="gl-dim">Ring or watch data (HRV, resting heart rate, sleep stages) joins this table once one is connected.</span></footer>
    </section>
  );
}
