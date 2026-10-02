/**
 * Your taste, for ranking search results: the products you've logged and the brands you buy, each
 * counted by how often you logged them (last 180 days). Database rows that are yours rise; inside a
 * group of near-identical products, yours is listed first.
 */

import type { Entry, Food } from "./types";
const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

export type Taste = { ids: Map<string, number>; brands: Map<string, number> };

export function tasteOf(entries: Entry[], saved: Food[], now = Date.now()): Taste {
  const since = now - 180 * 86_400_000, ids = new Map<string, number>(), brands = new Map<string, number>();
  const byId = new Map(saved.map((f) => [f.id, f]));
  for (const e of entries) {
    if (e.kind !== "food" || !e.foodId || e.at < since) continue;
    ids.set(e.foodId, (ids.get(e.foodId) ?? 0) + 1);
    const b = byId.get(e.foodId)?.brand;
    if (b) brands.set(fold(b), (brands.get(fold(b)) ?? 0) + 1);
  }
  return { ids, brands };
}

/** How much a food is "yours": logged this exact product > a brand you buy > nothing. */
export function mineScore(f: Food, t: Taste): number {
  if (t.ids.has(f.id)) return 6;
  const n = f.brand ? t.brands.get(fold(f.brand)) ?? 0 : 0;
  return n ? 2 + Math.min(2, n / 3) : 0;
}
