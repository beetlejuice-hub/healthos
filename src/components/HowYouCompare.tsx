/**
 * How you compare (PLAN 206; owner, 11 Nov: "i like the comparisons, etc, but the whole gamification idea is not that good
 * … keep the charts, keep the not so dry"). Where the game's week card was on Today: each thing a big study measured the
 * way your band does, as a bar — about what share of its people you're ahead of, the middle marked — and the most
 * striking of yesterday's steps, last night's sleep and this morning's resting heart rate in a line. Numbers from lib/card
 * and lib/norms; this file only draws.
 */

import { useMemo } from "react";
import { useBand } from "../lib/band-client";
import { pctWords } from "../lib/card";
import { useStore } from "../lib/store";
import { localDay } from "../lib/time";
import { vsNow } from "../lib/vsnow";
import { go } from "../lib/nav";

/** The trend panel behind each stand-out (PLAN 214; owner, 11 Nov: "tap a stand-out to see why"). */
const TREND: Record<string, string> = { HRT: "rhr", SLP: "asleep", PAC: "steps", END: "vo2", alc: "drinks", pro: "protein", caf: "caffeine" };
/** Insights, its trends, that panel brought into view and lit for a moment. */
function openTrend(key: string) {
  go("insights", "week");
  let tries = 0;
  const find = () => { const el = document.querySelector<HTMLElement>(`[data-trend="${key}"]`); if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.classList.add("tw-flash"); setTimeout(() => el.classList.remove("tw-flash"), 2200); } else if (tries++ < 20) setTimeout(find, 150); };
  setTimeout(find, 150);
}
import { useDayTable } from "./useDayTable";

export function HowYouCompare({ now }: { now: number }) {
  const entries = useStore((s) => s.entries), age = useStore((s) => s.settings.age), sex = useStore((s) => s.settings.sex), bodyKg = useStore((s) => s.settings.bodyKg);
  const { days } = useDayTable(now);
  const band = useBand().data, today = localDay(now);
  // the numbers in lib/vsnow (PLAN 214: the AI reads the same)
  const { stats, vs, stand } = useMemo(() => vsNow({ band, entries, days, age, sex, bodyKg, today, now }), [band, entries, days, age, sex, bodyKg, today, now]);
  const shown = stats.filter((s) => s.p != null);
  if (!shown.length && !stand.good.length && !stand.bad.length) return null;
  return (
    <section className="card vsall" aria-label="How you compare">
      <h3>How you compare <span>this week, against big studies</span></h3>
      <ul>
        {stats.map((s) => (
          <li key={s.key} data-stat={s.key} className={s.p == null ? "none" : undefined}>
            <span className="vs-w"><b>{s.word}</b>{s.p != null && <> <small>{s.says}{s.avg ? ` · ${s.avg}` : ""}</small></>}</span>
            {s.p != null
              ? <><span className="vs-bar" aria-hidden="true"><i style={{ width: `${Math.round(s.p * 100)}%` }} className={s.p >= 0.5 ? "up" : "down"} /><em /></span>
                <span className="vs-p">{s.own ? (s.p >= 0.5 ? "gaining" : "slipping") : `ahead of ${pctWords(s.p)}`} <small>· {s.against}</small></span></>
              : <span className="vs-p"><small>{s.says}</small></span>}
          </li>
        ))}
      </ul>
      {stand.good.length || stand.bad.length ? <div className="vs-stand" aria-label="You vs everyone">
        <b className="vs-h">You vs everyone</b>
        {stand.good.length > 0 && <><small className="vs-k good">Where you stand out</small>
          {stand.good.map((i) => <button type="button" key={i.key} className="vs-i good" data-key={i.key} onClick={() => openTrend(TREND[i.key])}><b>{i.title}</b><span>{i.vs}</span><small className="vs-go">See the trend ›</small></button>)}</>}
        {stand.bad.length > 0 && <><small className="vs-k bad">Where you're behind</small>
          {stand.bad.map((i) => <button type="button" key={i.key} className="vs-i bad" data-key={i.key} onClick={() => openTrend(TREND[i.key])}><b>{i.title}</b><span>{i.vs}</span>{i.fix && <span className="vs-fix"><b>Fix:</b> {i.fix}</span>}<small className="vs-go">See the trend ›</small></button>)}</>}
        <small className="note">Bars: this week. Drinks, protein, caffeine: the last 14 days. Fixes are options, not orders.</small>
      </div> : vs && <p className="wk-vs"><b>You vs everyone</b> · {vs}</p>}
    </section>
  );
}
