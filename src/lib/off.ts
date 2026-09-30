/**
 * Open Food Facts — the free, open food database (millions of products, Hungarian brands
 * included). Search is a plain HTTPS call from the browser; no key. A product becomes a `Food`
 * only when it has calories per 100 g — anything without them can't be logged honestly.
 */

import type { Food } from "./types";

type OffProduct = {
  code?: string;
  product_name?: string;
  product_name_en?: string;
  product_name_hu?: string;
  /** A comma-separated string from the classic API, an array from the newer search. */
  brands?: string | string[];
  serving_quantity?: number | string;
  nutriments?: Record<string, number | string | undefined>;
};

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

/** One Open Food Facts product → a `Food`, or null when it lacks a name or calories. */
export function fromOff(p: OffProduct): Food | null {
  const name = (p.product_name || p.product_name_hu || p.product_name_en || "").trim();
  const n = p.nutriments ?? {};
  let kcal = num(n["energy-kcal_100g"]);
  if (kcal === null) { const kj = num(n["energy_100g"]); if (kj !== null) kcal = kj / 4.184; }
  if (!name || kcal === null) return null;
  const serving = num(p.serving_quantity);
  return {
    id: `off:${p.code ?? name}`,
    name,
    brand: (Array.isArray(p.brands) ? p.brands[0] : p.brands?.split(",")[0])?.trim() || undefined,
    per100: { kcal: Math.round(kcal), p: num(n["proteins_100g"]) ?? 0, c: num(n["carbohydrates_100g"]) ?? 0, f: num(n["fat_100g"]) ?? 0 },
    servingG: serving && serving > 0 ? serving : undefined,
    source: "off",
    barcode: p.code,
  };
}

const FIELDS = "code,product_name,product_name_en,product_name_hu,brands,serving_quantity,nutriments";

/**
 * Search Open Food Facts. Tries their newer search service first (fast, relevance-ranked), and
 * falls back to the classic endpoint if it's down or finds nothing — either can be flaky, and a
 * food search that returns nothing is worse than a slow one.
 */
export async function searchOff(query: string, signal?: AbortSignal): Promise<Food[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const map = (list: OffProduct[] | undefined) => (list ?? []).map(fromOff).filter((f): f is Food => f !== null);
  try {
    const res = await fetch(`https://search.openfoodfacts.org/search?q=${encodeURIComponent(q)}&page_size=25&fields=${FIELDS}`, { signal });
    if (res.ok) {
      const found = map(((await res.json()) as { hits?: OffProduct[] }).hits);
      if (found.length) return found;
    }
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
  }
  const res = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=25&fields=${FIELDS}`, { signal });
  if (!res.ok) throw new Error(`Open Food Facts answered ${res.status}`);
  return map(((await res.json()) as { products?: OffProduct[] }).products);
}
