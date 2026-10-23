/**
 * Where today's morning read is, while it isn't on Today (owner, 22 Oct: "i did not get the morning digest today and i miss
 * it" — a failed read used to leave nothing at all): being written; didn't come through, why, when it tries again, and
 * Try again; or waiting for last night (before 11:00, until the band's night or your sleep rating is in).
 */

import { useAiStatus } from "../lib/ai/client";
import { nextTry, RETRY, useAttempt, type Attempt } from "../lib/ai/attempts";
import { eveningOf } from "../lib/ai/nightread";
import { digestDue, freshRead, MORNING, nightIn } from "../lib/ai/morning";
import { bandSettled, useBand } from "../lib/band-client";
import { useStore } from "../lib/store";
import { addDays, clock, localDay } from "../lib/time";

export function ReadPending({ onRetry }: { onRetry: (day: string) => void }) {
  const { on } = useAiStatus();
  const now = Date.now(), today = localDay(now), h = new Date(now).getHours();
  const a = useAttempt(`digest:${today}`);
  const digest = useStore((s) => s.ai.digest);
  const rated = useStore((s) => s.entries.some((e) => e.kind === "sleep" && e.rating != null && localDay(e.at) === today));
  const sleep = useBand().data?.sleep;
  if (!on || (digest?.day === today && freshRead(digest))) return null;
  const tried = said(a);
  if (tried) return <Note label="Morning read" a={a!} line={tried} onRetry={() => onRetry(today)} />;
  if (bandSettled() && h >= MORNING.from && h < MORNING.latest && !digestDue(now, digest, nightIn(sleep, rated, now)))
    return <Note label="Morning read" line={`comes once last night is in — rate your sleep to have it now, or it comes at ${MORNING.latest}:00.`} />;
  return null;
}

/**
 * The same for the night read (owner, 22 Oct, 23:47: "no night digest so far…i miss it" — it was waiting behind the deep
 * dive, and nothing said so): being written, or didn't come, why, and Try again. Tonight's, or last night's caught up in
 * the morning.
 */
export function NightPending({ onRetry }: { onRetry: (day: string) => void }) {
  const { on } = useAiStatus();
  const now = Date.now(), tonight = eveningOf(now), before = addDays(localDay(now), -1);
  const a = useAttempt(`night:${tonight}:`), b = useAttempt(`night:${before}:`);
  const night = useStore((s) => s.ai.night);
  const [day, at] = said(a) || !said(b) ? [tonight, a] : [before, b];
  const tried = said(at);
  if (!on || !tried || night?.day === day) return null;
  return <Note label="Your day, read back" a={at!} line={tried} onRetry={() => onRetry(day)} />;
}

/** What an attempt says: being written, or didn't come through — why, and when it tries again. */
function said(a: Attempt | undefined): string | null {
  if (a?.running) return "writing it now…";
  if (!a?.fails) return null;
  const next = nextTry(a);
  return `didn't come through. ${a.message ?? "The AI couldn't answer."}${next ? ` Trying again at ${clock(next)}.` : ""}`;
}

function Note({ label, a, line, onRetry }: { label: string; a?: Attempt; line: string; onRetry?: () => void }) {
  const retry = !!a?.fails && !a.running && !(RETRY.never as readonly string[]).includes(a.error ?? "");
  return (
    <section className="card mr-pending" aria-label={label} data-state={a?.running ? "writing" : a?.fails ? "failed" : "waiting"}>
      <p><span className="k">{label}</span> {line}</p>
      {retry && onRetry && <button type="button" className="linkish" onClick={onRetry}>Try again</button>}
    </section>
  );
}
