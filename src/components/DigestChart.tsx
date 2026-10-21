/**
 * The morning read's charts (PLAN 150; owner, 21 Oct: "too much info w no visual"): an item's measure over the last 14
 * days, from his own data. Amounts (protein, kcal, caffeine…) are bars from zero, with his goal as a dashed line when he
 * has one; levels (ratings, weight) are a line with a dot a day. Today is drawn lighter — it isn't over. Tap a day for
 * its value. A tiny one sits beside the title on the folded card.
 */

import { useState } from "react";
import { MEASURES, measureValue, measureWords } from "../lib/ai/digestchart";
import type { DigestMeasure } from "../lib/ai/tasks";
import { addDays, dayLabel, atMinute } from "../lib/time";

const TONE: Record<DigestMeasure, string> = { protein: "--pro", kcal: "--kcal", caffeine: "--caf", alcohol: "--alc", weight: "--wt", lifting: "--gym",
  sleep: "--supp", mood: "--mood", energy: "--mood", focus: "--mood", stress: "--mood" };
const tone = (k: DigestMeasure) => ({ "--dc": `var(${TONE[k]})` }) as React.CSSProperties;

/** The scale: amounts from zero (and up to the goal); levels around their own range, a little padded. */
function scale(k: DigestMeasure, vals: (number | null)[], goal?: number) {
  const ys = vals.filter((v): v is number => v != null);
  if (MEASURES[k].amount) return { lo: 0, hi: Math.max(1, ...ys, goal ?? 0) };
  const lo = Math.min(...ys), hi = Math.max(...ys), pad = Math.max((hi - lo) * 0.15, MEASURES[k].unit === "/10" ? 0.5 : 0.3);
  return { lo: lo - pad, hi: hi + pad };
}

/** 52 × 18, beside a folded title: the shape only. */
export function MiniChart({ k, vals }: { k: DigestMeasure; vals: (number | null)[] }) {
  const w = 52, h = 18, n = vals.length, pts = vals.map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => p[1] != null);
  if (pts.length < 2) return null;
  const { lo, hi } = scale(k, vals), y = (v: number) => h - 1 - ((v - lo) / (hi - lo || 1)) * (h - 2), cw = w / n;
  return (
    <svg className="dc-mini" width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={tone(k)} aria-hidden="true">
      {MEASURES[k].amount
        ? pts.map(([i, v]) => <rect key={i} x={i * cw + 0.5} y={y(v)} width={Math.max(1, cw - 1.2)} height={Math.max(1, h - 1 - y(v))} rx="1" opacity={i === n - 1 ? 0.45 : 1} />)
        : <polyline points={pts.map(([i, v]) => `${(i * cw + cw / 2).toFixed(1)},${y(v).toFixed(1)}`).join(" ")} />}
    </svg>
  );
}

/** The item's chart, full width. */
export function DigestChart({ k, vals, today, goal }: { k: DigestMeasure; vals: (number | null)[]; today: string; goal?: number }) {
  const [pick, setPick] = useState<number | null>(null);
  const m = MEASURES[k], n = vals.length, known = vals.filter((v) => v != null).length;
  const head = <p className="dc-head"><b>{m.name}</b> · last {n} days{goal != null && m.amount && <> · <span className="dc-g">goal {measureValue(k, goal)}</span></>}</p>;
  if (known < 2) return <div className="dc" style={tone(k)}>{head}<p className="dc-words">Not enough logged yet to draw — {known ? "one day" : "no days"} in the last {n}.</p></div>;
  const { lo, hi } = scale(k, vals, goal), pct = (v: number) => ((v - lo) / (hi - lo || 1)) * 100;
  const day = (i: number) => addDays(today, i - (n - 1)), label = (i: number) => (i === n - 1 ? "Today" : dayLabel(atMinute(day(i), 12 * 60)));
  const p = pick != null ? vals[pick] : null;
  const line = m.amount ? "" : vals.map((v, i) => (v == null ? null : `${(((i + 0.5) / n) * 100).toFixed(2)},${(100 - pct(v)).toFixed(2)}`)).filter(Boolean).join(" ");
  return (
    <div className="dc" style={tone(k)}>
      {head}
      <div className={`dc-plot${m.amount ? " bars" : " level"}`} role="img" aria-label={`${m.name}, last ${n} days: ${measureWords(k, vals)}`}>
        {goal != null && m.amount && <i className="dc-goal" style={{ bottom: `${pct(goal)}%` }} />}
        {line && <svg className="dc-line" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline points={line} /></svg>}
        {vals.map((v, i) => (
          <button type="button" key={i} className="dc-day" data-today={i === n - 1 || undefined} data-pick={pick === i || undefined}
            aria-label={`${label(i)}: ${v == null ? "nothing logged" : measureValue(k, v)}`} onClick={() => setPick(pick === i ? null : i)}>
            {v != null && (m.amount ? <i className="dc-bar" style={{ height: `max(2px, ${pct(v)}%)` }} /> : <i className="dc-dot" style={{ bottom: `${pct(v)}%` }} />)}
          </button>
        ))}
      </div>
      <p className="dc-ends" aria-hidden="true"><span>{label(0)}</span><span>Today</span></p>
      <p className="dc-words">{pick != null ? <><b>{label(pick)}</b> · {p == null ? "nothing logged" : `${measureValue(k, p)}${pick === n - 1 && m.amount ? " so far" : ""}`}</> : measureWords(k, vals)}</p>
    </div>
  );
}
