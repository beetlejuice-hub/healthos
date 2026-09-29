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
  brands?: string;
  serving_quantity?: number | string;
  nutriments?: Record<string, number | string | undefined>;
};

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

/** One Open Food Facts product → a `Food`, or null when it lacks a name or calories. */
export function fromOff(p: OffProduct): Food | null {
  const name = (p.product_name || p.product_name_en || "").trim();
  const n = p.nutriments ?? {};
  let kcal = num(n["energy-kcal_100g"]);
  if (kcal === null) { const kj = num(n["energy_100g"]); if (kj !== null) kcal = kj / 4.184; }
  if (!name || kcal === null) return null;
  const serving = num(p.serving_quantity);
  return {
    id: `off:${p.code ?? name}`,
    name,
    brand: p.brands?.split(",")[0]?.trim() || undefined,
    per100: { kcal: Math.round(kcal), p: num(n["proteins_100g"]) ?? 0, c: num(n["carbohydrates_100g"]) ?? 0, f: num(n["fat_100g"]) ?? 0 },
    servingG: serving && serving > 0 ? serving : undefined,
    source: "off",
    barcode: p.code,
  };
}

const FIELDS = "code,product_name,product_name_en,brands,serving_quantity,nutriments";

export async function searchOff(query: string, signal?: AbortSignal): Promise<Food[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=25&fields=${FIELDS}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Open Food Facts answered ${res.status}`);
  const body = (await res.json()) as { products?: OffProduct[] };
  return (body.products ?? []).map(fromOff).filter((f): f is Food => f !== null);
}
