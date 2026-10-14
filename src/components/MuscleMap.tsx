/**
 * Your muscles (owner, 2 Oct: "a man figure, all muscles w diff color and getting more colored the
 * more i train it"). Front and back, each muscle filled by hard sets in the last 7 days (or a 4-week
 * weekly average): grey = untrained, full colour at ~12 sets a week (WEEKLY_SETS). Tap a muscle for
 * its numbers. Data: lib/training fineWeek (the figure's finer muscles, PLAN 94).
 */

import { useMemo, useState } from "react";
import { FINE, WEEKLY_SETS, fineWeek, type Fine } from "../lib/training";

type Shape = { m: Fine | null; d: string };

// Left half of each view (x < 60); the right half is the mirror image. Since PLAN 94 (owner, 14 Oct: "a bit more complex
// muscle character"): three heads of the shoulder, the back as upper back, lats and lower back, abs and obliques.
const FRONT: Shape[] = [
  { m: null, d: "M54 28 L66 28 L67 37 L53 37 Z" }, // neck
  { m: "Upper back", d: "M55.5 31 Q50 34.5 43.5 37.5 Q48.5 38.8 53.5 37.6 Q55.5 35 55.5 31 Z" }, // traps, seen from the front
  { m: "Side delts", d: "M33 43 Q28.5 45.5 27 51 Q26.5 56.5 29 60.5 Q31.5 56 33.5 51 Q32 47 33 43 Z" },
  { m: "Front delts", d: "M43.5 38.5 Q37 38.3 33 43 Q32 47 33.5 51 Q37.5 48.5 40.5 44.5 Q42.8 41.8 45.5 40.3 Z" },
  { m: "Chest", d: "M46 40 Q53 38.5 59.2 40 L59.2 59 Q51.5 63 44 58.5 Q40 51 46 40 Z" },
  { m: "Biceps", d: "M29.5 62.5 Q25.5 71 26.5 81 Q29.5 85 33 81.5 Q35.5 72 34.5 61.5 Q32 60 29.5 62.5 Z" },
  { m: "Forearms", d: "M26 85 Q21 98 22.5 110 Q25.5 113 28.5 110 Q32 99 32.5 86 Q29 84 26 85 Z" },
  { m: null, d: "M22.5 112 Q21 118 24 121 Q28 120 28.5 113 Z" }, // hand
  { m: "Obliques", d: "M44.5 62 Q47.5 61.5 50.5 62.5 Q49.5 80 51.5 97 Q47.5 94 45.5 86 Q43.5 74 44.5 62 Z" },
  { m: "Abs", d: "M50.5 62.5 Q55 61.5 59.2 62 L59.2 101 Q55 101 52 97.5 Q50 80 50.5 62.5 Z" },
  { m: null, d: "M45.5 99 Q52 103.5 59.2 104 L59.2 121 Q51 120 45 115.5 Q44.5 106 45.5 99 Z" }, // hips
  { m: "Quads", d: "M45 117.5 Q39 138 42.5 166 Q48 171 55 168 Q59.5 146 58.5 123 Q51 122 45 117.5 Z" },
  { m: null, d: "M43.5 168 Q42.5 175 45 179 L54 179 Q56 175 55 169 Z" }, // knee
  { m: "Calves", d: "M44.8 181 Q41 196 43 212 Q44.6 214 46.2 210 Q45.6 196 46.6 181 Z" }, // the outer calf, seen from the front
  { m: null, d: "M46.6 181 Q44.8 202 47 226 L53 226 Q56.5 202 54 181 Z" }, // shin
  { m: null, d: "M45 228 Q41 233 42 236 L54 236 Q54 231 53 228 Z" }, // foot
];
const BACK: Shape[] = [
  { m: null, d: "M54 28 L66 28 L67 37 L53 37 Z" },
  { m: "Side delts", d: "M33 43 Q28.5 45.5 27 51 Q26.5 56.5 29 60.5 Q31.5 56 33.5 51 Q32 47 33 43 Z" },
  { m: "Rear delts", d: "M43 38.6 Q36.5 38.4 33 43 Q32.3 47 33.8 50.8 Q38.5 48.6 41.5 44.6 Q43.3 42 44.6 40 Z" },
  { m: "Upper back", d: "M55.5 30 Q50 34 44 38.5 Q47.5 41.5 50 46.5 Q53.5 53 59.2 60 L59.2 30 Z" }, // traps and between the blades
  { m: "Lats", d: "M44.6 41.5 Q42 45 41.5 51 Q41.2 61 44 70.5 Q47.6 82 52 89 Q55.5 90.5 59.2 90.5 L59.2 62 Q53 54.5 49.6 47.6 Q47.4 43.6 44.6 41.5 Z" },
  { m: "Lower back", d: "M52 89.3 Q55.5 91.2 59.2 91.2 L59.2 104 L47.2 104 Q47.6 96 52 89.3 Z" },
  { m: "Triceps", d: "M29.5 62.5 Q25.5 71 26.5 81 Q29.5 85 33 81.5 Q35.5 72 34.5 61.5 Q32 60 29.5 62.5 Z" },
  { m: "Forearms", d: "M26 85 Q21 98 22.5 110 Q25.5 113 28.5 110 Q32 99 32.5 86 Q29 84 26 85 Z" },
  { m: null, d: "M22.5 112 Q21 118 24 121 Q28 120 28.5 113 Z" },
  { m: "Glutes", d: "M46 104.5 L59.2 104.5 L59.2 122 Q52 125 45.5 120 Q43 112 46 104.5 Z" },
  { m: "Hamstrings", d: "M45.5 122 Q40 142 43 166 Q48 170 55 167 Q59 146 58.5 125 Q52 126 45.5 122 Z" },
  { m: null, d: "M43.5 168 Q42.5 175 45 179 L54 179 Q56 175 55 169 Z" },
  { m: "Calves", d: "M45 181 Q40 196 44 212 Q49 216 54 212 Q57 196 54 181 Z" },
  { m: null, d: "M45 214 Q44 222 45.5 226 L53 226 Q54 220 54 214 Z" },
  { m: null, d: "M45 228 Q41 233 42 236 L54 236 Q54 231 53 228 Z" },
];

const fill = (sets: number) =>
  sets <= 0 ? "var(--k-tile-2)" : `color-mix(in srgb, var(--gym) ${Math.round(22 + 78 * Math.min(1, sets / WEEKLY_SETS.full))}%, var(--k-tile-2))`;

function Figure({ shapes, label, load, sel, pick }: { shapes: Shape[]; label: string; load: Record<Fine, number>; sel: Fine | null; pick: (m: Fine) => void }) {
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
        {label === "Front" && <path d="M51 74 H69 M51 85 H69 M52 95 H68" stroke="var(--k-bg)" strokeWidth=".8" opacity=".7" pointerEvents="none" />}
      </svg>
      <figcaption>{label}</figcaption>
    </figure>
  );
}

export function MuscleMap({ sets, now }: { sets: { at: number; exercise: string }[]; now: number }) {
  const [weeks, setWeeks] = useState<1 | 4>(1);
  const [sel, setSel] = useState<Fine | null>(null);
  const load = useMemo(() => fineWeek(sets, now, weeks), [sets, now, weeks]);
  const ranked = [...FINE].sort((a, b) => load[b] - load[a]);
  const trained = ranked.filter((m) => load[m] > 0);
  const per = weeks === 1 ? "in the last 7 days" : "a week, last 4 weeks";
  const say = (m: Fine) => {
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
        : trained.length ? `Most: ${trained.slice(0, 2).map((m) => `${m} ${load[m]}`).join(", ")}${trained.length < FINE.length ? ` · not yet: ${ranked.filter((m) => load[m] === 0).slice(0, 3).join(", ")}` : ""}. Tap a muscle.`
        : "Log a workout and your muscles fill in here."}</p>
      <div className="mm-scale" aria-hidden="true"><span>0</span><i /><span>{WEEKLY_SETS.full}+ sets / week</span></div>
    </div>
  );
}
