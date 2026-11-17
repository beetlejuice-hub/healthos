import { describe, expect, it } from "vitest";
import { ledgerAdd, ledgerAsOf, mineIn } from "./ledger";

describe("the server's AI ledger", () => {
  it("adds each account's spend and every account's together; a tool round costs but isn't a call", () => {
    let l = ledgerAdd(null, { day: "2026-11-17", user: "a", usd: 0.5, call: true });
    l = ledgerAdd(l, { day: "2026-11-17", user: "a", usd: 0.25, call: false });
    l = ledgerAdd(l, { day: "2026-11-17", user: "b", usd: 1, call: true });
    expect(l.total).toBeCloseTo(1.75);
    expect(mineIn(l, "a", "2026-11-17")).toEqual({ usd: 0.75, calls: 1, dayUsd: 0.75 });
    expect(mineIn(l, "c", "2026-11-17")).toEqual({ usd: 0, calls: 0, dayUsd: 0 });
  });
  it("a new day starts the calls again; a new month everything", () => {
    const l = ledgerAdd(ledgerAdd(null, { day: "2026-11-17", user: "a", usd: 2, call: true }), { day: "2026-11-18", user: "a", usd: 1, call: true });
    expect(mineIn(l, "a", "2026-11-18")).toEqual({ usd: 3, calls: 1, dayUsd: 1 });
    expect(ledgerAsOf(l, "2026-12-01")).toEqual({ month: "2026-12", total: 0, users: {} });
  });
  it("a nonsense cost adds nothing", () => {
    expect(ledgerAdd(null, { day: "2026-11-17", user: "a", usd: Number.NaN, call: true }).total).toBe(0);
    expect(ledgerAdd(null, { day: "2026-11-17", user: "a", usd: -5, call: true }).total).toBe(0);
  });
});
