/**
 * Turning a raw database answer into a short, trustworthy list.
 *
 * Search "spagetti" and Open Food Facts returns 20 brands of the same dry pasta, all 350–375 kcal.
 * You don't want to pick a brand; you want "spaghetti". So near-identical products collapse into
 * one **typical** row: the median of their values (robust to one bad label), with the spread shown
 * and the brands one tap away. Products whose label doesn't add up are flagged and left out of the
 * median. A product whose brand you typed stays on its own row, at the top.
 */

import type { Food, Macros } from "./types";

export const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/**
 * A spelling-tolerant key for a name: accents, "gh"/"h", doubled letters, pack sizes and word
 * order don't matter. "Spaghetti n.5 500g" and "spagetti" → "n5 spageti"… close enough that real
 * duplicates meet and different foods don't.
 */
export function nameKey(name: string): string {
  return fold(name)
    .split(" ")
    .filter((w) => w && !/^\d+([.,]\d+)?(g|gr|kg|ml|l|x|db|pcs)?$/.test(w))
    .map((w) => w.replace(/([bcdfgkpst])h/g, "$1").replace(/(.)\1+/g, "$1"))
    .sort()
    .join(" ");
}

/**
 * Does the label add up? Energy should be close to 4·protein + 4·carbs + 9·fat (fibre, alcohol and
 * sweeteners move it a little, so the tolerance is generous), and 100 g can't hold more than 100 g
 * of macros or more than 900 kcal. Catches typos like 3570 kcal or a kJ value in the kcal field.
 */
export function plausible(m: Macros): boolean {
  if (m.kcal < 0 || m.p < 0 || m.c < 0 || m.f < 0 || m.kcal > 900) return false;
  if (m.p + m.c + m.f > 105) return false;
  const est = 4 * m.p + 4 * m.c + 9 * m.f;
  if (est === 0) return m.kcal < 40; // water, black coffee, a label with only kcal filled in
  return Math.abs(est - m.kcal) <= Math.max(40, 0.3 * m.kcal);
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b), n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};
const r1 = (x: number) => Math.round(x * 10) / 10;

export type ResultRow =
  | { kind: "one"; food: Food; suspect: boolean }
  | { kind: "group"; key: string; typical: Food; items: Food[]; kcalRange: [number, number]; varies: boolean };

/** The median food of a group of near-identical products. */
export function typicalOf(key: string, items: Food[]): Food {
  const good = items.filter((f) => plausible(f.per100));
  const base = good.length ? good : items;
  // Most common spelling, first letter capitalised: "Spagetti" over "spagetti" over "SPAGETTI".
  const counts = new Map<string, number>();
  for (const f of items) { const k = f.name.trim().toLowerCase(); counts.set(k, (counts.get(k) ?? 0) + 1); }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const servings = base.map((f) => f.servingG).filter((g): g is number => !!g && g > 0);
  return {
    id: `typ:${key}`,
    name: top.charAt(0).toUpperCase() + top.slice(1),
    per100: {
      kcal: Math.round(median(base.map((f) => f.per100.kcal))),
      p: r1(median(base.map((f) => f.per100.p))),
      c: r1(median(base.map((f) => f.per100.c))),
      f: r1(median(base.map((f) => f.per100.f))),
    },
    servingG: servings.length * 2 >= base.length ? Math.round(median(servings)) : undefined,
    source: "typical",
    basis: base.length,
  };
}

/**
 * Group and rank. Order: what you asked for by brand, then the closest name matches, then the
 * most common foods (bigger groups), then the database's own order. Suspect labels sink.
 */
export function groupFoods(foods: Food[], query: string): ResultRow[] {
  const qWords = fold(query).split(" ").filter((w) => w.length >= 3);
  const qKey = nameKey(query);
  const brandHit = (f: Food) => !!f.brand && qWords.some((w) => fold(f.brand!).split(" ").includes(w));

  const groups = new Map<string, { first: number; items: Food[] }>();
  const rows: { row: ResultRow; first: number; score: number }[] = [];
  const match = (key: string, name: string) => {
    if (key === qKey) return 3;
    if (key.startsWith(qKey) || fold(name).startsWith(fold(query))) return 2;
    const n = fold(name);
    return qWords.every((w) => n.includes(w)) ? 1 : 0;
  };

  foods.forEach((f, i) => {
    // Plain reference foods (USDA) and brand hits are shown as themselves, never merged away.
    if (f.source === "usda" || brandHit(f)) {
      const suspect = !plausible(f.per100);
      rows.push({ row: { kind: "one", food: f, suspect }, first: i, score: (brandHit(f) ? 10 : 0) + match(nameKey(f.name), f.name) - (suspect ? 5 : 0) });
      return;
    }
    const key = nameKey(f.name);
    const g = groups.get(key);
    if (g) g.items.push(f); else groups.set(key, { first: i, items: [f] });
  });

  for (const [key, { first, items }] of groups) {
    const m = match(key, items[0].name);
    if (items.length === 1) {
      const suspect = !plausible(items[0].per100);
      rows.push({ row: { kind: "one", food: items[0], suspect }, first, score: m - (suspect ? 5 : 0) });
      continue;
    }
    const good = items.filter((f) => plausible(f.per100));
    const kcals = (good.length ? good : items).map((f) => f.per100.kcal);
    const lo = Math.min(...kcals), hi = Math.max(...kcals);
    rows.push({
      row: { kind: "group", key, typical: typicalOf(key, items), items, kcalRange: [lo, hi], varies: lo > 0 ? hi / lo > 1.3 : hi - lo > 30 },
      first,
      score: m + Math.min(items.length, 20) / 20, // size breaks ties between equally good names
    });
  }

  return rows.sort((a, b) => b.score - a.score || a.first - b.first).map((x) => x.row);
}
