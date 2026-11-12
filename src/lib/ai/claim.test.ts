import { describe, expect, it } from "vitest";
import { deviceName, mayWrite, newerRead } from "./claim";

describe("one read a day (PLAN 215)", () => {
  const t = Date.parse("2026-11-12T07:00:00Z");
  it("the first device to claim the day writes it; another waits half an hour for it to sync over", () => {
    expect(mayWrite(null, "phone", t)).toBe(true);
    expect(mayWrite({ device: "phone", at: t }, "phone", t + 60_000)).toBe(true);
    expect(mayWrite({ device: "phone", at: t }, "laptop", t + 10 * 60_000)).toBe(false);
    expect(mayWrite({ device: "phone", at: t }, "laptop", t + 31 * 60_000)).toBe(true);
  });
  it("of two copies of a read the newer wins — yesterday's never goes back over today's", () => {
    const y = { day: "2026-11-11", at: t - 86_400_000 }, today = { day: "2026-11-12", at: t }, later = { day: "2026-11-12", at: t + 5 };
    expect(newerRead(today, y)).toBe(today);
    expect(newerRead(y, today)).toBe(today);
    expect(newerRead(today, later)).toBe(later);
    expect(newerRead(null, y)).toBe(y);
  });
  it("names the device", () => {
    expect(deviceName("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe("iPhone");
    expect(deviceName("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe("Mac");
  });
});
