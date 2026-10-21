/**
 * Today: how ready you are, out of 100 (owner, 14 Oct: "also readiness score??"), one line under the day's numbers that
 * opens to its parts — this morning's HRV and resting heart rate against your normal, last night, the week's sleep and
 * recent training (lib/readiness). Only when the band has last night. Under it, the night check (PLAN 52): a line when
 * last night's skin temperature, breathing or blood oxygen was off your usual, and all three when opened.
 */

import { useMemo } from "react";
import { useBand } from "../lib/band-client";
import { nights } from "../lib/sleep";
import { readiness } from "../lib/readiness";
import { heartSigns, nightCheck } from "../lib/nightcheck";
import { NightRows } from "./NightCheck";
import { useStore } from "../lib/store";
import { localDay } from "../lib/time";
import { SleepScore } from "./SleepScore";

const leftWhy = (l: { id: string; name: string }) => (l.id === "load" ? "training (no sets logged in the last 4 weeks)" : l.id === "balance" ? "the week's sleep (needs 4 nights)"
  : `${l.name.toLowerCase()} (needs 10 mornings from the band)`);

export function Readiness({ now }: { now: number }) {
  const band = useBand().data, entries = useStore((s) => s.entries);
  const day = localDay(now);
  const rating = useMemo(() => entries.find((e) => e.kind === "sleep" && localDay(e.at) === day && e.rating != null) as { rating?: number } | undefined, [entries, day])?.rating;
  const sets = useMemo(() => entries.filter((e): e is Extract<typeof e, { kind: "set" }> => e.kind === "set"), [entries]);
  const r = useMemo(() => (band ? readiness(day, nights(band.sleep, band.hr, band.rhr, band.hrv), rating, sets, now, { hrv: band.hrv, rhr: band.rhr }) : null), [band, day, rating, sets, now]);
  // the night check (PLAN 52): a line when skin temperature, breathing or blood oxygen is off — the score unchanged
  // (owner, 21 Oct: "2 line"); the heart's own signs this morning count with it, never alone
  const nc = useMemo(() => (band && r ? nightCheck(day, band, heartSigns(r)) : null), [band, r, day]);
  if (!r) return null;
  // the line names the two parts furthest from full, so you see why without opening it; a poor night always leads
  // (owner, 15 Oct: "doesn't highlight eniugh that i slept poorly")
  const low = [...r.parts].sort((a, b) => a.got / a.max - b.got / b.max || b.max - a.max).filter((p) => p.got < p.max * 0.8); // ties: the bigger part first
  // a poor night's score, or a short one (under 6 h) however calm it was (16 Oct)
  const poorNight = r.sleep < 60 || r.asleep < 6 * 60, shown = [...(poorNight ? low.filter((p) => p.id === "sleep") : []), ...low.filter((p) => !poorNight || p.id !== "sleep")].slice(0, 2);
  const zone = r.score >= 70 ? "ideal" : r.score >= 60 ? "fair" : "poor";
  return (
    <details className="card rd" data-score={r.score} data-zone={zone}>
      <summary><span className="k">Readiness</span><b>{r.score}</b><span className={`w zw ${zone}`}>{r.word}</span>
        {poorNight && <span className="rd-flag">{r.sleep < 60 ? "slept poorly" : "short night"}</span>}
        <span className="why">{shown.length ? shown.map((p) => `${p.name}: ${p.why}`).join(" · ") : "everything at or near your usual"}</span>
        {nc?.line && <span className="rd-night">{nc.line}</span>}</summary>
      {r.cap && <p className="rd-cap" data-cap={r.cap.to}>Held at {r.cap.to}: {r.cap.why}. The parts add to {r.added}, but a good week can't make up for that this morning.</p>}
      <SleepScore s={r} label="Readiness" leftWhy={leftWhy} />
      {nc && <NightRows c={nc} />}
      <p className="sl-note">Against your own normal, as Oura and Fitbit do it: this morning's HRV and resting heart rate, last night, the week's sleep, your last 2 days of training. The night check is beside it, not in the score. A guide to the day, not a diagnosis.</p>
    </details>
  );
}
