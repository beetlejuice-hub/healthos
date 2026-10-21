/**
 * The week on top of What I ate (PLAN 154; owner, 20 Oct: "need a bit better look for macro breakdwon, food, and
 * trackking food overall, looking back"): seven days of calories and of protein, each against its goal (two small rows,
 * one scale each), today lighter (it isn't over), a day without food logged left empty — unknown, not zero. Tap a day to
 * open it below. The line on top: finished days only. Numbers from lib/foodweek; this file only draws.
 */

import { FOOD_WEEK, type WeekDay, type WeekRead } from "../lib/foodweek";
import { atMinute, dayLabel } from "../lib/time";

const fmt = (n: number) => Math.round(n).toLocaleString("en-GB");

function Row({ name, week, get, goal, unit, color, day, onPick }: { name: string; week: WeekDay[]; get: (d: WeekDay) => number; goal: number; unit: string; color: string; day: string; onPick: (d: string) => void }) {
  const top = Math.max(goal * 1.25, ...week.filter((d) => d.logged).map(get)), pct = (v: number) => `${Math.min(100, (v / top) * 100)}%`;
  return (
    <div className="fw-row" style={{ "--fw": color } as React.CSSProperties}>
      <span className="fw-name">{name}<small>goal {fmt(goal)}{unit === "g" ? " g" : ""}</small></span>
      <div className="fw-plot">
        <i className="fw-goal" style={{ bottom: pct(goal) }} />
        {week.map((d) => (
          <button type="button" key={d.day} className="fw-day" data-on={d.day === day || undefined} data-partial={d.partial || undefined} tabIndex={-1} aria-hidden="true" onClick={() => onPick(d.day)}>
            {d.logged ? <i className="fw-bar" style={{ height: pct(get(d)) }} /> : <i className="fw-none" />}
          </button>
        ))}
      </div>
    </div>
  );
}

export function FoodWeek({ week, read, goals, day, onPick }: { week: WeekDay[]; read: WeekRead; goals: { kcal: number; p: number }; day: string; onPick: (d: string) => void }) {
  const label = (d: WeekDay) => dayLabel(atMinute(d.day, 720));
  return (
    <section className="fw" aria-label="Your food over 7 days">
      <p className="fw-read">
        <span>{read.n
          ? <><b>{fmt(read.kcal!)}</b> kcal a day · <b>{read.underKcal} of {read.n}</b> at or under goal · protein <b>{fmt(read.p!)} g</b>, at goal <b>{read.hitP} of {read.n}</b>{read.score != null && <> · plates <b>{read.score}</b></>}</>
          : "No finished day with food logged in these 7 days."}</span>
        <small>{read.n ? `the ${read.n} finished day${read.n === 1 ? "" : "s"} with food logged` : ""}{read.n ? ` · protein counts within ${Math.round((1 - FOOD_WEEK.proteinHit) * 100)}\u00a0% of goal` : ""}</small>
      </p>
      <Row name="Calories" week={week} get={(d) => d.kcal} goal={goals.kcal} unit="kcal" color="var(--kcal)" day={day} onPick={onPick} />
      <Row name="Protein" week={week} get={(d) => d.p} goal={goals.p} unit="g" color="var(--pro)" day={day} onPick={onPick} />
      <div className="fw-days">
        <span />
        <div>
          {week.map((d) => (
            <button type="button" key={d.day} className="fw-lab" data-on={d.day === day || undefined} aria-pressed={d.day === day}
              aria-label={`${label(d)}: ${d.logged ? `${fmt(d.kcal)} kcal, protein ${fmt(d.p)} g${d.score != null ? `, plates ${d.score}` : ""}${d.partial ? ", so far" : ""}` : "no food logged"}`} onClick={() => onPick(d.day)}>
              <b>{label(d).slice(0, 3)}</b>{label(d).split(" ")[1]}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
