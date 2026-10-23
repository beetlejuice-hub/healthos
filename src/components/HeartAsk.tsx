/**
 * The app's heart-rate asks on Today too (owner, 22 Oct: "App can ask about the unusually high or low heart bpm too like
 * what were you doing in this time frame and it can connect event to it and track. In the today page"): the newest open
 * one from the last day — up or down — with the same answers as in the AI tab. The answer is saved as what you were doing
 * in the middle of the stretch, so it explains it on the Heart page, in the grids and for the AI; the next one, if any,
 * comes up after it.
 */

import { useStore } from "../lib/store";
import { HOUR } from "../lib/time";
import { InboxCard } from "./Inbox";

export function HeartAsk({ now }: { now: number }) {
  const inbox = useStore((s) => s.ai.inbox);
  const n = [...(inbox ?? [])].reverse().find((x) => x.span && !x.reply && !x.closed && x.at >= now - 24 * HOUR);
  return n ? <div className="heart-ask"><InboxCard key={n.id} n={n} now={now} /></div> : null;
}
