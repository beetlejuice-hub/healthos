/**
 * Experiments in alternating blocks (PLAN 227; owner, 24 Nov: "4" — randomised-block experiments). Instead of 14 days
 * before against the days of it — where anything else that drifted over those weeks (the season, work, a cold) passes
 * for the protocol — the days of it alternate: blocks of 4 days ON and 4 days OFF, each pair in a random order (ON-OFF or
 * OFF-ON, so neither always comes first), the first day of every block after the first left out as a washout (yesterday's
 * protocol still in you). Drift then lands on both sides alike. The test is the same fit as before (lib/ai/apply judge:
 * ON against OFF, weekends taken out, the days counted as fewer when they carry over); and NAP, the share of (ON, OFF)
 * day pairs where the ON day was better — a second readout anyone can check by hand. Pure.
 */

export type Blocks = { len: number; order: ("on" | "off")[] };
export const BLOCKS = { len: 4, minDays: 8 } as const;

/** A schedule for `days` (rounded up to whole pairs of blocks), each pair's order from `seed`. */
export function makeBlocks(days: number, seed: number, len: number = BLOCKS.len): { blocks: Blocks; days: number } {
  const pairs = Math.max(1, Math.ceil(days / (2 * len)));
  let s = seed >>> 0;
  const r = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const order: Blocks["order"] = [];
  for (let i = 0; i < pairs; i++) order.push(...(r() < 0.5 ? (["on", "off"] as const) : (["off", "on"] as const)));
  return { blocks: { len, order }, days: pairs * 2 * len };
}

/** A day's place in the schedule: ON or OFF, and whether it's a washout day; null before the start. Past the planned
 * blocks (a longer run) it keeps alternating. */
export function blockOn(b: Blocks, start: string, day: string): { on: boolean; washout: boolean; block: number } | null {
  const k = Math.round((Date.parse(`${day}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86_400_000);
  if (k < 0) return null;
  const block = Math.floor(k / b.len), at = k % b.len;
  const side = block < b.order.length ? b.order[block] : b.order[b.order.length - 1 - ((block - b.order.length) % 2 === 0 ? 1 : 0)] ?? "on";
  const prev = block === 0 ? null : block - 1 < b.order.length ? b.order[block - 1] : null;
  return { on: side === "on", washout: at === 0 && block > 0 && prev !== side, block };
}

/** Non-overlap of all pairs: the share of (ON, OFF) pairs where ON was better (ties half); `better` −1 for stress. */
export function nap(on: number[], off: number[], better: 1 | -1 = 1): number | null {
  if (!on.length || !off.length) return null;
  let w = 0;
  for (const a of on) for (const b of off) w += (a - b) * better > 0 ? 1 : a === b ? 0.5 : 0;
  return w / (on.length * off.length);
}
