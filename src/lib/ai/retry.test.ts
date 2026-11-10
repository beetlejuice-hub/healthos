// PLAN 202 — owner, 10 Nov, a screenshot of "Kept as a note. Couldn't reach the app's server. (no-server)": "Fix this".
// A call that drops (the app sent to the background, a network blip) is sent again once the app is on screen and
// online; controls: one that works isn't sent twice, one stopped on purpose (the 5-minute timeout) isn't retried, and
// a server that's really gone gives up after 3 tries and says how long and that the app was in the background.
import { describe, expect, it } from "vitest";
import { droppedWords, RETRY, withRetry, type RetryEnv } from "./retry";

function env(o: { hiddenUntil?: number; aborted?: boolean } = {}) {
  let t = 0;
  const e: RetryEnv & { t: () => number } = {
    t: () => t, now: () => t, aborted: () => !!o.aborted,
    hidden: () => t < (o.hiddenUntil ?? 0), usable: () => t >= (o.hiddenUntil ?? 0),
    sleep: async (ms) => { t += ms; },
  };
  return e;
}

describe("a dropped call is sent again", () => {
  it("dropped while the app was in the background: waits until it's back, then gets through", async () => {
    const e = env({ hiddenUntil: 30_000 });
    let n = 0;
    const r = await withRetry(async () => { n++; if (n === 1) throw new TypeError("Load failed"); if (e.t() < 30_000) throw new TypeError("Load failed"); return "answer"; }, e);
    expect(r).toEqual({ ok: true, value: "answer" });
    expect(n).toBe(2); // the second try waited for the screen
    expect(e.t()).toBeGreaterThanOrEqual(30_000);
  });
  it("control: one that works is sent once", async () => {
    let n = 0;
    expect(await withRetry(async () => { n++; return 1; }, env())).toEqual({ ok: true, value: 1 });
    expect(n).toBe(1);
  });
  it("control: stopped on purpose (the timeout) isn't retried", async () => {
    let n = 0;
    const r = await withRetry(async () => { n++; throw new DOMException("aborted", "AbortError"); }, env({ aborted: true }));
    expect(n).toBe(1);
    expect(r.ok === false && r.dropped.aborted).toBe(true);
  });
  it("a server that's really gone: 3 tries, then what it took, in words", async () => {
    let n = 0;
    const r = await withRetry(async () => { n++; throw new TypeError("Load failed"); }, env({ hiddenUntil: 10_000 }));
    expect(n).toBe(RETRY.tries);
    if (r.ok) throw new Error("should fail");
    expect(droppedWords(r.dropped)).toMatch(/^3 tries over \d+ s, the app was in the background$/);
    expect(droppedWords({ tries: 3, secs: 5, hidden: false, aborted: false })).toBe("3 tries over 5 s");
  });
});
