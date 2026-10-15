/**
 * How far a value sits from your usual, as a shade (PLAN 105; owner, 15 Oct, picking "B · Heat": "yea b is clearly winner
 * here"). Inside your usual band: no shade. Outside: 1, 2 or 3 steps by how far beyond it — half a band's width, a band
 * and a half, past that — green when that way is better for you, red when worse, grey when neither is (calories, until a
 * goal says which way). Pure; the pages turn it into a tint, always beside the number itself.
 */

export type Tone = "better" | "worse" | "neutral";
export type Shade = { lvl: 0 | 1 | 2 | 3; tone: Tone | null };
export const NO_SHADE: Shade = { lvl: 0, tone: null };

/**
 * `lo`–`hi` your usual band, `good` which way is better ("up", "down", null for neither). The band's width is never taken
 * under `minW` (a band of one value would make any change "far off") — by default a tenth of its middle.
 */
export function shade(v: number | null | undefined, lo: number, hi: number, good: "up" | "down" | null, minW?: number): Shade {
  if (v == null || !Number.isFinite(v) || !Number.isFinite(lo) || !Number.isFinite(hi)) return NO_SHADE;
  const w = Math.max(hi - lo, minW ?? 0.1 * Math.abs((lo + hi) / 2), 1e-9);
  const d = v > hi ? (v - hi) / w : v < lo ? (lo - v) / w : 0;
  if (d <= 0) return NO_SHADE;
  const lvl = d <= 0.5 ? 1 : d <= 1.5 ? 2 : 3;
  const tone: Tone = good == null ? "neutral" : (good === "up") === (v > hi) ? "better" : "worse";
  return { lvl, tone };
}

/** The attributes a shaded element carries (index.css draws them: `.sh[data-tone][data-lvl]`). */
export const shadeAttrs = (s: Shade): { "data-tone"?: Tone; "data-lvl"?: number } => (s.lvl ? { "data-tone": s.tone!, "data-lvl": s.lvl } : {});
