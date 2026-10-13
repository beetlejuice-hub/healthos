/**
 * What the grey band on heart rate is, in words (PLAN 78; owner, 13 Oct: "is this supposed to be the average band? Looks a
 * bit weird, i just want explanation like why we have this, what reason it has, based on what it works … dont remove
 * this"). Under the Timeline and the Heart page's day chart; says how much of the day has a band so far.
 */

import { USUAL_MIN_DAYS, type Usual } from "../lib/hrusual";

export function UsualBandWhy({ usual }: { usual: Usual | null }) {
  const have = usual ? usual.slots.filter((s) => s != null).length : 0, all = usual?.slots.length ?? 96;
  return (
    <details className="usual-why">
      <summary>What's the grey band on heart rate?</summary>
      <p><b>Your usual for that time of day</b> — so a number means something: 72 bpm is high for you at 3 am and ordinary at 6 pm.</p>
      <p>How it's made: for each quarter hour, each of your last 14 days (not today, and not training or the hour after it) gives
        one number — its average heart rate around that time. The band is the middle 60 % of those days, never narrower than
        ±3 bpm; the dashed line is the middle day. Above the band the line turns red, below it blue, inside it grey.</p>
      <p data-have={have}>A time of day needs {USUAL_MIN_DAYS} days with readings around it before it gets a band — so far {have} of {all} quarter
        hours have one{have < all ? "; the rest fill in as the band collects more days, and it gets steadier the more there are" : ""}.
        Where there's no band yet, the line is grey: nothing to compare with.</p>
    </details>
  );
}
