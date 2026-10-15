/**
 * The week read in the AI tab (PLAN 65; owner: "AI should look at data at eod, eow, eom, and make suggestions, summaries,
 * etc, even make graphs or like interesting notices"). The AI's title, summary, notices and next steps; the table and
 * every chart drawn from the app's own numbers (lib/review), in the heat view's colours (PLAN 105 B). This file only draws.
 */

import type { AiState } from "../lib/store";
import type { ReviewRow } from "../lib/review";
import { span } from "../lib/review";
import { shadeAttrs } from "../lib/shade";
import { Md } from "./Md";

type Review = NonNullable<AiState["reviews"]>[number];

const SHORT: Record<string, string> = { "Sleep rating": "Sleep", "Caffeine at bedtime": "Caffeine" };
const DAYS = ["M", "T", "W", "T", "F", "S", "S"];
/** A number small enough for a day's cell: 2,410 kcal → 2.4k. */
const cell = (r: ReviewRow, v: number | null) => (v == null ? "–" : r.unit === "kcal" ? `${(v / 1000).toFixed(1)}k` : v.toFixed(r.unit === "/10" || r.unit === "kg" || (r.k === "drinks" && v % 1) ? 1 : 0));
const full = (r: ReviewRow, v: number) => (r.unit === "kcal" ? `${Math.round(v).toLocaleString("en-GB")} kcal` : `${v.toFixed(r.dec)}${r.unit.startsWith("/") ? r.unit : ` ${r.unit}`}`);
const toneOf = (r: ReviewRow) => (r.state !== "hi" && r.state !== "lo" ? null : r.better == null ? "neutral" : r.better ? "better" : "worse");

export function ReviewCard({ r, first }: { r: Review; first?: boolean }) {
  const byKey = new Map(r.rows.map((x) => [x.k, x]));
  return (
    <section className="msg byapp review" aria-label={`Your ${r.kind}, ${span(r.from, r.to)}`} data-review={`${r.kind}:${r.key}`} data-new={first || undefined}>
      <small className="from">Your {r.kind} · {span(r.from, r.to)}</small>
      <h3 className="rv-title">{r.title}</h3>
      <Md text={r.summary} />
      {r.rows.length > 0 && <WeekHeat rows={r.rows.filter((x) => !(x.days.every((v) => !v) && !x.value && !x.usual))} />}
      {r.notices.map((n, i) => {
        const row = byKey.get(n.measure as ReviewRow["k"]);
        return (
          <div key={i} className="rv-n">
            <b>{n.title}</b>
            <p>{n.text}</p>
            {row && <DayBars r={row} />}
          </div>
        );
      })}
      {r.next.length > 0 && <div className="rv-next"><small>Next {r.kind}, maybe</small>{r.next.map((c, i) => <p key={i}><b>{c.what}</b> {c.why}</p>)}</div>}
    </section>
  );
}

/** Each measure, each day, shaded against a usual day; the week against your usual week, with its arrow. */
function WeekHeat({ rows }: { rows: ReviewRow[] }) {
  return (
    <table className="rv-heat" aria-label="The week, each day against your usual">
      <thead><tr><th />{DAYS.map((d, i) => <th key={i}>{d}</th>)}<th>week</th></tr></thead>
      <tbody>
        {rows.map((r) => {
          const tone = toneOf(r);
          return (
            <tr key={r.k} data-k={r.k}>
              <th>{SHORT[r.name] ?? r.name}</th>
              {r.days.map((v, i) => <td key={i} className="sh" {...shadeAttrs(r.shades[i])}>{cell(r, v)}</td>)}
              <td className="rv-wk" data-tone={tone ?? undefined}>{r.value == null ? "–" : cell(r, r.value)}{tone && <i>{r.state === "hi" ? "↑" : "↓"}</i>}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** A notice's chart: the week's days as dots on a line against a usual day (the band), coloured the way the heat table is. */
function DayBars({ r }: { r: ReviewRow }) {
  const W = 280, H = 70, top = 8, base = 50, have = r.days.filter((v): v is number => v != null);
  const lo = Math.min(...have, r.lo ?? Infinity), hi = Math.max(...have, r.hi ?? -Infinity), pad = Math.max((hi - lo) * 0.15, r.unit === "/10" ? 0.5 : 1);
  const a = lo - pad, b = hi + pad, Y = (v: number) => base - ((v - a) / (b - a)) * (base - top), cw = W / 7, X = (i: number) => i * cw + cw / 2;
  let line = "", pen = false;
  r.days.forEach((v, i) => { if (v == null) { pen = false; return; } line += `${pen ? "L" : "M"}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`; pen = true; });
  return (
    <svg className="rv-bars" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${r.name} each day of the week${r.lo != null ? `, against a usual day of ${full(r, r.lo)}–${full(r, r.hi!)}` : ""}`}>
      {r.lo != null && r.hi != null && <><rect x={0} y={Y(r.hi)} width={W} height={Math.max(1, Y(r.lo) - Y(r.hi))} className="rv-usual" />{Y(r.lo) - Y(r.hi) >= 7 && <text x={W - 3} y={Y(r.lo) - 3} textAnchor="end" className="rv-ul">usual</text>}</>}
      <path d={line} className="rv-line" />
      {r.days.map((v, i) => (
        <g key={i}>
          {v != null && <circle cx={X(i)} cy={Y(v)} r={4.5} className="rv-dot" data-tone={r.shades[i].lvl ? r.shades[i].tone! : undefined}><title>{`${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i]}: ${full(r, v)}`}</title></circle>}
          <text x={X(i)} y={H - 4} textAnchor="middle">{DAYS[i]}</text>
        </g>
      ))}
    </svg>
  );
}
