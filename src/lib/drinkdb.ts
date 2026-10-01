/**
 * Drinks from the food database. Open Food Facts and USDA know Sprite, Fanta, every iced tea and
 * energy drink — per 100 ml, like any food. This turns one of those products into a `Drink` at a
 * size you pick: calories and macros from the label, alcohol from its % vol, caffeine from the label
 * when it lists it, otherwise the typical amount for its kind (colas, energy drinks…) — marked so.
 * Owner, 1 Oct: *"drinks still not searchable… make it have the database too, i still cant find
 * things like sprite"*.
 */

import type { Drink, Food } from "./types";
import { alcoholGrams } from "./alcohol";

/** "Sprite 0,5 l", "Coca-Cola 330ml", "Hell 250 ML", "Szentkirályi 1.5L" → ml, or null. */
export function mlInName(name: string): number | null {
  const m = name.toLowerCase().match(/(\d+(?:[.,]\d+)?)\s*(ml|cl|l)\b/);
  if (!m) return null;
  const v = Number(m[1].replace(",", "."));
  const ml = m[2] === "ml" ? v : m[2] === "cl" ? v * 10 : v * 1000;
  return ml >= 20 && ml <= 3000 ? Math.round(ml) : null;
}

/** Sizes to offer, the likeliest first: the one on the label, the product's serving, then the usual ones. */
export function sizesFor(f: Food): number[] {
  const label = mlInName(f.name);
  const serving = f.servingG && f.servingG >= 20 && f.servingG <= 2000 ? Math.round(f.servingG) : null;
  const out: number[] = [];
  for (const v of [label, serving, 330, 500, 250]) if (v != null && !out.includes(v)) out.push(v);
  return out.slice(0, 4);
}

/** mg per 100 ml for kinds of drink whose labels rarely list it. Typical label values. */
const TYPICAL: [RegExp, number, string][] = [
  [/energ|red ?bull|monster|\bhell\b|\bburn\b|rockstar|semtex|reign|28 black/i, 32, "typical for energy drinks"],
  [/club[- ]?mate|\bmate\b/i, 20, "typical for mate"],
  [/\bcola\b|\bcoke\b|pepsi|k[oó]la\b/i, 10, "typical for colas"],
  [/coffee|k[aá]v[eé]|latte|cappuccino|espresso|cold brew|frappuccino/i, 40, "typical for coffee drinks"],
];

export function caffeinePer100(f: Food): { mg: number; typical?: string } {
  if (f.caffeine100 != null) return { mg: f.caffeine100 };
  const text = `${f.name} ${f.brand ?? ""}`;
  if (/decaf|koffeinmentes|caffeine[- ]free/i.test(text)) return { mg: 0 };
  for (const [re, mg, why] of TYPICAL) if (re.test(text)) return { mg, typical: why };
  return { mg: 0 };
}

const r1 = (v: number) => Math.round(v * 10) / 10;

/** A database product as a drink of `ml` millilitres. Its id is stable, so saving it twice keeps one. */
export function drinkFromFood(f: Food, ml: number): Drink {
  const k = ml / 100, caf = caffeinePer100(f);
  const brand = f.brand && !f.name.toLowerCase().includes(f.brand.toLowerCase()) ? `${f.brand} ` : "";
  const size = mlInName(f.name) === ml ? "" : ` ${ml} ml`;
  return {
    id: `drink:${f.id}:${ml}`,
    name: `${brand}${f.name}${size}`.trim(),
    ml,
    caffeineMg: Math.round(caf.mg * k),
    alcoholG: f.alcohol100 ? r1(alcoholGrams(ml, f.alcohol100)) : 0,
    kcal: Math.round(f.per100.kcal * k),
    p: r1(f.per100.p * k), c: r1(f.per100.c * k), f: r1(f.per100.f * k),
    note: caf.typical ? `caffeine ${caf.typical}` : undefined,
  };
}
