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

export const tokens = (s: string) => fold(s).split(" ").filter(Boolean);
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
export type Parsed = { text: string; line: Line | null; drink?: DrinkLine; unsure: boolean; alternatives: Food[]; /** Words skipped because no food has them ("normal"). */ ignored?: string[] };

/** What people type for the built-in drinks, English and Hungarian (accents folded). */
const DRINK_WORDS: Record<string, string[]> = {
  filter: ["coffee", "black coffee", "filter coffee", "kave", "fekete kave"], americano: ["americano"],
  long: ["long coffee", "hosszu kave", "hosszu", "lungo", "hosszu kavet"], instant: ["instant coffee", "instant kave", "nescafe"], "3in1": ["3in1", "3 in 1", "3in1 coffee", "harom az egyben"],
  decaf: ["decaf", "decaf coffee", "koffeinmentes kave"], "iced-coffee": ["iced coffee", "jeges kave"], matcha: ["matcha", "matcha latte"],
  hell: ["hell", "hell energy", "hell energy drink", "hell classic"], "hell-zero": ["hell zero", "hell sugar free", "hell cukormentes"], "hell-500": ["big hell", "hell 500", "hell 500ml"],
  "monster-ultra": ["monster ultra", "monster zero", "white monster", "monster ultra white"], burn: ["burn", "burn energy"],
  "cola-500": ["big coke", "coke 500", "coca cola 500"], pepsi: ["pepsi"],
  froccs: ["frocs", "spritzer", "frocc"], prosecco: ["prosecco", "pezsgo", "champagne", "sparkling wine"], "long-drink": ["long drink", "rum coke", "gin tonic", "vodka tonic", "whisky cola", "cuba libre"],
  espresso: ["espresso", "eszpresszo", "presszo"], double: ["double espresso", "dupla espresso", "dupla eszpresszo", "doppio"],
  cappuccino: ["cappuccino", "kapucsino"], latte: ["latte", "flat white", "tejeskave"],
  redbull: ["red bull", "redbull"], "redbull-sf": ["red bull sugarfree", "sugarfree red bull", "red bull zero"], monster: ["monster", "energy drink", "energiaital"],
  cola: ["coke", "cola", "coca cola", "kola"], "cola-zero": ["coke zero", "cola zero", "pepsi max", "diet coke"],
  "black-tea": ["tea", "black tea", "tea black"], "green-tea": ["green tea", "zold tea"], preworkout: ["pre workout", "preworkout"],
  beer: ["beer", "sor", "pint", "korso"], "beer-small": ["small beer", "kis sor"], wine: ["wine", "bor", "red wine", "white wine", "voros bor", "feher bor", "rose"],
  shot: ["shot", "palinka", "spirit", "vodka", "whisky", "whiskey", "rum", "gin", "tequila", "unicum"], cider: ["cider"],
};

/** "coffee", "2 beers", "egy sör", or one of your own drinks by name → a drink; null if it isn't one. */
export function matchDrink(words: string[], own: Drink[] = []): Drink | null {
  const q = words.join(" "), qs = words.map(singular).join(" ");
  for (const d of own) { const n = fold(d.name), a = fold(d.aka ?? ""); if (n === q || n === qs || (a && (a === q || a === qs))) return d; }
  let best: { d: Drink; len: number } | null = null;
  for (const [id, aliases] of Object.entries(DRINK_WORDS)) for (const a of aliases) {
    if ((a === q || a === qs) && (!best || a.length > best.len)) best = { d: DRINKS.find((x) => x.id === id)!, len: a.length };
  }
  return best?.d ?? null;
}

/** Split on commas, "and", "és", "+", new lines ("with" is kept: it's read as a side, below). */
export const splitMeal = (text: string) => text.split(/,|;|\n|\+|\s+(?:and|és|es|meg)\s+/i).map((s) => s.trim()).filter(Boolean);
/** "toast w butter", "coffee with milk", "pasta w/ mayo" → the main thing and its sides. */
const splitWith = (text: string) => text.split(/\s+(?:with|w\/?|plus)\s+/i).map((s) => s.trim()).filter(Boolean);

/**
 * Size words change the amount, not the food: "a small apple" is ¾ of an apple (or the food's own
 * "small apple" unit when it has one), "a big latte" is 1⅓ lattes. "normal" is just dropped.
 */
const SIZES: Record<string, number> = {
  small: 0.75, little: 0.75, mini: 0.5, kis: 0.75, kicsi: 0.75, medium: 1, normal: 1, regular: 1, average: 1, standard: 1, kozepes: 1,
  big: 1.33, large: 1.33, nagy: 1.33, huge: 1.6, xl: 1.6, extra: 1.33,
};
const SIZE_WORD: Record<number, string> = { 0.75: "small", 1.33: "large" };
/** Units a side ("with butter", "with milk") is counted in, smallest first. */
const SIDE_UNITS = ["thin spread", "splash", "tsp", "tbsp", "spoon"];

function readNumber(tok: string): number | null {
  if (NUMBER_WORDS[tok] != null) return NUMBER_WORDS[tok];
  const m = tok.match(/^(\d+(?:[.,]\d+)?)?([½¼¾])?$/);
  if (!m || (!m[1] && !m[2])) return null;
  return (m[1] ? Number(m[1].replace(",", ".")) : 0) + (m[2] === "½" ? 0.5 : m[2] === "¼" ? 0.25 : m[2] === "¾" ? 0.75 : 0);
}

const singular = (w: string) => (w.length > 3 && /(ches|shes|oes)$/.test(w) ? w.slice(0, -2) : w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);

function candidates(words: string[], mine: Food[]): { food: Food; score: number }[] {
  const pool: { food: Food; hay: string; aka: string; mine: boolean }[] = [
    ...mine.map((f) => ({ food: f, hay: fold(`${f.name} ${f.brand ?? ""} ${f.aka ?? ""}`), aka: fold(f.aka ?? ""), mine: true })),
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
    if (own && aka && (aka === q || aka === qs)) score += 6; // exactly what you typed when the AI made it
    else if (aka.split(" ")[0] === q) score += 3; // the first alias is the everyday Hungarian name
    if (defUnit && words.length === 1 && qs === fold(defUnit)) score += 1.5;
    if (own) score += 2;
    score -= name.length / 100;
    out.push({ food, score });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** kcal of one default amount — what "unsure" compares. */
const perUnit = (f: Food) => (f.per100.kcal * (unitsOf(f)[0]?.g ?? 100)) / 100;

/** The amount part of "2 slices of …", "200g …", "… 200 g", "a small …" — and the words left over. */
export type Amount = { count: number | null; grams: number | null; unitWant: string[] | null; size: number; words: string[] };
export function readAmount(tokens: string[]): Amount {
  let toks = tokens;
  // Size words anywhere: "one small apple", "2 normal toast", "big latte".
  const sizeTok = toks.find((t) => SIZES[t] != null);
  const size = sizeTok ? SIZES[sizeTok] : 1;
  toks = toks.filter((t) => SIZES[t] == null);
  // Amounts after the name: "chicken breast 200g", "rice 150 g", "eggs x3".
  let tail: { grams?: number; count?: number } = {};
  const last = toks.at(-1) ?? "", prev = toks.at(-2) ?? "";
  const tg = last.match(/^(\d+(?:[.,]\d+)?)(g|gr|ml)$/), tx = last.match(/^x(\d+)$/) ?? last.match(/^(\d+)x$/);
  if (toks.length > 1 && tg) { tail = { grams: Number(tg[1].replace(",", ".")) }; toks = toks.slice(0, -1); }
  else if (toks.length > 2 && GRAM_WORDS.has(last) && /^\d+([.,]\d+)?$/.test(prev)) { tail = { grams: Number(prev.replace(",", ".")) }; toks = toks.slice(0, -2); }
  else if (toks.length > 1 && tx) { tail = { count: Number(tx[1]) }; toks = toks.slice(0, -1); }
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
  if (tail.grams != null && grams == null && count == null) grams = tail.grams;
  if (tail.count != null && count == null) count = tail.count;
  if (tail.grams != null && grams == null && count == null) grams = tail.grams;
  if (tail.count != null && count == null) count = tail.count;
  return { count, grams, unitWant, size, words: toks.filter((t) => !FILLER.has(t)) };
}

/** One piece of a meal: "2 slices of toast", "200g rice", "an apple". */
export function parseItem(text: string, mine: Food[] = [], drinks: Drink[] = [], side = false): Parsed {
  let toks = fold(text).split(" ").filter(Boolean);
  // A drink whose own name has a size word in it ("small beer", "kis sör", "big coke") wins first.
  const lead = toks.length ? readNumber(toks[0]) : null;
  const named = (lead != null ? toks.slice(1) : toks).filter((t) => !FILLER.has(t));
  if (named.some((t) => SIZES[t] != null)) { const d = matchDrink(named, drinks); if (d) return { text, line: null, drink: { drink: d, count: lead ?? 1 }, unsure: false, alternatives: [] }; }
  const a = readAmount(toks);
  toks = a.words;
  const { size, unitWant } = a;
  let { count, grams } = a;
  toks = toks.filter((t) => !FILLER.has(t));
  if (!toks.length) return { text, line: null, unsure: true, alternatives: [] };
  const drink = grams == null ? matchDrink(toks, drinks) : null;
  if (drink) return { text, line: null, drink: { drink, count: Math.round((count ?? 1) * size * 4) / 4 }, unsure: false, alternatives: [] };
  let found = candidates(toks, mine);
  // Words no food knows ("normal", "homemade", typos) are dropped rather than sinking the match.
  let ignored: string[] = [];
  if (!found.length) {
    const vocab = vocabulary(mine);
    const known = toks.filter((t) => vocab.some((v) => v.startsWith(t) || v.startsWith(singular(t))));
    // Only when most of it is known: "fresh homemade toast" → toast, but "mystery stew" isn't a pörkölt.
    if (known.length && known.length < toks.length && known.length * 2 >= toks.length) { ignored = toks.filter((t) => !known.includes(t)); found = candidates(known, mine); }
  }
  if (!found.length) return { text, line: null, unsure: true, alternatives: [] };
  const [best] = found;
  const food = best.food;
  const units = unitsOf(food);
  let line: Line;
  if (grams != null) line = { food, count: 1, unit: null, grams };
  else {
    const u = unitWant ? units.find((x) => unitWant!.includes(x.name)) : undefined;
    // A side is counted in its smallest everyday unit: "with butter" is a thin spread, not a block.
    const sideU = side && !u ? SIDE_UNITS.map((n) => units.find((x) => x.name === n)).find(Boolean) : undefined;
    const base = u ?? sideU ?? units[0];
    // "small apple" → the food's own "small apple" unit if it has one, else ¾ of the usual one.
    const sized = base && size !== 1 && SIZE_WORD[size] ? units.find((x) => x.name === `${SIZE_WORD[size]} ${base.name}`) : undefined;
    const n = count ?? 1;
    line = !units.length ? { food, count: 1, unit: null, grams: Math.round(100 * n * size) }
      : sized ? { food, count: n, unit: sized.name }
      : { food, count: Math.round(n * size * 4) / 4, unit: base.name };
  }
  // Unsure = a close second that would change the calories a lot (white vs wholemeal bread is fine;
  // cooked vs dry rice is not), or a unit word the food doesn't have.
  const close = found.slice(1).filter((x) => x.score >= best.score - 0.5);
  const unsure = ignored.length > 0 || close.some((x) => Math.abs(perUnit(x.food) - perUnit(food)) > 0.25 * perUnit(food)) || (!!unitWant && !unitWant.includes("piece") && !units.some((x) => unitWant!.includes(x.name)));
  return { text, line, unsure, alternatives: found.slice(1, 4).map((x) => x.food), ...(ignored.length ? { ignored } : {}) };
}

/** Every word in every food name the parser knows — what "a word no food knows" is measured against. */
let vocabCache: { mine: Food[]; words: string[] } | null = null;
function vocabulary(mine: Food[]): string[] {
  if (vocabCache?.mine === mine) return vocabCache.words;
  const words = new Set<string>();
  for (const f of [...mine, ...BASIC_FOODS]) for (const w of fold(`${f.name} ${f.aka ?? ""}`).split(" ")) if (w.length > 1) words.add(w);
  vocabCache = { mine, words: [...words] };
  return vocabCache.words;
}

/**
 * One piece of the sentence → one or more lines. "2 toast w butter" → 2 slices of toast + 2 thin
 * spreads of butter (a side takes the main's count). "bolognese spaghetti" — no single food has
 * both words — becomes the two foods it's made of.
 */
function parsePiece(text: string, mine: Food[], drinks: Drink[]): Parsed[] {
  const [main, ...sides] = splitWith(text);
  const head = parseItem(main, mine, drinks);
  const out = head.line || head.drink ? [head] : splitDish(main, mine, drinks) ?? [head];
  const n = head.line && head.line.unit ? head.line.count : 1;
  for (const s of sides) {
    const hasNumber = /^\s*(\d|½|¼|¾|a |an |one |two |three |egy |ket)/i.test(s);
    const p = parseItem(hasNumber ? s : `${n} ${s}`, mine, drinks, true);
    out.push({ ...p, text: s });
  }
  return out;
}

/** "bolognese spaghetti" → ["bolognese", "spaghetti"] when each half is a food and the whole isn't. */
function splitDish(text: string, mine: Food[], drinks: Drink[]): Parsed[] | null {
  const words = text.trim().split(/\s+/);
  const lead = words[0] && readNumber(fold(words[0])) != null ? words.shift()! : "";
  for (let i = 1; i < words.length; i++) {
    const a = parseItem(`${lead} ${words.slice(0, i).join(" ")}`.trim(), mine, drinks), b = parseItem(words.slice(i).join(" "), mine, drinks);
    if ((a.line || a.drink) && (b.line || b.drink) && !a.ignored && !b.ignored) return [a, b];
  }
  return null;
}

export const parseMeal = (text: string, mine: Food[] = [], drinks: Drink[] = []) => splitMeal(text).flatMap((t) => parsePiece(t, mine, drinks));

/**
 * "coffee at 11", "2 eggs 8:30", "beer 9pm" → the clock time (minutes from midnight) and the text
 * without it, so a whole meal can be logged for earlier in the day. Null when there's no time.
 */
export function extractTime(text: string): { text: string; minute: number | null } {
  const pats: RegExp[] = [
    /\b(?:at|@)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\b/i,
    /\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)\b/i,
    /\b(\d{1,2})(?:[:.](\d{2}))?\s*-?kor\b()/i,
    /\b(\d{1,2})[:.](\d{2})\b()/,
  ];
  for (const re of pats) {
    const m = text.match(re);
    if (!m) continue;
    let h = Number(m[1]); const min = Number(m[2] ?? 0), ap = (m[3] ?? "").toLowerCase();
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    if (h > 23 || min > 59) continue;
    return { text: (text.slice(0, m.index) + text.slice(m.index! + m[0].length)).replace(/\s{2,}/g, " ").replace(/\s+,/g, ",").trim().replace(/,$/, ""), minute: h * 60 + min };
  }
  return { text, minute: null };
}
