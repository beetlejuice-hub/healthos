// PLAN 212 — places on their own (Overland → the Worker). A planted day of points: home until 08:30, a 3 km walk, work
// 09:00–17:00, a walk back, home. Known answers: two places and two walks; home is where 3 a.m. finds you; the day's
// numbers in the phone's time zone. Controls: a post that isn't Overland's; points too inaccurate; points jittering around
// home all day — one visit, no trips.
import { describe, expect, it } from "vitest";
import { fromOverland, segments, summarize, thin, type Pt } from "./placepoints";

const HOME = [47.4979, 19.0402], WORK = [47.5249, 19.0402]; // 3 km north
const feat = (t: string, ll: number[], motion: string[] = [], acc = 10) => ({ type: "Feature", geometry: { type: "Point", coordinates: [ll[1], ll[0]] }, properties: { timestamp: t, horizontal_accuracy: acc, motion } });
/** One day, a point a minute, UTC times for a phone in Budapest (UTC+1): local 00:00 is 23:00 UTC the day before. */
function day(d = "2026-11-02") {
  const out: ReturnType<typeof feat>[] = [], t0 = Date.parse(`${d}T00:00:00+01:00`), at = (m: number) => new Date(t0 + m * 60_000).toISOString();
  const jit = (ll: number[], k: number) => [ll[0] + ((k * 7) % 5 - 2) * 0.00002, ll[1] + ((k * 3) % 5 - 2) * 0.00002];
  for (let m = 0; m < 510; m++) out.push(feat(at(m), jit(HOME, m), ["stationary"]));
  for (let m = 510; m < 540; m++) { const f = (m - 510) / 30; out.push(feat(at(m), [HOME[0] + (WORK[0] - HOME[0]) * f, HOME[1]], ["walking"])); }
  for (let m = 540; m < 1020; m++) out.push(feat(at(m), jit(WORK, m), ["stationary"]));
  for (let m = 1020; m < 1050; m++) { const f = (m - 1020) / 30; out.push(feat(at(m), [WORK[0] + (HOME[0] - WORK[0]) * f, HOME[1]], ["walking"])); }
  for (let m = 1050; m < 1440; m++) out.push(feat(at(m), jit(HOME, m), ["stationary"]));
  return out;
}

describe("places on their own (PLAN 212)", () => {
  it("Overland's post: its points, how you moved; too inaccurate ones left out", () => {
    const { pts, error } = fromOverland({ locations: [feat("2026-11-02T08:00:00Z", HOME, ["walking"]), feat("2026-11-02T08:01:00Z", HOME, [], 500), feat("2026-11-02T08:02:00Z", WORK, ["driving", "stationary"])] });
    expect(error).toBeUndefined();
    expect(pts).toEqual([[Date.parse("2026-11-02T08:00:00Z") / 1000, 4749790, 1904020, 2], [Date.parse("2026-11-02T08:02:00Z") / 1000, 4752490, 1904020, 5]]);
  });
  it("thinned to a point every 3 minutes, a moving one kept over a still one", () => {
    const p = (sec: number, m: number): Pt => [sec, 1, 1, m];
    // 0 (still) gives way to 60 (walking); 120 and 200 are within 3 minutes of it; 250 is past
    const out = thin([p(0, 1)], [p(60, 2), p(120, 1), p(200, 1), p(250, 1)]);
    expect(out).toEqual([p(60, 2), p(250, 1)]);
  });
  it("a planted day: home, a 3 km walk, work 8 h, the walk back — in Budapest's time zone", () => {
    const { pts } = fromOverland({ locations: day() });
    const s = summarize(thin([], pts), -60, 0)!;
    const d = s.days["2026-11-02"];
    expect(d.places).toBe(1);
    expect(d.km).toBeGreaterThan(5.5); expect(d.km).toBeLessThan(6.5);
    expect(d.activeMin).toBeGreaterThanOrEqual(50); expect(d.activeMin).toBeLessThanOrEqual(66);
    expect(d.awayH).toBeGreaterThan(8.5); expect(d.awayH).toBeLessThan(9.5);
    expect(d.awayNight).toBe(false);
    expect(s.top[0].home).toBe(true);
    expect(s.top.length).toBe(2);
  });
  it("controls: not Overland's; all points too inaccurate; a day at home — one visit, no trips", () => {
    expect(fromOverland({ foo: 1 }).error).toMatch(/no locations/);
    expect(fromOverland({ locations: [feat("2026-11-02T08:00:00Z", HOME, [], 900)] }).pts).toEqual([]);
    const home = day().filter((f) => f.properties.motion[0] === "stationary" && Math.abs(f.geometry.coordinates[1] - HOME[0]) < 0.001);
    const seg = segments(thin([], fromOverland({ locations: home }).pts));
    expect(seg.moves).toEqual([]);
    expect(new Set(seg.visits.map((v) => v.id)).size).toBe(1);
  });
});
