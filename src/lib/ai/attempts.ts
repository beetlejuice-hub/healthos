/**
 * The background calls (the reads, the week read, the deep dive, a verdict, the questions), never silent (owner, 22 Oct: "i
 * did not get the morning digest today and i miss it"). A failed one used to be dropped and not tried again until the app
 * was closed, and opening the app sent up to four research calls at once. Now: one at a time, in the order asked (the
 * morning read first); a failed one is tried again after 2, 10 then 30 minutes — not when trying again can't help (the
 * day's cap, no key); and each failure is kept for Settings → AI so "it didn't come" has an answer.
 */

import { useSyncExternalStore } from "react";

export const RETRY = { afterMin: [2, 10, 30], never: ["cap", "no-key", "bad-key"] } as const;

/** `fails`: failed tries so far this session; `at`: when the last one ended. */
export type Attempt = { fails: number; at: number; running?: boolean; done?: boolean; error?: string; message?: string };

/** When the next try may go, or null: none after the last wait, or after an error trying again can't fix. Pure. */
export function nextTry(a: Attempt): number | null {
  if (!a.fails || a.done || a.running) return null;
  if ((RETRY.never as readonly string[]).includes(a.error ?? "") || a.fails > RETRY.afterMin.length) return null;
  return a.at + RETRY.afterMin[a.fails - 1] * 60_000;
}

/** Whether a call may go now: never tried this session, or its wait is over. Pure. */
export function mayTry(a: Attempt | undefined, now: number): boolean {
  if (!a) return true;
  const t = nextTry(a);
  return t != null && now >= t;
}

const attempts = new Map<string, Attempt>();
const subs = new Set<() => void>();
let version = 0;
const changed = () => { version++; subs.forEach((f) => f()); };
export const attemptOf = (key: string): Attempt | undefined => attempts.get(key);
/** Re-renders when any attempt changes. */
export function useAttempt(key: string): Attempt | undefined {
  useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => version);
  return attempts.get(key);
}

/** Look again when a wait is over (useAiAuto's tick). */
const wakers = new Set<() => void>();
export function onRetryDue(f: () => void): () => void { wakers.add(f); return () => { wakers.delete(f); }; }

let queue: Promise<unknown> = Promise.resolve();

type Failed = { ok: false; error: string; message: string };
/**
 * Run a background call under `key`: skipped while one runs, once it's done, or while its wait isn't over. `f` returns null
 * when there turned out to be nothing to do, or the call's result. `queued`: behind the others (false for a tap — it goes now).
 * `onFail`: keep the failure (Settings → AI).
 */
export async function attempt(key: string, f: () => Promise<{ ok: true } | Failed | null>, { queued = true, onFail }: { queued?: boolean; onFail?: (r: Failed) => void } = {}): Promise<Failed | null> {
  const a = attempts.get(key);
  if (!mayTry(a, Date.now())) return null;
  attempts.set(key, { fails: a?.fails ?? 0, at: Date.now(), running: true });
  changed();
  const run = async () => { try { return await f(); } catch (e) { return { ok: false as const, error: "app", message: e instanceof Error ? e.message : String(e) }; } };
  const p = queued ? queue.then(run) : run();
  if (queued) queue = p;
  const r = await p;
  if (!r || r.ok) { attempts.set(key, { fails: a?.fails ?? 0, at: Date.now(), done: true }); changed(); return null; }
  const next: Attempt = { fails: (a?.fails ?? 0) + 1, at: Date.now(), error: r.error, message: r.message };
  attempts.set(key, next);
  changed();
  onFail?.(r);
  const t = nextTry(next);
  if (t != null) setTimeout(() => wakers.forEach((w) => w()), t - Date.now() + 1000);
  return r;
}

/** "Try again" (a tap): forget the waits, go now. */
export function tryNow(key: string, f: Parameters<typeof attempt>[1], onFail?: (r: Failed) => void) {
  const a = attempts.get(key);
  if (a?.running) return Promise.resolve(null);
  attempts.delete(key);
  return attempt(key, f, { queued: false, onFail });
}

/** For tests: a fresh session. */
export function resetAttempts() { attempts.clear(); queue = Promise.resolve(); changed(); }
