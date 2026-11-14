import { describe, expect, it } from "vitest";
import { zone2Line, zone2Weeks } from "./zone2";
import type { HrMinute } from "./band";

// Item 8 (owner, 14 Nov): zone-2 minutes a week. Max 186: zone 2 is 111.6–130.2 bpm.
const NOW = new Date("2026-11-13T18:00:00").getTime(); // a Friday
const mins = (from: number, n: number, bpm: number): HrMinute[] => Array.from({ length: n }, (_, i) => [from + i * 60_000, bpm, bpm - 2, bpm + 2]);
const day = (d: string, h: string) => new Date(`2026-11-${d}T${h}:00`).getTime();

describe("zone-2 minutes a week", () => {
  it("only minutes at 60–70 % of max count, in or out of a workout; each in its own week", () => {
    const hr = [...mins(day("10", "07:00"), 40, 120), ...mins(day("10", "08:00"), 30, 140), ...mins(day("10", "09:00"), 30, 100), ...mins(day("03", "07:00"), 25, 125)];
    const ws = zone2Weeks(hr, 186, NOW);
    expect(ws).toHaveLength(8);
    expect(ws.at(-1)!.min).toBe(40); // 140 is zone 3, 100 is under zone 2
    expect(ws.at(-2)!.min).toBe(25);
  });
  it("how much of the week the band saw: a week with few readings isn't a week of no zone 2", () => {
    const ws = zone2Weeks(mins(day("10", "07:00"), 60, 120), 186, NOW);
    expect(ws.at(-1)!.seen).toBeLessThan(0.05);
    expect(zone2Line(ws).seenWell).toBe(false);
  });
  it("the usual: weeks before the band saw well, 2 at least", () => {
    // every minute of the three weeks before, at rest, plus 100 zone-2 minutes in each
    const hr: HrMinute[] = [];
    for (const d of [-21, -14, -7]) { const w0 = new Date("2026-11-09T00:00:00").getTime() + d * 864e5; for (let t = w0; t < w0 + 7 * 864e5; t += 60_000) hr.push([t, t - w0 < 100 * 60_000 ? 120 : 60, 58, 62]); }
    const l = zone2Line(zone2Weeks(hr, 186, NOW));
    expect(l.usual).toBe(100);
    expect(l.now).toBe(0);
  });
});
