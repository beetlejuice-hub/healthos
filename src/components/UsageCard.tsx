/**
 * Settings → What you use (owner, 14 Nov, item 15: "good idea but lmk before deleting"). The cards used most on this
 * phone, and the ones seen often for two weeks and never touched — the list to talk about, never removed by itself.
 */

import { useMemo } from "react";
import { report, USAGE } from "../lib/usage";
import { resetUsage, useUsage } from "../lib/usage-client";
import { dayLabel } from "../lib/time";

export function UsageCard({ now }: { now: number }) {
  const u = useUsage();
  const r = useMemo(() => report(u, now), [u, now]);
  return (
    <div className="card usagecard" id="usage">
      <h3>What you use <span className="note">this phone only, never sent anywhere</span></h3>
      {r.since == null ? <p className="note">Counting from now: which cards you open and tap, and which you scroll past.</p> : <>
        <p className="note">Since {dayLabel(r.since)}. A card counts as seen when it's on screen for a second, and as used when you tap in it or open it.</p>
        {r.used.length > 0 && <><b className="uc-h">Used most</b>
          <ul className="uc-list">{r.used.slice(0, 8).map((x) => <li key={x.key} data-key={x.key}><span>{x.key}</span><small>{x.used} tap{x.used === 1 ? "" : "s"} · seen {x.seen}×</small></li>)}</ul></>}
        <b className="uc-h">Never touched</b>
        {r.quiet.length ? <ul className="uc-list quiet">{r.quiet.slice(0, 10).map((x) => <li key={x.key} data-key={x.key}><span>{x.key}</span><small>seen {x.seen}×, never used</small></li>)}</ul>
          : <p className="note">Nothing yet: a card shows here after it's been seen {USAGE.quietSeen} times over {USAGE.quietDays} days without a tap.</p>}
        <p className="note">Nothing is removed by itself: these are the ones to talk about.</p>
        <button type="button" className="pill-btn" onClick={() => { if (window.confirm("Start counting again from now?")) resetUsage(); }}>Count again from now</button>
      </>}
    </div>
  );
}
