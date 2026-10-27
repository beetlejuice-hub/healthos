/**
 * The scout on screen: "Worth a look" on Insights, one line on Today for a pattern you haven't
 * seen yet, and a dot on the Insights tab. Logic: lib/scout.ts.
 */

import { useEffect, useMemo, useState } from "react";
import { act, useStore } from "../lib/store";
import { dailyFacts } from "../lib/insights";
import { scout, since, verdict, type Pattern, type ScoutMemo } from "../lib/scout";
import { addDays, dayLabel, atMinute, localDay } from "../lib/time";
import type { GraphFocus } from "./MasterGraph";
import { AiCheckLabel, HiddenByYou } from "./AiCheck";
import { LeadChart } from "./LeadChart";
import { AskAbout } from "./AskAbout";
import { aboutLead, leadGrade, leadRef, leadTest } from "../lib/ai/lead";
import { startExperiment } from "../lib/ai/experiment";

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

/**
 * Insights → Leads (PLAN 176 phase 2; owner, 27 Oct: "more likely for graphs and connections between things" — "1 do"):
 * every link the app found and tested, strongest first, each with how sure it is, both things drawn over 4 weeks with
 * the days it was on lit, "Ask why" (the AI on that one link: mechanism, studies, is it real) and "Test it" (14 days of
 * the change the link points to, measured by the app). No AI call until you ask.
 */
export function WorthALook({ items, onShow }: { items: Scouted[]; onShow: (f: GraphFocus) => void }) {
  const memo = useStore((s) => s.scout), running = useStore((s) => s.ai.experiments).filter((x) => !x.ended).map((x) => x.name);
  const [asking, setAsking] = useState<string | null>(null);
  const sorted = useMemo(() => [...items].sort((x, y) => Number(leadGrade(y.p) === "strong") - Number(leadGrade(x.p) === "strong")), [items]);
  const today = localDay(Date.now());
  // Seeing a pattern here starts its forward check (and clears it from Today).
  useEffect(() => {
    const fresh = items.filter((x) => !x.memo?.seen);
    if (!fresh.length) return;
    act.setScout({ ...memo, ...Object.fromEntries(fresh.map((x) => [x.p.id, { first: x.memo?.first ?? today, sign: x.p.sign, seen: true }])) });
  }, [items, memo, today]);
  // hidden after the overall check: still listed here, so the section stays while any are (PLAN 137)
  const checks = useStore((s) => s.ai.checks), anyHidden = (checks ?? []).some((c) => c.hidden && c.id.startsWith("s:"));
  if (!items.length && !anyHidden) return null;
  return (
    <section className="scout" id="scout" aria-label="Leads">
      <h2>Leads <span>things that move together in your days, tested · strongest first · re-checked on every new day</span></h2>
      <div className="scards">
        {sorted.map(({ p, memo: m, since: s, verdict: v }) => {
          const strong = leadGrade(p) === "strong", test = leadTest(p);
          return (
          <article className="scard" key={p.id} data-grade={strong ? "strong" : "early"}>
            <div className="k">{strong ? "strong · tested" : v === "confirmed" ? "holding up" : s ? "watching · could be chance" : "early · could be chance"}</div>
            <h3>{p.text}</h3>
            <p className="held">Held on <b>{p.held} of {p.of}</b> {p.a.yes ? `${p.a.yes.replace(/^a /, "")}${p.a.yes.startsWith("a ") ? "s" : " days"}` : `of your highest-${p.a.name} days`}{p.lag ? ", looking at the next day" : ""}</p>
            {s && m && <p className="since">Since {dayLabel(atMinute(m.first, 12 * 60))}: held on <b>{s.held} of {s.of}</b> new days{v === "confirmed" ? " — it keeps holding" : ""}</p>}
            <LeadChart lead={leadRef(p)} days={28} />
            <p className="ev">{p.n} days · correlation {p.r >= 0 ? "+" : "−"}{Math.abs(p.r).toFixed(2)} · weekends compared separately · p {p.p < 0.0001 ? "< 0.0001" : p.p.toFixed(4)}{strong ? " · chance gets this ~1 in 30" : ""}</p>
            <div className="sacts">
              <button type="button" className="ibtn" aria-expanded={asking === p.id} onClick={() => setAsking(asking === p.id ? null : p.id)}>Ask why</button>
              {test && (running.includes(test.name)
                ? <span className="ibtn running">Testing — see Experiments</span>
                : <button type="button" className="ibtn" onClick={() => startExperiment(test)} title={test.how}>Test it: {test.name.split(" — ")[0].toLowerCase()}, 14 days</button>)}
              <button type="button" className="ibtn" onClick={() => onShow({ key: `${p.id}:${Date.now()}`, lanes: lanesOf(p), days: p.days })}>Show on graph</button>
              <button type="button" className="ibtn" onClick={() => act.setScout({ ...memo, [p.id]: { first: m?.first ?? today, sign: p.sign, seen: true, dismissed: true } })}>Not interesting</button>
            </div>
            {/* PLAN 137: hiding it after the check is "Not interesting" too */}
            <AiCheckLabel id={`s:${p.id}`} onHide={() => act.setScout({ ...memo, [p.id]: { first: m?.first ?? today, sign: p.sign, seen: true, dismissed: true } })} />
            {asking === p.id && <AskAbout about={aboutLead(p)} label={`Re “${p.text}”`} placeholder="Ask or tell the AI about this…" starters={["Why might this be?", "Is this real or chance?", "What can I do about it?"]} />}
          </article>
          );
        })}
      </div>
      <HiddenByYou prefix="s:" onBack={(id) => { const k = id.slice(2); if (memo[k]) act.setScout({ ...memo, [k]: { ...memo[k], dismissed: false } }); }} />
      <p className="note-i">"Early" ones are flagged on purpose before they're sure: in tests with made-up people and nothing real to find, about one at a time is chance — so each keeps being checked on days it hasn't seen: real ones hold up, flukes fade away. "Strong" ones cleared a bar chance reaches about 1 time in 30; the strongest leads a morning read. "Goes with", never "causes" — "Test it" is how you find out.</p>
    </section>
  );
}

/** Today: one line for a pattern you haven't looked at yet. */
export function ScoutLine() {
  const items = useScout();
  const fresh = useMemo(() => items.find((x) => !x.memo), [items]);
  if (!fresh) return null;
  return (
    <a className="noticed-line" href="#insights/connections" onClick={() => setTimeout(() => document.getElementById("scout")?.scrollIntoView({ behavior: "smooth" }), 150)}>
      <span><small>New lead</small>{fresh.p.text} — {fresh.p.held} of {fresh.p.of} times.</span>
      <span className="r">→</span>
    </a>
  );
}

/** For the Insights tab dot. */
export const useScoutUnseen = () => useScout().filter((x) => !x.memo).length;
