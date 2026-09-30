import { describe, expect, it } from "vitest";
import { ASK_ABOUT, ITEMS, RULES } from "./kb";
import { badgeFor, check, resolve, resolveAll } from "./check";

const OWNER_STACK = ["Creatine", "Vitamin D3", "Black cumin seed oil", "Magnesium", "Saffron"];
const keys = (typed: string) => resolveAll(typed).map((i) => i.key);

describe("knowledge base hygiene", () => {
  it("every rule and suggestion has a source link, a review date and known items", () => {
    const known = new Set(ITEMS.map((i) => i.key));
    for (const r of [...RULES, ...ASK_ABOUT]) {
      expect(r.sources.length, JSON.stringify(r)).toBeGreaterThan(0);
      for (const s of r.sources) expect(s.url).toMatch(/^https:\/\//);
      expect(r.reviewed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    for (const r of RULES) { expect(known.has(r.a), r.a).toBe(true); expect(known.has(r.b), r.b).toBe(true); }
  });

  it("never tells you to stop a medication or gives a dose", () => {
    for (const r of RULES) expect(r.say).not.toMatch(/\bstop (taking|your)|\b\d+\s?(mg|iu|µg|mcg)\b.*(take|daily)/i);
  });

  it("no alias points at two items", () => {
    const seen = new Map<string, string>();
    for (const it of ITEMS) for (const a of it.aka) {
      const k = a.toLowerCase();
      expect(seen.get(k) ?? it.key, `${a}: ${seen.get(k)} vs ${it.key}`).toBe(it.key);
      seen.set(k, it.key);
    }
  });
});

describe("matching what you typed", () => {
  it("finds items in English, Hungarian, brand names, with or without accents", () => {
    expect(keys("Vitamin D3 2000 IU")).toEqual(["vitamin-d"]);
    expect(keys("Fekete komeny olaj")).toEqual(["black-cumin"]);
    expect(keys("Daivobet gél")).toEqual(["calcipotriol"]);
    expect(keys("Neotigason 25mg")).toEqual(["acitretin"]);
    expect(keys("pikkelysömör")).toEqual(["psoriasis"]);
    expect(keys("Magnézium-biszglicinát")).toEqual(["magnesium"]);
  });

  it("finds every item in a combined product", () => {
    expect(keys("Omega-3 + D3").sort()).toEqual(["fish-oil", "vitamin-d"]);
  });

  it("matches whole words only", () => {
    expect(resolve("Boron")).toBeNull(); // not "bor" (wine)
    expect(resolve("Ashwagandha")).toBeNull();
  });
});

describe("the owner's stack", () => {
  const r = check({ stack: OWNER_STACK, meds: [], conditions: ["psoriasis"], drinks: ["caffeine", "alcohol"] });

  it("gives exactly the plan's table: alcohol caution, D and black seed mixed, coffee no link", () => {
    expect(r.flags.map((f) => `${f.rule.a}×${f.rule.b}:${f.rule.verdict}`)).toEqual([
      "alcohol×psoriasis:caution", "vitamin-d×psoriasis:mixed", "black-cumin×psoriasis:mixed", "caffeine×psoriasis:none",
    ]);
    expect(r.unknown).toEqual([]);
  });

  it("badges: creatine, magnesium, saffron have no known link; black seed is mixed", () => {
    expect(["Creatine", "Magnesium", "Saffron"].map((s) => badgeFor(s, r).verdict)).toEqual(["none", "none", "none"]);
    expect(badgeFor("Black cumin seed oil", r).verdict).toBe("mixed");
  });

  it("suggests asking about fish oil and a vitamin D test", () => {
    expect(r.ask.map((a) => a.item)).toEqual(["fish-oil", "vitamin-d"]);
  });

  it("with no drinks logged, alcohol isn't mentioned", () => {
    expect(check({ stack: OWNER_STACK, meds: [], conditions: ["psoriasis"], drinks: [] }).flags.some((f) => f.rule.a === "alcohol")).toBe(false);
  });
});

describe("adding a medication", () => {
  it("methotrexate turns alcohol red and flags creatine's lab effect", () => {
    const r = check({ stack: OWNER_STACK, meds: ["Methotrexate 15 mg weekly"], conditions: ["psoriasis"], drinks: ["alcohol"] });
    expect(r.flags[0]).toMatchObject({ rule: { a: "alcohol", b: "methotrexate", verdict: "avoid" } });
    expect(badgeFor("Creatine", r)).toMatchObject({ verdict: "caution" });
  });

  it("St John's wort with apremilast is an avoid, whichever list it's in", () => {
    const r = check({ stack: ["St John's wort"], meds: ["Otezla"], conditions: [], drinks: [] });
    expect(badgeFor("St John's wort", r).verdict).toBe("avoid");
  });

  it("something unknown is listed as not checked, never passed silently", () => {
    const r = check({ stack: ["Ashwagandha"], meds: ["Xyzzamab"], conditions: [], drinks: [] });
    expect(r.unknown.map((t) => t.label)).toEqual(["Ashwagandha", "Xyzzamab"]);
    expect(badgeFor("Ashwagandha", r).verdict).toBe("unknown");
  });
});
