/**
 * Type what you ate: "2 scrambled eggs, toast, an apple" or "2 tojás, pirítós, alma" → basket
 * lines. Runs on the phone, no AI: numbers and unit words are read, the rest is matched against
 * your own foods first, then the built-in everyday foods. Anything it isn't sure of is marked for
 * a tap instead of guessed silently.
 */

import type { Drink, Food } from "./types";
import { BASIC_FOODS } from "./foods-basic";
import { DRINKS } from "./drinks";
import { unitsOf, type Line } from "./units";

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9½¼¾.,]+/g, " ").trim();

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, half: 0.5, couple: 2,
  egy: 1, ket: 2, ketto: 2, harom: 3, negy: 4, ot: 5, hat: 6, het: 7, nyolc: 8, kilenc: 9, tiz: 10, fel: 0.5,
};
/** Words for amounts → the unit name they mean on a food (first match on the food wins). */
const UNIT_WORDS: Record<string, string[]> = {
  slice: ["slice"], slices: ["slice"], szelet: ["slice"],
  piece: ["piece", "serving"], pieces: ["piece", "serving"], pc: ["piece"], pcs: ["piece"], db: ["piece"], darab: ["piece"],
  glass: ["glass"], glasses: ["glass"], pohar: ["glass"],
  bowl: ["bowl", "plate"], bowls: ["bowl", "plate"], plate: ["plate", "bowl"], plates: ["plate", "bowl"], tanyer: ["plate", "bowl"], tal: ["bowl", "plate"],
  tbsp: ["tbsp", "spoon"], spoon: ["spoon", "tbsp"], spoons: ["spoon", "tbsp"], tablespoon: ["tbsp", "spoon"], tablespoons: ["tbsp", "spoon"], evokanal: ["tbsp", "spoon"], kanal: ["spoon", "tbsp"],
  tsp: ["tsp"], teaspoon: ["tsp"], teaspoons: ["tsp"], teaskanal: ["tsp"],
  handful: ["handful"], handfuls: ["handful"], marek: ["handful"],
  scoop: ["scoop"], scoops: ["scoop"], cup: ["bowl", "glass"], cups: ["bowl", "glass"], bogre: ["glass", "bowl"],
  serving: ["serving", "portion"], servings: ["serving", "portion"], portion: ["portion", "serving"], portions: ["portion", "serving"], adag: ["portion", "serving"],
};
const GRAM_WORDS = new Set(["g", "gr", "gram", "grams", "gramm", "ml"]);
const FILLER = new Set(["of", "some", "x"]);

/** Drinks typed in the same sentence ("2 eggs, toast, coffee") are logged as drinks — caffeine and alcohol count. */
export type DrinkLine = { drink: Drink; count: number };
export type Parsed = { text: string; line: Line | null; drink?: DrinkLine; unsure: boolean; alternatives: Food[] };

/** What people type for the built-in drinks, English and Hungarian (accents folded). */
const DRINK_WORDS: Record<string, string[]> = {
  filter: ["coffee", "black coffee", "filter coffee", "kave", "fekete kave", "americano"],
  espresso: ["espresso", "eszpresszo", "presszo"], double: ["double espresso", "dupla espresso", "dupla eszpresszo", "doppio"],
  cappuccino: ["cappuccino", "kapucsino"], latte: ["latte", "flat white", "tejeskave"],
  redbull: ["red bull", "redbull"], "redbull-sf": ["red bull sugarfree", "sugarfree red bull", "red bull zero"], monster: ["monster", "energy drink", "energiaital"],
  cola: ["coke", "cola", "coca cola", "kola"], "cola-zero": ["coke zero", "cola zero", "pepsi max", "diet coke"],
  "black-tea": ["tea", "black tea", "tea black"], "green-tea": ["green tea", "zold tea"], preworkout: ["pre workout", "preworkout"],
  beer: ["beer", "sor", "pint", "korso"], "beer-small": ["small beer", "kis sor"], wine: ["wine", "bor", "red wine", "white wine", "voros bor", "feher bor", "frocs", "spritzer"],
  shot: ["shot", "palinka", "spirit", "vodka", "whisky", "whiskey", "rum", "gin", "tequila", "unicum"], cider: ["cider"],
};

/** "coffee", "2 beers", "egy sör", or one of your own drinks by name → a drink; null if it isn't one. */
export function matchDrink(words: string[], own: Drink[] = []): Drink | null {
  const q = words.join(" "), qs = words.map(singular).join(" ");
  for (const d of own) { const n = fold(d.name); if (n === q || n === qs) return d; }
  let best: { d: Drink; len: number } | null = null;
  for (const [id, aliases] of Object.entries(DRINK_WORDS)) for (const a of aliases) {
    if ((a === q || a === qs) && (!best || a.length > best.len)) best = { d: DRINKS.find((x) => x.id === id)!, len: a.length };
  }
  return best?.d ?? null;
}

/** Split on commas, "and", "és", "+", new lines. */
export const splitMeal = (text: string) => text.split(/,|;|\n|\+|\s+(?:and|és|es|meg|with)\s+/i).map((s) => s.trim()).filter(Boolean);

function readNumber(tok: string): number | null {
  if (NUMBER_WORDS[tok] != null) return NUMBER_WORDS[tok];
  const m = tok.match(/^(\d+(?:[.,]\d+)?)?([½¼¾])?$/);
  if (!m || (!m[1] && !m[2])) return null;
  return (m[1] ? Number(m[1].replace(",", ".")) : 0) + (m[2] === "½" ? 0.5 : m[2] === "¼" ? 0.25 : m[2] === "¾" ? 0.75 : 0);
}

const singular = (w: string) => (w.length > 3 && /(ches|shes|oes)$/.test(w) ? w.slice(0, -2) : w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);

function candidates(words: string[], mine: Food[]): { food: Food; score: number }[] {
  const pool: { food: Food; hay: string; aka: string; mine: boolean }[] = [
    ...mine.map((f) => ({ food: f, hay: fold(`${f.name} ${f.brand ?? ""}`), aka: "", mine: true })),
    ...BASIC_FOODS.filter((b) => !mine.some((m) => m.id === b.id)).map((f) => ({ food: f as Food, hay: fold(`${f.name} ${f.aka ?? ""}`), aka: fold(f.aka ?? ""), mine: false })),
  ];
  const q = words.join(" "), qs = words.map(singular).join(" ");
  const out: { food: Food; score: number }[] = [];
  for (const { food, hay, aka, mine: own } of pool) {
    const hayWords = hay.split(" ");
    if (!words.every((w) => hayWords.some((h) => h.startsWith(w) || h.startsWith(singular(w))))) continue;
    const name = fold(food.name);
    // The head of a name: "Egg, whole" → "egg"; "Toast (toasted white bread)" → "toast".
    const head = fold(food.name.split(/[,(]/)[0]);
    const defUnit = unitsOf(food)[0]?.name;
    let score = 0;
    if (name === q || name === qs) score += 5;
    if (head === q || head === qs) score += 3;
    else if (words.length === 1 && head.split(" ").at(-1) === qs) score += 2; // "rice" → "White rice", not "Rice cakes"
    else if (name.startsWith(q) || name.startsWith(qs)) score += 1;
    if (/\b(cooked|boiled|baked)\b/.test(name)) score += 0.2; // what you ate was usually cooked
    if (aka.split(" ")[0] === q) score += 3; // the first alias is the everyday Hungarian name
    if (defUnit && words.length === 1 && qs === fold(defUnit)) score += 1.5;
    if (own) score += 2;
    score -= name.length / 100;
    out.push({ food, score });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** kcal of one default amount — what "unsure" compares. */
const perUnit = (f: Food) => (f.per100.kcal * (unitsOf(f)[0]?.g ?? 100)) / 100;

/** One piece of a meal: "2 slices of toast", "200g rice", "an apple". */
export function parseItem(text: string, mine: Food[] = [], drinks: Drink[] = []): Parsed {
  let toks = fold(text).split(" ").filter(Boolean);
  let count: number | null = null, grams: number | null = null, unitWant: string[] | null = null;
  // "200g rice"
  const glued = toks[0]?.match(/^(\d+(?:[.,]\d+)?)(g|gr|ml)$/);
  if (glued) { grams = Number(glued[1].replace(",", ".")); toks = toks.slice(1); }
  else {
    const n = toks.length ? readNumber(toks[0]) : null;
    if (n != null) { count = n; toks = toks.slice(1); }
    if (toks[0] === "x") toks = toks.slice(1);
    if (count != null && toks[0] && GRAM_WORDS.has(toks[0])) { grams = count; count = null; toks = toks.slice(1); }
    else if (toks[0] && UNIT_WORDS[toks[0]]) { unitWant = UNIT_WORDS[toks[0]]; toks = toks.slice(1); }
  }
  toks = toks.filter((t) => !FILLER.has(t));
  if (!toks.length) return { text, line: null, unsure: true, alternatives: [] };
  const drink = grams == null ? matchDrink(toks, drinks) : null;
  if (drink) return { text, line: null, drink: { drink, count: count ?? 1 }, unsure: false, alternatives: [] };
  const found = candidates(toks, mine);
  if (!found.length) return { text, line: null, unsure: true, alternatives: [] };
  const [best] = found;
  const food = best.food;
  const units = unitsOf(food);
  let line: Line;
  if (grams != null) line = { food, count: 1, unit: null, grams };
  else {
    const u = unitWant ? units.find((x) => unitWant!.includes(x.name)) : undefined;
    line = units.length ? { food, count: count ?? 1, unit: (u ?? units[0]).name } : { food, count: 1, unit: null, grams: 100 * (count ?? 1) };
  }
  // Unsure = a close second that would change the calories a lot (white vs wholemeal bread is fine;
  // cooked vs dry rice is not), or a unit word the food doesn't have.
  const close = found.slice(1).filter((x) => x.score >= best.score - 0.5);
  const unsure = close.some((x) => Math.abs(perUnit(x.food) - perUnit(food)) > 0.25 * perUnit(food)) || (!!unitWant && !units.some((x) => unitWant!.includes(x.name)));
  return { text, line, unsure, alternatives: found.slice(1, 4).map((x) => x.food) };
}

export const parseMeal = (text: string, mine: Food[] = [], drinks: Drink[] = []) => splitMeal(text).map((t) => parseItem(t, mine, drinks));
