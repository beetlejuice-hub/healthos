/**
 * Your muscles (owner, 2 Oct: "a man figure, all muscles w diff color and getting more colored the
 * more i train it"). Front and back, each muscle filled by hard sets in the last 7 days (or a 4-week
 * weekly average): grey = untrained, full colour at ~12 sets a week (WEEKLY_SETS). Tap a muscle for
 * its numbers. Data: lib/training muscleWeek.
 */

import { useMemo, useState } from "react";
import { MUSCLE_GROUPS, WEEKLY_SETS, muscleWeek, type MuscleGroup } from "../lib/training";

type Shape = { m: MuscleGroup | null; d: string };

// Left half of each view (x < 60); the right half is the mirror image.
const FRONT: Shape[] = [
  { m: null, d: "M54 28 L66 28 L67 37 L53 37 Z" }, // neck
  { m: "Shoulders", d: "M43 39 Q30 39 26 50 Q25 58 29 61 Q35 58 38 52 Q41 45 46 41 Z" },
  { m: "Chest", d: "M46 41 Q53 38.5 59.2 40 L59.2 60 Q51 63.5 43 59 Q39.5 50 46 41 Z" },
  { m: "Biceps", d: "M28 63 Q24 72 25.5 82 Q29 86 33 82 Q35.5 72 35 62 Q31 60 28 63 Z" },
  { m: null, d: "M25 86 Q21 98 22.5 110 Q25.5 113 28.5 110 Q32 99 32.5 86 Q28.5 84 25 86 Z" }, // forearm
  { m: null, d: "M22.5 112 Q21 118 24 121 Q28 120 28.5 113 Z" }, // hand
  { m: "Core", d: "M46 63 Q53 61.5 59.2 62.5 L59.2 103 Q52 103 48 99 Q45 82 46 63 Z" },
  { m: null, d: "M48 101 Q54 105 59.2 105 L59.2 122 Q51 121 45 116 Z" }, // hips
  { m: "Quads", d: "M45 118 Q39 138 42.5 166 Q48 171 55 168 Q59.5 146 58.5 123 Q51 122 45 118 Z" },
  { m: null, d: "M43.5 168 Q42.5 175 45 179 L54 179 Q56 175 55 169 Z" }, // knee
  { m: null, d: "M45 181 Q41.5 202 45.5 226 L53 226 Q56.5 202 54 181 Z" }, // shin
  { m: null, d: "M45 228 Q41 233 42 236 L54 236 Q54 231 53 228 Z" }, // foot
];
const BACK: Shape[] = [
  { m: null, d: "M54 28 L66 28 L67 37 L53 37 Z" },
  { m: "Shoulders", d: "M43 39 Q30 39 26 50 Q25 58 29 61 Q35 58 38 52 Q41 45 46 41 Z" },
  { m: "Back", d: "M46 39 Q53 36 59.2 36 L59.2 98 Q53 98 50 92 Q44 76 40 62 Q39 50 46 39 Z" },
  { m: "Triceps", d: "M28 63 Q24 72 25.5 82 Q29 86 33 82 Q35.5 72 35 62 Q31 60 28 63 Z" },
  { m: null, d: "M25 86 Q21 98 22.5 110 Q25.5 113 28.5 110 Q32 99 32.5 86 Q28.5 84 25 86 Z" },
  { m: null, d: "M22.5 112 Q21 118 24 121 Q28 120 28.5 113 Z" },
  { m: null, d: "M48 96 Q54 100 59.2 100 L59.2 104 L46 104 Z" }, // lower back
  { m: "Glutes", d: "M46 104 L59.2 104 L59.2 122 Q52 125 45.5 120 Q43 112 46 104 Z" },
  { m: "Hamstrings", d: "M45.5 122 Q40 142 43 166 Q48 170 55 167 Q59 146 58.5 125 Q52 126 45.5 122 Z" },
  { m: null, d: "M43.5 168 Q42.5 175 45 179 L54 179 Q56 175 55 169 Z" },
  { m: "Calves", d: "M45 181 Q40 196 44 212 Q49 216 54 212 Q57 196 54 181 Z" },
  { m: null, d: "M45 214 Q44 222 45.5 226 L53 226 Q54 220 54 214 Z" },
  { m: null, d: "M45 228 Q41 233 42 236 L54 236 Q54 231 53 228 Z" },
];

const fill = (sets: number) =>
  sets <= 0 ? "var(--k-tile-2)" : `color-mix(in srgb, var(--gym) ${Math.round(22 + 78 * Math.min(1, sets / WEEKLY_SETS.full))}%, var(--k-tile-2))`;

function Figure({ shapes, label, load, sel, pick }: { shapes: Shape[]; label: string; load: Record<MuscleGroup, number>; sel: MuscleGroup | null; pick: (m: MuscleGroup) => void }) {
  const side = (mirror: boolean) => shapes.map((s, i) => {
    const on = s.m && sel === s.m;
    return s.m ? (
      <path key={`${mirror}${i}`} d={s.d} fill={fill(load[s.m])} stroke={on ? "var(--k-ink)" : "var(--k-bg)"} strokeWidth={on ? 1.4 : 0.8}
        role="button" tabIndex={mirror ? -1 : 0} aria-label={`${s.m}: ${load[s.m]} hard sets`} style={{ cursor: "pointer" }}
        onClick={() => pick(s.m!)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(s.m!); } }} />
    ) : <path key={`${mirror}${i}`} d={s.d} fill="var(--k-tile-2)" opacity=".55" stroke="var(--k-bg)" strokeWidth=".8" />;
  });
  return (
    <figure className="mm-fig">
      <svg viewBox="16 2 88 238" role="group" aria-label={`Muscles, ${label}`}>
        <ellipse cx="60" cy="16" rx="9.5" ry="11.5" fill="var(--k-tile-2)" opacity=".55" />
        {side(false)}
        <g transform="translate(120 0) scale(-1 1)">{side(true)}</g>
        {label === "Front" && <path d="M48 75 H72 M48 86 H72 M49 96 H71" stroke="var(--k-bg)" strokeWidth=".8" opacity=".7" pointerEvents="none" />}
      </svg>
      <figcaption>{label}</figcaption>
    </figure>
  );
}

export function MuscleMap({ sets, now }: { sets: { at: number; exercise: string }[]; now: number }) {
  const [weeks, setWeeks] = useState<1 | 4>(1);
  const [sel, setSel] = useState<MuscleGroup | null>(null);
  const load = useMemo(() => muscleWeek(sets, now, weeks), [sets, now, weeks]);
  const ranked = [...MUSCLE_GROUPS].sort((a, b) => load[b] - load[a]);
  const trained = ranked.filter((m) => load[m] > 0);
  const per = weeks === 1 ? "in the last 7 days" : "a week, last 4 weeks";
  const say = (m: MuscleGroup) => {
    const v = load[m];
    const verdict = v === 0 ? "not trained" : v < WEEKLY_SETS.low ? "light" : v < WEEKLY_SETS.good ? "moderate" : v <= WEEKLY_SETS.high ? "in the growth range" : "a lot";
    return `${m} · ${v} hard set${v === 1 ? "" : "s"} ${per} · ${verdict}`;
  };
  return (
    <div className="tile mm">
      <div className="mm-head"><span className="k">Your muscles</span>
        <div className="mm-tog" role="group" aria-label="Period">
          <button type="button" aria-pressed={weeks === 1} onClick={() => setWeeks(1)}>7 days</button>
          <button type="button" aria-pressed={weeks === 4} onClick={() => setWeeks(4)}>4 weeks</button>
        </div>
      </div>
      <div className="mm-figs">
        <Figure shapes={FRONT} label="Front" load={load} sel={sel} pick={setSel} />
        <Figure shapes={BACK} label="Back" load={load} sel={sel} pick={setSel} />
      </div>
      <p className="mm-say" role="status">{sel ? say(sel)
        : trained.length ? `Most: ${trained.slice(0, 2).map((m) => `${m} ${load[m]}`).join(", ")}${trained.length < MUSCLE_GROUPS.length ? ` · not yet: ${ranked.filter((m) => load[m] === 0).slice(0, 3).join(", ")}` : ""}. Tap a muscle.`
        : "Log a workout and your muscles fill in here."}</p>
      <div className="mm-scale" aria-hidden="true"><span>0</span><i /><span>{WEEKLY_SETS.full}+ sets / week</span></div>
    </div>
  );
}
