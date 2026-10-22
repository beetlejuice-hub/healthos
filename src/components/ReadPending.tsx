/**
 * Where today's morning read is, while it isn't on Today (owner, 22 Oct: "i did not get the morning digest today and i miss
 * it" — a failed read used to leave nothing at all): being written; didn't come through, why, when it tries again, and
 * Try again; or waiting for last night (before 11:00, until the band's night or your sleep rating is in).
 */

import { useAiStatus } from "../lib/ai/client";
import { nextTry, RETRY, useAttempt } from "../lib/ai/attempts";
import { digestDue, freshRead, MORNING, nightIn } from "../lib/ai/morning";
import { bandSettled, useBand } from "../lib/band-client";
import { useStore } from "../lib/store";
import { clock, localDay } from "../lib/time";

export function ReadPending({ onRetry }: { onRetry: (day: string) => void }) {
  const { on } = useAiStatus();
  const now = Date.now(), today = localDay(now), h = new Date(now).getHours();
  const a = useAttempt(`digest:${today}`);
  const digest = useStore((s) => s.ai.digest);
  const rated = useStore((s) => s.entries.some((e) => e.kind === "sleep" && e.rating != null && localDay(e.at) === today));
  const sleep = useBand().data?.sleep;
  if (!on || (digest?.day === today && freshRead(digest))) return null;
  let line: string, retry = false;
  if (a?.running) line = "writing it now…";
  else if (a?.fails) {
    const next = nextTry(a);
    retry = !(RETRY.never as readonly string[]).includes(a.error ?? "");
    line = `didn't come through. ${a.message ?? "The AI couldn't answer."}${next ? ` Trying again at ${clock(next)}.` : ""}`;
  } else if (bandSettled() && h >= MORNING.from && h < MORNING.latest && !digestDue(now, digest, nightIn(sleep, rated, now)))
    line = `comes once last night is in — rate your sleep to have it now, or it comes at ${MORNING.latest}:00.`;
  else return null;
  return (
    <section className="card mr-pending" aria-label="Morning read" data-state={a?.running ? "writing" : a?.fails ? "failed" : "waiting"}>
      <p><span className="k">Morning read</span> {line}</p>
      {retry && <button type="button" className="linkish" onClick={() => onRetry(today)}>Try again</button>}
    </section>
  );
}
