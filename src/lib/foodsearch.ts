/**
 * One food search over two big free databases, merged:
 *  - **Open Food Facts** — ~3M branded/packaged products worldwide, Hungarian included.
 *  - **USDA FoodData Central** — the reference database for plain foods ("chicken breast,
 *    roasted"), lab-measured, per 100 g.
 * Runs on our Cloudflare Worker (`worker/index.ts`) so the phone makes one fast call, results are
 * cached, and a flaky upstream never breaks search. Pure mapping lives here so it's tested.
 */

import type { Food } from "./types";
import { fromOff } from "./off";

type UsdaNutrient = { nutrientId?: number; nutrientNumber?: string; value?: number };
export type UsdaFood = { fdcId: number; description?: string; dataType?: string; brandOwner?: string; foodNutrients?: UsdaNutrient[] };

// USDA nutrient ids (and legacy numbers): energy has three variants depending on the dataset.
const pick = (ns: UsdaNutrient[], ids: number[], nums: string[]) => {
  for (const n of ns) if ((n.nutrientId && ids.includes(n.nutrientId)) || (n.nutrientNumber && nums.includes(n.nutrientNumber))) if (typeof n.value === "number") return n.value;
  return null;
};

/** "CHICKEN, BROILERS OR FRYERS, BREAST, MEAT ONLY, COOKED" → "Chicken, broilers or fryers, breast, meat only, cooked". */
const tidy = (s: string) => { const t = s.trim(); return t === t.toUpperCase() ? t.charAt(0) + t.slice(1).toLowerCase() : t; };

export function fromUsda(f: UsdaFood): Food | null {
  const ns = f.foodNutrients ?? [];
  const kcal = pick(ns, [1008, 2047, 2048], ["208", "957", "958"]);
  if (!f.description || kcal === null) return null;
  return {
    id: `usda:${f.fdcId}`,
    name: tidy(f.description),
    brand: f.brandOwner ? tidy(f.brandOwner) : undefined,
    per100: { kcal: Math.round(kcal), p: pick(ns, [1003], ["203"]) ?? 0, c: pick(ns, [1005], ["205"]) ?? 0, f: pick(ns, [1004], ["204"]) ?? 0 },
    source: "usda",
  };
}

/**
 * Merge both lists: plain USDA foods first when the query looks generic, branded products first
 * otherwise; duplicates by name dropped. Capped so the list stays scannable on a phone.
 */
export function mergeFoods(off: Food[], usda: Food[], query: string, limit = 30): Food[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const genericFirst = words.length <= 3 && !/\d/.test(query);
  const seen = new Set<string>();
  const out: Food[] = [];
  for (const f of genericFirst ? [...usda.slice(0, 8), ...off, ...usda.slice(8)] : [...off, ...usda]) {
    const key = `${f.name.toLowerCase()}|${(f.brand ?? "").toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
    if (out.length >= limit) break;
  }
  return out;
}

export type SearchResult = { foods: Food[]; sources: { off: "ok" | "error"; usda: "ok" | "error" | "off" } };

const OFF_FIELDS = "code,product_name,product_name_en,product_name_hu,brands,serving_quantity,nutriments";

/** The server-side search. `fetcher` is injectable for tests. */
export async function searchAll(query: string, usdaKey: string | undefined, fetcher: typeof fetch = fetch): Promise<SearchResult> {
  const q = encodeURIComponent(query.trim());
  const offP = (async () => {
    const map = (list: unknown[] | undefined) => (list ?? []).map((p) => fromOff(p as never)).filter((f): f is Food => f !== null);
    try {
      const r = await fetcher(`https://search.openfoodfacts.org/search?q=${q}&page_size=25&fields=${OFF_FIELDS}`, { headers: { "User-Agent": "HealthOS/1.0 (personal app)" } });
      if (r.ok) { const found = map(((await r.json()) as { hits?: unknown[] }).hits); if (found.length) return found; }
    } catch { /* try the classic endpoint */ }
    const r = await fetcher(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${q}&search_simple=1&action=process&json=1&page_size=25&fields=${OFF_FIELDS}`, { headers: { "User-Agent": "HealthOS/1.0 (personal app)" } });
    if (!r.ok) throw new Error(`OFF ${r.status}`);
    return map(((await r.json()) as { products?: unknown[] }).products);
  })();
  const usdaP = (async () => {
    const r = await fetcher(`https://api.nal.usda.gov/fdc/v1/foods/search?query=${q}&pageSize=20&dataType=Foundation,SR%20Legacy,Survey%20(FNDDS)&api_key=${usdaKey || "DEMO_KEY"}`);
    if (!r.ok) throw new Error(`USDA ${r.status}`);
    return ((((await r.json()) as { foods?: UsdaFood[] }).foods) ?? []).map(fromUsda).filter((f): f is Food => f !== null);
  })();
  const [off, usda] = await Promise.allSettled([offP, usdaP]);
  const offFoods = off.status === "fulfilled" ? off.value : [];
  const usdaFoods = usda.status === "fulfilled" ? usda.value : [];
  return { foods: mergeFoods(offFoods, usdaFoods, query), sources: { off: off.status === "fulfilled" ? "ok" : "error", usda: usda.status === "fulfilled" ? "ok" : "error" } };
}
