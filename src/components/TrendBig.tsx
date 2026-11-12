/**
 * One trend, big (PLAN 215; owner, 12 Nov: "if i click on a square like asleep or hrv, can it make it bigger and bit more
 * detailed so i can see how my data changed during the time period and see at what. date what score it was"). Every day a
 * dot, green better than your usual and red worse (lib/trends toneOf), your usual as a band, the 7-day average; tap or
 * drag along it — or ‹ › — for any day's date and value against your usual. Only reads.
 */

import { useEffect, useRef, useState } from "react";
import type { Trend } from "../lib/trends";

const L = 40, R = 10, T = 12, B = 30;
const date = (day: string, wd = false) => new Date(`${day}T12:00:00`).toLocaleDateString("en-GB", { ...(wd ? { weekday: "short" } : {}), day: "numeric", month: "short" });

/** How far from your usual, in the measure's own words: minutes for sleep and bedtime, else its unit. */
function off(t: Trend, d: number, f: (v: number) => string): string {
  if (t.key === "asleep") return `${Math.round(Math.abs(d) * 60)} min`;
  if (t.key === "bed") return `${Math.round(Math.abs(d) * 60)} min`;
  return `${f(Math.abs(d))}${t.unit && !["/10", "a day", "/100"].includes(t.unit) ? ` ${t.unit}` : ""}`;
}

export function TrendBig({ t, n, ranges, onRange, f, onClose }: {
  t: Trend; n: number; ranges: Record<number, string>; onRange: (n: number) => void; f: (v: number) => string; onClose: () => void;
}) {
  const [pick, setPick] = useState<string>(t.days[t.days.length - 1].day);
  const [all, setAll] = useState(false);
  // a new range: stay on the picked day if it's still in, else the last
  const day = t.days.find((d) => d.day === pick) ?? t.days[t.days.length - 1];
  const at = t.days.indexOf(day);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && at > 0) setPick(t.days[at - 1].day);
      if (e.key === "ArrowRight" && at < t.days.length - 1) setPick(t.days[at + 1].day);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [at, t.days, onClose]);

  // drawn at about the size it's shown, so its labels stay readable on a phone
  const [W] = useState(() => (typeof window !== "undefined" && window.innerWidth < 600 ? Math.max(320, window.innerWidth - 32) : 640)), H = W < 600 ? 250 : 270;
  const pad = (t.hi - t.lo) * 0.08 || 1, lo = t.lo - pad, hi = t.hi + pad;
  const X = (i: number) => L + (i / Math.max(1, n - 1)) * (W - L - R), Y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const svg = useRef<SVGSVGElement | null>(null);
  const near = (clientX: number) => {
    const r = svg.current?.getBoundingClientRect();
    if (!r) return;
    const i = ((clientX - r.left) / r.width * W - L) / (W - L - R) * (n - 1);
    const best = t.days.reduce((a, d) => (Math.abs(d.i - i) < Math.abs(a.i - i) ? d : a), t.days[0]);
    setPick(best.day);
  };
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((q) => Math.round(q * (n - 1)));
  const startDay = (i: number) => { const d0 = t.days[0]; const dt = new Date(`${d0.day}T12:00:00`); dt.setDate(dt.getDate() + (i - d0.i)); return dt.toISOString().slice(0, 10); };
  const diff = day.v - t.usual.mid;
  const say = day.tone === "typical"
    ? `a usual day for you (your middle half: ${f(t.usual.lo)}–${f(t.usual.hi)})`
    : `${off(t, diff, f)} ${diff > 0 ? (t.key === "bed" ? "later" : "above") : (t.key === "bed" ? "earlier" : "below")} your usual ${f(t.usual.mid)} — ${day.tone === "better" ? "better" : "worse"}`;
  const count = { better: t.days.filter((d) => d.tone === "better").length, worse: t.days.filter((d) => d.tone === "worse").length };
  const sorted = [...t.days].sort((a, b) => a.v - b.v), best = t.better === -1 ? sorted[0] : sorted[sorted.length - 1], worst = t.better === -1 ? sorted[sorted.length - 1] : sorted[0];
  const list = [...t.days].reverse(), shown = all ? list : list.slice(0, 14);
  const last = t.avg[t.avg.length - 1];

  return (
    <>
      <div className="tb-bg" onClick={onClose} aria-hidden="true" />
      <section className="tb" role="dialog" aria-modal="true" aria-label={`${t.name}, big`} data-trend-big={t.key}>
        <header className="tb-h">
          <div><span className="tb-name">{t.name}</span><span className="tb-avg">{f(t.now)} <small>{t.unit ? `${t.unit} · ` : ""}7-day average</small></span></div>
          <button type="button" className="x" aria-label="Close" onClick={onClose}>✕</button>
        </header>
        <div className="tw-range" role="group" aria-label="Range">{Object.keys(ranges).map(Number).map((k) => <button key={k} type="button" aria-pressed={n === k} onClick={() => onRange(k)}>{ranges[k]}</button>)}</div>

        <div className={`tb-day ${day.tone}`} data-testid="trend-day" aria-live="polite">
          <button type="button" aria-label="Day before" disabled={at === 0} onClick={() => setPick(t.days[at - 1].day)}>‹</button>
          <div><small>{date(day.day, true)}</small><b>{f(day.v)}{t.unit && !["/10", "a day"].includes(t.unit) ? <small> {t.unit}</small> : t.unit === "/10" ? <small>/10</small> : null}</b><span>{say}</span></div>
          <button type="button" aria-label="Day after" disabled={at === t.days.length - 1} onClick={() => setPick(t.days[at + 1].day)}>›</button>
        </div>

        <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className="tb-svg" role="img" aria-label={`${t.name}, every day of the ${ranges[n].toLowerCase()}`}
          onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); near(e.clientX); }}
          onPointerMove={(e) => { if (e.buttons || e.pointerType === "mouse") near(e.clientX); }}>
          <rect x={L} width={W - L - R} y={Y(t.usual.hi)} height={Math.max(1, Y(t.usual.lo) - Y(t.usual.hi))} className="tb-band" />
          <line x1={L} x2={W - R} y1={Y(t.usual.mid)} y2={Y(t.usual.mid)} className="tb-mid" />
          {/* the scale's ends, and your usual in the middle (its band says the rest) */}
          {[t.lo, t.usual.mid, t.hi].map((v, k) => <text key={k} x={L - 6} y={Y(v) + 4} className={`tb-yl${k === 1 ? " mid" : ""}`}>{f(v)}</text>)}
          {ticks.map((i) => <text key={i} x={X(i)} y={H - 8} className="tb-xl" textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}>{date(startDay(i))}</text>)}
          <line x1={X(day.i)} x2={X(day.i)} y1={T} y2={H - B} className="tb-cur" />
          {t.days.map((d) => <circle key={d.day} cx={X(d.i)} cy={Y(d.v)} r={n > 120 ? 2.2 : 3.4} className={`tw-dot ${d.tone}`} />)}
          <polyline points={t.avg.map((a) => `${X(a.i).toFixed(1)},${Y(a.v).toFixed(1)}`).join(" ")} className="tw-avg" />
          <circle cx={X(last.i)} cy={Y(last.v)} r="4.5" className="tw-end" />
          <circle cx={X(day.i)} cy={Y(day.v)} r="7.5" className={`tb-pick ${day.tone}`} />
        </svg>
        <p className="tb-key"><span><i className="better" />{count.better} better than usual</span><span><i className="worse" />{count.worse} worse</span><span><i className="band" />your usual (middle half)</span><span><i className="avg" />7-day average</span></p>

        {t.better !== 0 && <div className="tb-bw">
          <button type="button" className="better" onClick={() => setPick(best.day)}><small>Best day</small><b>{f(best.v)}</b><span>{date(best.day, true)}</span></button>
          <button type="button" className="worse" onClick={() => setPick(worst.day)}><small>Worst day</small><b>{f(worst.v)}</b><span>{date(worst.day, true)}</span></button>
        </div>}

        <ul className="tb-list" aria-label="Day by day">
          {shown.map((d) => <li key={d.day}><button type="button" aria-pressed={d.day === day.day} onClick={() => setPick(d.day)}>
            <i className={d.tone} /><span>{date(d.day, true)}</span><b>{f(d.v)}</b></button></li>)}
        </ul>
        {list.length > 14 && <button type="button" className="linkish tb-all" onClick={() => setAll((v) => !v)}>{all ? "Fewer days" : `All ${list.length} days`}</button>}
      </section>
    </>
  );
}
