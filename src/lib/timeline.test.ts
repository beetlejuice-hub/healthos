// PLAN 210 — a Google Maps Timeline file (JSON), both shapes. Known files, known answers.
import { describe, expect, it } from "vitest";
import { parseTimeline, placeDays } from "./timeline";

/** Three days: home overnight; day 1 at work 9–17 with a 3 km walk each way; day 2 a trip to another city, the night away. */
const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).toISOString();
const segsNew = [
  { startTime: at(1, 0), endTime: at(1, 8, 30), visit: { topCandidate: { placeId: "HOME1", semanticType: "HOME", placeLocation: { latLng: "47.4979°, 19.0402°" } } } },
  { startTime: at(1, 8, 30), endTime: at(1, 9), activity: { distanceMeters: 3000, topCandidate: { type: "WALKING" } } },
  { startTime: at(1, 9), endTime: at(1, 17), visit: { topCandidate: { placeId: "WORK", semanticType: "WORK", placeLocation: { latLng: "47.51°, 19.06°" } } } },
  { startTime: at(1, 17), endTime: at(1, 17, 30), activity: { distanceMeters: 3000, topCandidate: { type: "WALKING" } } },
  { startTime: at(1, 17, 30), endTime: at(2, 10), visit: { topCandidate: { placeId: "HOME1", semanticType: "HOME", placeLocation: { latLng: "47.4979°, 19.0402°" } } } },
  { startTime: at(2, 10), endTime: at(2, 12, 30), activity: { distanceMeters: 210000, topCandidate: { type: "IN_PASSENGER_VEHICLE" } } },
  { startTime: at(2, 12, 30), endTime: at(3, 11), visit: { topCandidate: { placeId: "HOTEL", semanticType: "UNKNOWN", placeLocation: { latLng: "46.25°, 20.15°" } } } },
  { startTime: at(1, 0), endTime: at(1, 1), timelinePath: [{ point: "47.49°, 19.04°" }] },
];
const segsOld = segsNew.filter((s) => !("timelinePath" in s)).map((s) => ("visit" in s && s.visit ? { startTime: s.startTime, endTime: s.endTime, visit: { topCandidate: { placeID: s.visit.topCandidate.placeId, semanticType: s.visit.topCandidate.semanticType === "HOME" ? "Home" : "Unknown", placeLocation: `geo:${s.visit.topCandidate.placeLocation.latLng.replace(/°/g, "").replace(" ", "")}` } } }
  : { startTime: s.startTime, endTime: s.endTime, activity: { distanceMeters: String(s.activity!.distanceMeters), topCandidate: { type: s.activity!.topCandidate.type.toLowerCase() } } }));

describe("Google Maps Timeline (PLAN 210)", () => {
  for (const [name, file] of [["the newer export", { semanticSegments: segsNew }], ["the iPhone's array", segsOld]] as const) {
    it(`${name}: away hours, km, walking, places, a night away; home first in your top places`, () => {
      const t = parseTimeline(file);
      expect(t.error).toBeUndefined();
      const p = placeDays(t.visits, t.moves);
      expect(p.home).toBe("HOME1");
      expect(p.days["2026-11-01"]).toEqual({ awayH: 9, km: 6, activeMin: 60, places: 1, awayNight: false });
      expect(p.days["2026-11-02"]).toMatchObject({ km: 210, activeMin: 0, places: 1, awayNight: false });
      expect(p.days["2026-11-02"].awayH).toBeCloseTo(14, 1);
      expect(p.days["2026-11-03"]).toMatchObject({ awayNight: true, places: 1 });
      expect(p.top[0]).toMatchObject({ id: "HOME1", home: true, visits: 2, lat: 47.4979 });
    });
  }
  it("control: not a Timeline — says so", () => {
    expect(parseTimeline({ locations: [] }).error).toMatch(/Not a Google Maps Timeline export/);
    expect(parseTimeline([]).error).toMatch(/no visits or trips/);
  });
});
