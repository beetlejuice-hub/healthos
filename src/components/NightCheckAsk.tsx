/**
 * Today, in "For you": last night's check (PLAN 52), only when something was off your usual — skin temperature, breathing
 * or blood oxygen, with the heart's own signs this morning beside them, never alone. Was under the readiness line; the
 * owner cut that line (28 Oct, review part 1: "Readiness line" — "don't use and wouldn't miss"), and this warning stays.
 */

import { useMemo, useState } from "react";
import { useBand } from "../lib/band-client";
import { nights } from "../lib/sleep";
import { readiness } from "../lib/readiness";
import { heartSigns, nightCheck } from "../lib/nightcheck";
import { NightRows } from "./NightCheck";
import { useStore } from "../lib/store";
import { localDay } from "../lib/time";

export function NightCheckAsk({ now }: { now: number }) {
  const band = useBand().data, entries = useStore((s) => s.entries);
  const day = localDay(now);
  const [open, setOpen] = useState(false);
  const rating = useMemo(() => entries.find((e) => e.kind === "sleep" && localDay(e.at) === day && e.rating != null) as { rating?: number } | undefined, [entries, day])?.rating;
  const sets = useMemo(() => entries.filter((e): e is Extract<typeof e, { kind: "set" }> => e.kind === "set"), [entries]);
  const nc = useMemo(() => {
    if (!band) return null;
    const r = readiness(day, nights(band.sleep, band.hr, band.rhr, band.hrv), rating, sets, now, { hrv: band.hrv, rhr: band.rhr });
    return r ? nightCheck(day, band, heartSigns(r)) : null;
  }, [band, day, rating, sets, now]);
  if (!nc?.line) return null;
  return (
    <section className="card nightask" aria-label="Last night's check">
      <h3>Last night's check</h3>
      <p className="rd-night">{nc.line}</p>
      <button type="button" className="linkish" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Less" : "All three against your usual"}</button>
      {open && <NightRows c={nc} />}
    </section>
  );
}
