/**
 * Places in (PLAN 210; owner, 11 Nov: "1 love (all) - i have ios" — the location history, board R). Google Maps on the
 * iPhone exports its Timeline as one JSON file (Settings → Location & privacy / Personal content → Export Timeline data);
 * picked here and read on the phone. What's kept is per day — hours away from home, km travelled, minutes walking or
 * cycling, places you went, a night away — and your top places by visits (to name once); the file itself isn't kept.
 *
 * Two shapes: the newer one ({ semanticSegments: [...] }, places as "47.49°, 19.04°") and the iPhone's older one (an
 * array; places as "geo:47.49,19.04", ids as placeID). Home is the place Google marked home, else where you most often
 * were at 3 in the morning. Pure.
 */

import { addDays, atMinute, localDay } from "./time";

export type Visit = { id: string; start: number; end: number; lat: number | null; lng: number | null; type: string };
export type Move = { start: number; end: number; km: number; kind: string };
export type PlaceDay = { awayH: number; km: number; activeMin: number; places: number; awayNight: boolean };
export type TopPlace = { id: string; lat: number | null; lng: number | null; visits: number; hours: number; home: boolean };
export type Places = { days: Record<string, PlaceDay>; top: TopPlace[]; home: string | null; from: string; to: string };

const ACTIVE = /walk|on_foot|foot|run|cycl|bik/i;
const H = 3_600_000;

function latLng(p: unknown): [number | null, number | null] {
  if (typeof p === "string") { const m = p.match(/(-?\d+(?:\.\d+)?)°?\s*,\s*(-?\d+(?:\.\d+)?)/); return m ? [+m[1], +m[2]] : [null, null]; }
  if (p && typeof p === "object") {
    const o = p as Record<string, unknown>;
    if (o.latLng) return latLng(o.latLng);
    if (typeof o.latitudeE7 === "number") return [o.latitudeE7 / 1e7, (o.longitudeE7 as number) / 1e7];
    if (typeof o.latitude === "number") return [o.latitude, o.longitude as number];
  }
  return [null, null];
}

/** The visits and moves in a Timeline export, or why it couldn't be read. */
export function parseTimeline(j: unknown): { visits: Visit[]; moves: Move[]; error?: string } {
  const segs = Array.isArray(j) ? j : j && typeof j === "object" && Array.isArray((j as { semanticSegments?: unknown }).semanticSegments) ? (j as { semanticSegments: unknown[] }).semanticSegments : null;
  if (!segs) return { visits: [], moves: [], error: "Not a Google Maps Timeline export (no timeline segments in it)." };
  const visits: Visit[] = [], moves: Move[] = [];
  for (const s of segs as Record<string, unknown>[]) {
    const start = Date.parse(String(s.startTime ?? "")), end = Date.parse(String(s.endTime ?? ""));
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const v = s.visit as { topCandidate?: Record<string, unknown> } | undefined, a = s.activity as Record<string, unknown> | undefined;
    if (v?.topCandidate) {
      const c = v.topCandidate, [lat, lng] = latLng(c.placeLocation), id = String(c.placeId ?? c.placeID ?? (lat != null ? `${lat.toFixed(3)},${lng!.toFixed(3)}` : ""));
      if (id) visits.push({ id, start, end, lat, lng, type: String(c.semanticType ?? "") });
    } else if (a) {
      const km = Number(a.distanceMeters ?? 0) / 1000, kind = String((a.topCandidate as Record<string, unknown> | undefined)?.type ?? "");
      moves.push({ start, end, km: Number.isFinite(km) ? km : 0, kind });
    }
  }
  if (!visits.length && !moves.length) return { visits, moves, error: "The file has no visits or trips in it." };
  return { visits: visits.sort((x, y) => x.start - y.start), moves: moves.sort((x, y) => x.start - y.start) };
}

const overlap = (a: number, b: number, c: number, d: number) => Math.max(0, Math.min(b, d) - Math.max(a, c));

/** Per day, and your top places. */
export function placeDays(visits: Visit[], moves: Move[], top = 8): Places {
  // home: the place Google marked, else where 3 a.m. found you most
  const marked = visits.find((v) => /home/i.test(v.type))?.id ?? null;
  const at3 = new Map<string, number>();
  for (const v of visits) for (let d = localDay(v.start); d <= localDay(v.end); d = addDays(d, 1)) { const t = atMinute(d, 180); if (t >= v.start && t < v.end) at3.set(v.id, (at3.get(v.id) ?? 0) + 1); }
  const home = marked ?? ([...at3.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null);
  const all = [...visits.map((v) => v.start), ...moves.map((m) => m.start)], from = localDay(Math.min(...all)), to = localDay(Math.max(...visits.map((v) => v.end), ...moves.map((m) => m.end)));
  const days: Record<string, PlaceDay> = {};
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const a = atMinute(d, 360), b = atMinute(addDays(d, 1), 0), n3 = atMinute(d, 180);
    const vs = visits.filter((v) => v.end > a && v.start < b), ms = moves.filter((m) => m.end > a && m.start < b);
    if (!vs.length && !ms.length) continue;
    const away = vs.filter((v) => v.id !== home).reduce((s, v) => s + overlap(v.start, v.end, a, b), 0) + ms.reduce((s, m) => s + overlap(m.start, m.end, a, b), 0);
    const night = visits.find((v) => n3 >= v.start && n3 < v.end);
    days[d] = {
      awayH: Math.round((away / H) * 10) / 10,
      km: Math.round(ms.filter((m) => localDay(m.start) === d).reduce((s, m) => s + m.km, 0) * 10) / 10,
      activeMin: Math.round(ms.filter((m) => ACTIVE.test(m.kind)).reduce((s, m) => s + overlap(m.start, m.end, a, b), 0) / 60_000),
      places: new Set(vs.filter((v) => v.id !== home).map((v) => v.id)).size,
      awayNight: !!night && !!home && night.id !== home,
    };
  }
  const tally = new Map<string, TopPlace>();
  for (const v of visits) { const t = tally.get(v.id) ?? { id: v.id, lat: v.lat, lng: v.lng, visits: 0, hours: 0, home: v.id === home }; t.visits++; t.hours += (v.end - v.start) / H; tally.set(v.id, t); }
  const tops = [...tally.values()].sort((x, y) => +y.home - +x.home || y.visits - x.visits).slice(0, top).map((t) => ({ ...t, hours: Math.round(t.hours) }));
  return { days, top: tops, home, from, to };
}
