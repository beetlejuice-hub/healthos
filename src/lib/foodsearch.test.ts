import { describe, expect, it } from "vitest";
import { fromUsda, mergeFoods, searchAll } from "./foodsearch";
import { handleFood } from "../../worker/index";
import type { Food } from "./types";

const usdaChicken = { fdcId: 171477, description: "CHICKEN, BROILERS OR FRYERS, BREAST, MEAT ONLY, COOKED, ROASTED", dataType: "SR Legacy",
  foodNutrients: [{ nutrientId: 1008, value: 165 }, { nutrientId: 1003, value: 31 }, { nutrientId: 1005, value: 0 }, { nutrientId: 1004, value: 3.57 }] };
const offOats = { code: "5990", product_name: "Zabpehely", brands: ["Brand"], nutriments: { "energy-kcal_100g": 372, proteins_100g: 13, carbohydrates_100g: 60, fat_100g: 7 } };

describe("fromUsda", () => {
  it("maps a USDA food, tidying the all-caps name", () => {
    expect(fromUsda(usdaChicken)).toMatchObject({ id: "usda:171477", name: "Chicken, broilers or fryers, breast, meat only, cooked, roasted", per100: { kcal: 165, p: 31, c: 0, f: 3.57 }, source: "usda" });
  });

  it("reads energy from the Atwater variants Foundation foods use", () => {
    expect(fromUsda({ fdcId: 1, description: "Rice", foodNutrients: [{ nutrientId: 2047, value: 130 }] })!.per100.kcal).toBe(130);
    expect(fromUsda({ fdcId: 2, description: "Rice", foodNutrients: [{ nutrientNumber: "208", value: 131 }] })!.per100.kcal).toBe(131);
  });

  it("drops foods without energy", () => {
    expect(fromUsda({ fdcId: 3, description: "X", foodNutrients: [] })).toBeNull();
  });
});

describe("mergeFoods", () => {
  const f = (name: string, source: Food["source"], brand?: string): Food => ({ id: `${source}:${name}`, name, brand, source, per100: { kcal: 1, p: 0, c: 0, f: 0 } });
  it("puts plain foods first for a short generic query and drops duplicates", () => {
    const m = mergeFoods([f("Chicken breast", "off", "Tesco"), f("Oats", "off")], [f("Chicken breast", "usda"), f("Oats", "usda"), f("oats", "usda")], "chicken");
    // The unbranded OFF "Oats" duplicates USDA's "Oats" (and "oats"), so only the branded chicken survives from OFF.
    expect(m.map((x) => x.id)).toEqual(["usda:Chicken breast", "usda:Oats", "off:Chicken breast"]);
  });

  it("puts branded products first for a specific query", () => {
    expect(mergeFoods([f("Protein bar 60g", "off")], [f("Bar", "usda")], "myprotein layered bar 60g")[0].source).toBe("off");
  });
});

/** A fake internet: OFF and USDA answer from fixtures, and we can make either fail. */
const fakeFetch = (opts: { offDown?: boolean; newSearchEmpty?: boolean; usdaDown?: boolean } = {}) => (async (input: RequestInfo | URL) => {
  const url = String(input);
  const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  if (url.startsWith("https://search.openfoodfacts.org")) return opts.offDown ? new Response("", { status: 503 }) : ok({ hits: opts.newSearchEmpty ? [] : [offOats] });
  if (url.startsWith("https://world.openfoodfacts.org")) return opts.offDown ? new Response("", { status: 503 }) : ok({ products: [{ ...offOats, product_name: "Zabpehely (classic)" }] });
  if (url.startsWith("https://api.nal.usda.gov")) return opts.usdaDown ? new Response("", { status: 429 }) : ok({ foods: [usdaChicken] });
  throw new Error("unexpected " + url);
}) as typeof fetch;

describe("searchAll", () => {
  it("merges both databases", async () => {
    const r = await searchAll("zab", undefined, fakeFetch());
    expect(r.sources).toEqual({ off: "ok", usda: "ok" });
    expect(r.foods.map((x) => x.source).sort()).toEqual(["off", "usda"]);
  });

  it("falls back to the classic OFF search when the new one finds nothing", async () => {
    const r = await searchAll("zab", undefined, fakeFetch({ newSearchEmpty: true }));
    expect(r.foods.some((x) => x.name === "Zabpehely (classic)")).toBe(true);
  });

  it("still answers when one database is down, and says which", async () => {
    const r = await searchAll("zab", undefined, fakeFetch({ usdaDown: true }));
    expect(r.sources).toEqual({ off: "ok", usda: "error" });
    expect(r.foods).toHaveLength(1);
    const r2 = await searchAll("zab", undefined, fakeFetch({ offDown: true }));
    expect(r2.sources.off).toBe("error");
    expect(r2.foods[0].source).toBe("usda");
  });
});

describe("worker /api/food", () => {
  it("answers JSON and ignores too-short queries", async () => {
    const real = globalThis.fetch;
    globalThis.fetch = fakeFetch();
    try {
      const res = await handleFood(new Request("https://app/api/food?q=zab"), { ASSETS: { fetch: async () => new Response("") } });
      expect(res.headers.get("content-type")).toBe("application/json");
      expect(((await res.json()) as { foods: unknown[] }).foods.length).toBe(2);
      const short = await handleFood(new Request("https://app/api/food?q=z"), { ASSETS: { fetch: async () => new Response("") } });
      expect(await short.json()).toEqual({ foods: [], sources: { off: "ok", usda: "ok" } });
    } finally {
      globalThis.fetch = real;
    }
  });
});
