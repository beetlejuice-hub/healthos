// PLAN 210 — bring in: Aranet4 bedroom air (CSV) and Google Maps Timeline (JSON). Known files, known answers.
import { describe, expect, it } from "vitest";
import { airNights, parseAranet } from "./airimport";
import { parseTimeline, placeDays } from "./timeline";

const pad = (n: number) => String(n).padStart(2, "0");
/** An Aranet export: every 10 minutes from 20:00 on 9 Nov to 09:00 on 11 Nov; CO₂ climbs through each night. */
function aranet(order: "dmy" | "mdy" | "iso", sep = ",") {
  const head = order === "iso" ? "Time(YYYY-MM-DD HH:mm:ss)" : order === "dmy" ? "Time(dd/mm/yyyy)" : "Time(mm/dd/yyyy)";
  const out = [[head, "Carbon dioxide(ppm)", "Temperature(°C)", "Relative humidity(%)", "Atmospheric pressure(hPa)"].join(sep)];
  for (let t = new Date(2026, 10, 9, 20).getTime(); t <= new Date(2026, 10, 11, 9).getTime(); t += 600_000) {
    const d = new Date(t), h = d.getHours(), night = h >= 22 || h < 7;
    const co2 = night ? 600 + (h >= 22 ? (h - 22) * 60 + d.getMinutes() : (h + 2) * 60 + d.getMinutes()) * 2 : 500;
    const date = order === "iso" ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(h)}:${pad(d.getMinutes())}:00` : order === "dmy" ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(h)}:${pad(d.getMinutes())}:00` : `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()} ${h % 12 || 12}:${pad(d.getMinutes())}:00 ${h < 12 ? "AM" : "PM"}`;
    out.push([date, String(Math.round(co2)), sep === ";" ? "19,5" : "19.5", "45", "1012"].join(sep));
  }
  return out.join("\n");
}

describe("Aranet CSV (PLAN 210)", () => {
  for (const [o, sep] of [["dmy", ","], ["mdy", ","], ["iso", ","], ["dmy", ";"]] as const) {
    it(`${o}${sep === ";" ? ", semicolons and decimal commas" : ""}: two nights, by the morning they ended, CO₂ rising through each`, () => {
      const p = parseAranet(aranet(o, sep));
      expect(p.error).toBeUndefined();
      const n = airNights(p.rows);
      expect(Object.keys(n).sort()).toEqual(["2026-11-10", "2026-11-11"]);
      expect(n["2026-11-10"].co2Max).toBe(600 + (9 * 60 - 10) * 2);
      expect(n["2026-11-10"].co2).toBeGreaterThan(1000); expect(n["2026-11-10"].co2).toBeLessThan(1200);
      expect(n["2026-11-10"].temp).toBe(19.5); expect(n["2026-11-10"].rh).toBe(45);
      expect(n["2026-11-10"].n).toBe(54);
    });
  }
  it("control: not an Aranet file — says so", () => {
    expect(parseAranet("name,weight\nme,80").error).toMatch(/No time or CO₂ column/);
    expect(parseAranet("").error).toMatch(/empty/);
  });
});

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
