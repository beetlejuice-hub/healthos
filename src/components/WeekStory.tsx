/**
 * The Sunday story (owner, 14 Nov, item 12; canvas A "full-screen cards"). Sunday from 18:00 to the end of Monday, Today's
 * brief offers "Your week ›"; it opens full screen — tap the right side for the next card, the left for the one before,
 * × to close. The last card's "Start it" starts the week's one thing to try as an experiment. A Sunday 19:00 push opens
 * it (#today/story). Cards from lib/weekstory; this file gathers their inputs and draws.
 */

import { useEffect, useMemo, useState } from "react";
import { useBand } from "../lib/band-client";
import { maxHrOf } from "../lib/cardio";
import { linkWords } from "../lib/connect";
import { linkMap, lookAt } from "../lib/linkmap";
import { linksFor } from "../lib/linkscache";
import { bestBedtime } from "../lib/nightrows";
import { nights as nightsOf } from "../lib/sleep";
import { sleepScore } from "../lib/sleepscore";
import { useStore } from "../lib/store";
import { localDay } from "../lib/time";
import { storyCards, storyWeek, type StoryCard } from "../lib/weekstory";
import { ZONE2, zone2Weeks } from "../lib/zone2";
import { startExperiment } from "../lib/ai/experiment";
import { useWeekReport } from "./WeekReport";

/** The story's cards for now (none outside Sunday evening and Monday, or with under 2 cards). */
export function useWeekStory(now: number): StoryCard[] {
  const back = storyWeek(now);
  const report = useWeekReport(now, back ?? 0);
  const band = useBand().data, settings = useStore((s) => s.settings), entries = useStore((s) => s.entries), workouts = useStore((s) => s.workouts), imports = useStore((s) => s.imports);
  return useMemo(() => {
    if (back == null) return [];
    const ns = band ? nightsOf(band.sleep, band.hr, band.rhr, band.hrv) : [];
    const scores = ns.map((n) => sleepScore(n, null, ns).score);
    const inWeek = ns.map((n, i) => ({ n, s: scores[i] })).filter(({ n }) => n.up >= report.from && n.up < report.to);
    const eve = (t: number) => { const d = new Date(t); return ((d.getHours() * 60 + d.getMinutes()) - 18 * 60 + 1440) % 1440; };
    const max = maxHrOf(settings)?.bpm;
    const z = max && band?.hr.length ? zone2Weeks(band.hr, max, report.to - 1, 1)[0] : null;
    const { things, links, today } = linksFor(entries, workouts, settings, band, imports, localDay(now));
    const by = new Map(things.map((t) => [t.key, t]));
    return storyCards({
      report, zone2: z ? { min: z.min, aim: ZONE2.aim } : null,
      nights: inWeek.map(({ n, s }) => ({ asleep: n.asleep, score: s, dayName: new Date(n.up).toLocaleDateString("en-GB", { weekday: "short" }), bedEve: eve(n.bed), weekend: [5, 6].includes(new Date(n.bed - 6 * 3600_000).getDay()) })),
      link: links[0] ? linkWords(links[0], by).split(" (90 %")[0] : null,
      look: links.length ? lookAt(linkMap(links, things, today), things, today) : null,
      bestBed: bestBedtime(ns, scores),
    });
  }, [back, report, band, settings, entries, workouts, imports, now]);
}

export function WeekStory({ cards, onClose }: { cards: StoryCard[]; onClose: () => void }) {
  const [i, setI] = useState(0), [started, setStarted] = useState(false);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); if (e.key === "ArrowRight") setI((x) => Math.min(cards.length - 1, x + 1)); if (e.key === "ArrowLeft") setI((x) => Math.max(0, x - 1)); };
    addEventListener("keydown", k); return () => removeEventListener("keydown", k); }, [cards.length, onClose]);
  const c = cards[i];
  if (!c) return null;
  const tap = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest("button")) return;
    const r = e.currentTarget.getBoundingClientRect();
    if (e.clientX - r.left < r.width / 3) setI(Math.max(0, i - 1)); else if (i < cards.length - 1) setI(i + 1); else onClose();
  };
  return (
    <div className="story" role="dialog" aria-modal="true" aria-label="Your week" data-card={c.key} onClick={tap}>
      <div className="story-bars" aria-hidden="true">{cards.map((x, k) => <i key={x.key} className={k <= i ? "on" : ""} />)}</div>
      <button type="button" className="story-x" aria-label="Close" onClick={onClose}>×</button>
      <div className="story-head"><span className="story-k">{c.k}</span><h2>{c.h}</h2></div>
      <div className="story-body"><b className="story-big">{c.big}</b><p>{c.line}</p>
        {c.act && (started ? <p className="story-done">Started — it's on Today as your experiment.</p>
          : <button type="button" className="pill-btn pri" onClick={() => { startExperiment(c.act!.protocol); setStarted(true); }}>{c.act.label}</button>)}</div>
      <div className="story-foot"><span>‹ tap left</span><span>{i + 1} of {cards.length}</span><span>{i < cards.length - 1 ? "tap right ›" : "tap to close"}</span></div>
    </div>
  );
}
