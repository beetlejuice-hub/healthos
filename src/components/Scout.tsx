/**
 * The scout on screen: "Worth a look" on Insights, one line on Today for a pattern you haven't
 * seen yet, and a dot on the Insights tab. Logic: lib/scout.ts.
 */

import { useEffect, useMemo } from "react";
import { act, useStore } from "../lib/store";
import { dailyFacts } from "../lib/insights";
import { scout, since, verdict, type Pattern, type ScoutMemo } from "../lib/scout";
import { addDays, dayLabel, atMinute, localDay } from "../lib/time";
import type { GraphFocus } from "./MasterGraph";

export type Scouted = { p: Pattern; memo?: ScoutMemo; since: { held: number; of: number } | null; verdict: ReturnType<typeof verdict> };

/** Patterns worth a look right now (dismissed and faded ones left out), with what new days said. */
export function useScout(): Scouted[] {
  const entries = useStore((s) => s.entries);
  const workouts = useStore((s) => s.workouts);
  const supplements = useStore((s) => s.supplements);
  const settings = useStore((s) => s.settings);
  const memo = useStore((s) => s.scout);
  const today = localDay(Date.now());
  // Today isn't over, so it's left out; 90 days back, like the effect engine.
  const facts = useMemo(() => dailyFacts(entries, workouts, settings, addDays(today, -90), addDays(today, -1)), [entries, workouts, settings, today]);
  return useMemo(() => scout(facts, supplements, (id) => !!memo[id]?.dismissed)
    .map((p) => { const m = memo[p.id]; const s = m ? since(p, m, facts) : null; return { p, memo: m, since: s, verdict: verdict(s) }; })
    .filter((x) => x.verdict !== "faded"), [facts, supplements, memo]);
}

const lanesOf = (p: Pattern) => [...new Set([p.a.lane, p.b.lane].filter((x): x is string => !!x))];

/** Insights: the patterns, each with how often it held, what new days said, and "Show on graph". */
export function WorthALook({ items, onShow }: { items: Scouted[]; onShow: (f: GraphFocus) => void }) {
  const memo = useStore((s) => s.scout);
  const today = localDay(Date.now());
  // Seeing a pattern here starts its forward check (and clears it from Today).
  useEffect(() => {
    const fresh = items.filter((x) => !x.memo?.seen);
    if (!fresh.length) return;
    act.setScout({ ...memo, ...Object.fromEntries(fresh.map((x) => [x.p.id, { first: x.memo?.first ?? today, sign: x.p.sign, seen: true }])) });
  }, [items, memo, today]);
  if (!items.length) return null;
  return (
    <section className="scout" id="scout" aria-label="Worth a look">
      <h2>Worth a look <span>things that move together in your days · early, could be chance · re-checked on every new day</span></h2>
      <div className="scards">
        {items.map(({ p, memo: m, since: s, verdict: v }) => (
          <article className="scard" key={p.id}>
            <div className="k">{v === "confirmed" ? "holding up" : s ? "watching" : "new · could be chance"}</div>
            <h3>{p.text}</h3>
            <p className="held">Held on <b>{p.held} of {p.of}</b> {p.a.yes ? `${p.a.yes.replace(/^a /, "")}${p.a.yes.startsWith("a ") ? "s" : " days"}` : `of your highest-${p.a.name} days`}{p.lag ? ", looking at the next day" : ""}</p>
            {s && m && <p className="since">Since {dayLabel(atMinute(m.first, 12 * 60))}: held on <b>{s.held} of {s.of}</b> new days{v === "confirmed" ? " — it keeps holding" : ""}</p>}
            <p className="ev">{p.n} days · correlation {p.r >= 0 ? "+" : "−"}{Math.abs(p.r).toFixed(2)} · weekends compared separately · p {p.p < 0.001 ? "< 0.001" : p.p.toFixed(3)}</p>
            <div className="sacts">
              <button type="button" className="ibtn" onClick={() => onShow({ key: `${p.id}:${Date.now()}`, lanes: lanesOf(p), days: p.days })}>Show on graph</button>
              <button type="button" className="ibtn" onClick={() => act.setScout({ ...memo, [p.id]: { first: m?.first ?? today, sign: p.sign, seen: true, dismissed: true } })}>Not interesting</button>
            </div>
          </article>
        ))}
      </div>
      <p className="note-i">Flagged early on purpose. In tests with made-up people and nothing real to find, about one pattern at a time is chance — so each one keeps being checked on days it hasn't seen: real ones hold up, flukes fade away. The AI will explain them once it's on.</p>
    </section>
  );
}

/** Today: one line for a pattern you haven't looked at yet. */
export function ScoutLine() {
  const items = useScout();
  const fresh = useMemo(() => items.find((x) => !x.memo), [items]);
  if (!fresh) return null;
  return (
    <a className="noticed-line" href="#insights" onClick={() => setTimeout(() => document.getElementById("scout")?.scrollIntoView({ behavior: "smooth" }), 150)}>
      <span><small>Worth a look</small>{fresh.p.text} — {fresh.p.held} of {fresh.p.of} times.</span>
      <span className="r">→</span>
    </a>
  );
}

/** For the Insights tab dot. */
export const useScoutUnseen = () => useScout().filter((x) => !x.memo).length;
