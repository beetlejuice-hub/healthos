/**
 * A call whose connection dropped is tried again (PLAN 202; owner, 10 Nov, a screenshot of "Kept as a note. Couldn't
 * reach the app's server. (no-server)": "Fix this"). On a phone the request to the Worker fails outright — no answer, no
 * code — when the app goes to the background, the screen locks or the network blips during a long AI answer. So: wait
 * until the app is on screen and online again (2 minutes at most), then send it again, up to 3 tries in all. A call that
 * was stopped on purpose (the 5-minute timeout) isn't retried. What it took is said back, for the error's words. Pure.
 */

export const RETRY = { tries: 3, waitMs: 120_000, gapMs: 1500, pollMs: 1000 } as const;

/** How a call that never got through went: tries made, seconds from the first, and whether the app was off screen. */
export type Dropped = { tries: number; secs: number; hidden: boolean; aborted: boolean };

export type RetryEnv = { aborted: () => boolean; usable: () => boolean; hidden: () => boolean; sleep: (ms: number) => Promise<void>; now: () => number };

export async function withRetry<T>(send: () => Promise<T>, env: RetryEnv): Promise<{ ok: true; value: T } | { ok: false; dropped: Dropped }> {
  const t0 = env.now();
  let hidden = env.hidden();
  for (let tries = 1; ; tries++) {
    try {
      return { ok: true, value: await send() };
    } catch {
      hidden ||= env.hidden();
      const dropped = { tries, secs: Math.round((env.now() - t0) / 1000), hidden, aborted: env.aborted() };
      if (dropped.aborted || tries >= RETRY.tries) return { ok: false, dropped };
      // back on screen and online (or 2 minutes), then a moment more
      const until = env.now() + RETRY.waitMs;
      while (!env.usable() && env.now() < until && !env.aborted()) { hidden = true; await env.sleep(RETRY.pollMs); }
      await env.sleep(RETRY.gapMs * tries);
    }
  }
}

/** The words after the code: "3 tries over 48 s, the app was in the background". */
export const droppedWords = (d: Dropped) => `${d.tries} ${d.tries === 1 ? "try" : "tries"} over ${d.secs} s${d.hidden ? ", the app was in the background" : ""}`;
