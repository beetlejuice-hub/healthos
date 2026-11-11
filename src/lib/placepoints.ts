/**
 * Places on their own (PLAN 212; owner, 11 Nov: "For the damn google maps pls automate it, somehow. like pulling every
 * now and then"). Google keeps Timeline on the phone now (2024) — nothing can pull it — so Overland (a free, open-source
 * iPhone app) logs location in the background and posts it to the Worker as GeoJSON points. Here: reading those posts,
 * thinning them (one point every 3 minutes is plenty), and turning points into visits and trips (stay points: 10 minutes
 * or more within 150 m is a visit, Li 2008) — which lib/timeline then turns into each day's places. Pure.
 */

import { placeDays, type Move, type Places, type Visit } from "./timeline";

/** A kept point: [unix seconds, latitude × 1e5, longitude × 1e5, how you moved (MOTIONS index)]. */
export type Pt = [number, number, number, number];
export const MOTIONS = ["", "stationary", "walking", "running", "cycling", "driving"] as const;
export const POINTS = { stepSec: 180, maxAccuracyM: 200, stayM: 150, staySec: 600, keepDays: 120, cellLat: 0.002, cellLng: 0.003 } as const;

/** The points in an Overland post ({ locations: [GeoJSON points] }); the ones too inaccurate to place you left out. */
export function fromOverland(post: unknown): { pts: Pt[]; error?: string } {
  const locs = post && typeof post === "object" && Array.isArray((post as { locations?: unknown }).locations) ? (post as { locations: unknown[] }).locations : null;
  if (!locs) return { pts: [], error: "no locations in it — is this Overland?" };
  const pts: Pt[] = [];
  for (const l of locs as { geometry?: { coordinates?: unknown }; properties?: Record<string, unknown> }[]) {
    const c = l?.geometry?.coordinates, p = l?.properties ?? {};
    if (!Array.isArray(c) || typeof c[0] !== "number" || typeof c[1] !== "number") continue;
    const t = Date.parse(String(p.timestamp ?? "")), acc = Number(p.horizontal_accuracy ?? 0);
    if (!Number.isFinite(t) || acc > POINTS.maxAccuracyM || Math.abs(c[1]) > 90 || Math.abs(c[0]) > 180) continue;
    const motion = (Array.isArray(p.motion) ? p.motion : []).map(String);
    const pick = (["driving", "cycling", "running", "walking", "stationary"] as const).find((x) => motion.includes(x));
    pts.push([Math.round(t / 1000), Math.round(c[1] * 1e5), Math.round(c[0] * 1e5), pick ? MOTIONS.indexOf(pick) : 0]);
  }
  return { pts };
}

/** Old and new together, oldest first, at most one point every 3 minutes (a moving point is kept over a still one). */
export function thin(kept: Pt[], add: Pt[]): Pt[] {
  const all = [...kept, ...add].sort((a, b) => a[0] - b[0]), out: Pt[] = [];
  for (const p of all) {
    const last = out[out.length - 1];
    if (!last || p[0] - last[0] >= POINTS.stepSec) out.push(p);
    else if (p[3] > 1 && last[3] <= 1) out[out.length - 1] = p;
  }
  return out;
}

const R = 6371000, rad = Math.PI / 180;
/** Metres between two kept points. */
export function metres(a: Pt, b: Pt): number {
  const la1 = (a[1] / 1e5) * rad, la2 = (b[1] / 1e5) * rad, dla = la2 - la1, dlo = ((b[2] - a[2]) / 1e5) * rad;
  const h = Math.sin(dla / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dlo / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Visits (10+ minutes within 150 m) and the trips between them. A visit's id is its ~200 m grid cell, so a place comes back as the same place. */
export function segments(pts: Pt[]): { visits: Visit[]; moves: Move[] } {
  const visits: Visit[] = [], moves: Move[] = [];
  const visitOf = (a: number, b: number): Visit => {
    const s = pts.slice(a, b + 1), lat = s.reduce((x, p) => x + p[1], 0) / s.length / 1e5, lng = s.reduce((x, p) => x + p[2], 0) / s.length / 1e5;
    return { id: `${Math.round(lat / POINTS.cellLat)}:${Math.round(lng / POINTS.cellLng)}`, start: pts[a][0] * 1000, end: pts[b][0] * 1000, lat, lng, type: "" };
  };
  let i = 0, lastEnd = -1;
  const trip = (from: number, to: number) => {
    if (from < 0 || to <= from) return;
    let m = 0; const kinds = new Map<number, number>();
    for (let k = from + 1; k <= to; k++) { m += metres(pts[k - 1], pts[k]); if (pts[k][3] > 1) kinds.set(pts[k][3], (kinds.get(pts[k][3]) ?? 0) + 1); }
    const sec = pts[to][0] - pts[from][0], kmh = sec > 0 ? m / 1000 / (sec / 3600) : 0;
    const kind = kinds.size ? MOTIONS[[...kinds.entries()].sort((a, b) => b[1] - a[1])[0][0]] : kmh < 7 ? "walking" : kmh < 22 ? "cycling" : "driving";
    if (m > 100) moves.push({ start: pts[from][0] * 1000, end: pts[to][0] * 1000, km: Math.round(m / 100) / 10, kind });
  };
  while (i < pts.length) {
    let j = i + 1;
    while (j < pts.length && metres(pts[i], pts[j]) <= POINTS.stayM) j++;
    if (pts[j - 1][0] - pts[i][0] >= POINTS.staySec) {
      trip(lastEnd, i);
      const v = visitOf(i, j - 1), prev = visits[visits.length - 1];
      // the same place again with no trip between: one visit
      if (prev && prev.id === v.id && (moves.length === 0 || moves[moves.length - 1].end <= prev.end)) prev.end = v.end; else visits.push(v);
      lastEnd = j - 1; i = j;
    } else i++;
  }
  return { visits, moves };
}

/**
 * Each day's places from the kept points, in the phone's time zone (`tzOffset`: its getTimezoneOffset(), minutes): the
 * Worker runs on UTC, so the points are moved by the difference before lib/timeline splits them into days.
 */
export function summarize(pts: Pt[], tzOffset: number, runtimeOffset = new Date().getTimezoneOffset()): Places | null {
  if (pts.length < 2) return null;
  const shift = (runtimeOffset - tzOffset) * 60;
  const { visits, moves } = segments(pts.map((p): Pt => [p[0] + shift, p[1], p[2], p[3]]));
  return visits.length || moves.length ? placeDays(visits, moves) : null;
}
