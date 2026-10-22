import { afterEach, describe, expect, it, vi } from "vitest";
import { attempt, attemptOf, mayTry, nextTry, resetAttempts, tryNow } from "./attempts";

// Owner, 22 Oct: "i did not get the morning digest today and i miss it" — a failed read was dropped for the session.
const MIN = 60_000, T = Date.UTC(2026, 9, 22, 6, 30);
const busy = { ok: false as const, error: "busy", message: "The AI is busy — try again in a minute." };

describe("a failed background call is tried again", () => {
  afterEach(() => { resetAttempts(); vi.useRealTimers(); });

  it("after 2, 10 then 30 minutes; then not again this session", () => {
    expect(mayTry(undefined, T)).toBe(true);
    const at = (fails: number) => nextTry({ fails, at: T, error: "busy" });
    expect([1, 2, 3, 4].map(at)).toEqual([T + 2 * MIN, T + 10 * MIN, T + 30 * MIN, null]);
    expect(mayTry({ fails: 1, at: T, error: "busy" }, T + 2 * MIN - 1)).toBe(false);
    expect(mayTry({ fails: 1, at: T, error: "busy" }, T + 2 * MIN)).toBe(true);
  });

  it("not when trying again can't help: the day's cap, no key, a rejected key", () => {
    for (const error of ["cap", "no-key", "bad-key"]) expect(nextTry({ fails: 1, at: T, error })).toBeNull();
    expect(nextTry({ fails: 1, at: T, error: "bad-answer" })).toBe(T + 2 * MIN);
  });

  it("never twice at once, never again once done", () => {
    expect(mayTry({ fails: 0, at: T, running: true }, T + 60 * MIN)).toBe(false);
    expect(mayTry({ fails: 2, at: T, done: true }, T + 60 * MIN)).toBe(false);
  });

  it("one at a time, in the order asked; a failure is kept and waits; Try again goes now", async () => {
    vi.useFakeTimers({ now: T, toFake: ["Date"] });
    const order: string[] = [];
    let open = 0, most = 0;
    const call = (name: string, r: typeof busy | { ok: true }) => async () => { open++; most = Math.max(most, open); order.push(name); await new Promise((ok) => setTimeout(ok, 5)); open--; return r; };
    const fails: string[] = [];
    await Promise.all([
      attempt("digest:d", call("digest", busy), { onFail: (r) => fails.push(r.error) }),
      attempt("review:w", call("review", { ok: true })),
      attempt("dive:k", call("dive", { ok: true })),
    ]);
    expect(order).toEqual(["digest", "review", "dive"]);
    expect(most).toBe(1);
    expect(fails).toEqual(["busy"]);
    expect(attemptOf("digest:d")).toMatchObject({ fails: 1, error: "busy" });
    // the next tick, a minute on: still waiting; done ones never again
    vi.setSystemTime(T + MIN);
    expect(await attempt("digest:d", call("digest", { ok: true }))).toBeNull();
    expect(await attempt("review:w", call("review", { ok: true }))).toBeNull();
    expect(order).toEqual(["digest", "review", "dive"]);
    // a tap: now
    await tryNow("digest:d", call("digest", { ok: true }));
    expect(order).toEqual(["digest", "review", "dive", "digest"]);
    expect(attemptOf("digest:d")).toMatchObject({ done: true });
  });

  it("an error thrown in the app is a failure like any other, not a stuck queue", async () => {
    await attempt("a", async () => { throw new Error("boom"); });
    expect(attemptOf("a")).toMatchObject({ fails: 1, error: "app", message: "boom" });
    let ran = false;
    await attempt("b", async () => { ran = true; return { ok: true }; });
    expect(ran).toBe(true);
  });
});
