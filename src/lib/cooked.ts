/**
 * Dry or cooked? The most common logging mistake: 100 g of cooked pasta is ~160 kcal, 100 g dry is
 * ~360. Package labels are for the dry (or raw) product; a plate is weighed cooked. So pasta, rice and
 * meat lines get a "Weighed: dry · cooked" switch that converts the values by how much the food gains
 * (water) or loses (meat) in cooking. Factors = cooked weight ÷ uncooked weight, typical values.
 */

import type { Food } from "./types";

export type CookKind = "pasta" | "rice" | "meat";
export type CookState = "uncooked" | "cooked";

export const FACTOR: Record<CookKind, number> = { pasta: 2.25, rice: 2.7, meat: 0.75 };
export const WORD: Record<CookKind, Record<CookState, string>> = {
  pasta: { uncooked: "dry", cooked: "cooked" }, rice: { uncooked: "dry", cooked: "cooked" }, meat: { uncooked: "raw", cooked: "cooked" },
};

const RX: [CookKind, RegExp][] = [
  ["pasta", /\b(pasta|spaghetti|spagetti|penne|fusilli|macaroni|makaroni|tagliatelle|linguine|farfalle|rigatoni|noodles?|teszta|tészta)\b/i],
  ["rice", /\b(rice|rizs|basmati|jasmine)\b/i],
  ["meat", /\b(chicken|csirke\w*|turkey|pulyka\w*|beef|marha\w*|pork|sertés|sertes|karaj|salmon|lazac|tuna steak|minced|darált|daralt)\b/i],
];
/** Ready meals, sauces and snacks are eaten as they come: no switch for them. */
const NOT = /\b(sauce|szósz|szosz|soup|leves|bolognese|carbonara|salad|saláta|cake|puffasztott|milk|drink|chips|crackers?|nuggets?|sandwich|pizza|ready|kész|kesz|canned|konzerv|sausage|kolbász|ham|sonka|bacon|szalonna|salami)\b/i;

export function cookKind(f: Food): CookKind | null {
  const text = `${f.name} ${f.brand ?? ""}`;
  if (NOT.test(text)) return null;
  for (const [k, re] of RX) if (re.test(text)) return k;
  return null;
}

const COOKED = /\b(cooked|boiled|roasted|grilled|baked|fried|steamed|főtt|fott|főzött|fozott|sült|sult|grillezett|párolt|parolt)\b/i;
const UNCOOKED = /\b(dry|dried|raw|uncooked|száraz|szaraz|nyers)\b/i;

/** Which version a food's values are for: its name says so, else (pasta, rice) its calories do. */
export function cookState(f: Food, k: CookKind): CookState {
  if (COOKED.test(f.name)) return "cooked";
  if (UNCOOKED.test(f.name)) return "uncooked";
  if (k === "meat") return "uncooked"; // packaged meat labels are for raw
  return f.per100.kcal >= 250 ? "uncooked" : "cooked";
}

const r1 = (v: number) => Math.round(v * 10) / 10;

/** The same food, per 100 g of the other version. */
export function convert(f: Food, k: CookKind, to: CookState): Food {
  const from = cookState(f, k);
  if (from === to) return f;
  const x = to === "cooked" ? 1 / FACTOR[k] : FACTOR[k];
  const base = f.name.replace(new RegExp(`[,\\s]*${COOKED.source}`, "gi"), "").replace(new RegExp(`[,\\s]*${UNCOOKED.source}`, "gi"), "").trim();
  return {
    ...f,
    id: `${f.id.replace(/~(cooked|uncooked)$/, "")}${to === "cooked" ? "~cooked" : "~uncooked"}`,
    name: `${base}, ${WORD[k][to]}`,
    per100: { kcal: r1(f.per100.kcal * x), p: r1(f.per100.p * x), c: r1(f.per100.c * x), f: r1(f.per100.f * x) },
    servingG: undefined, units: undefined,
    note: `${WORD[k][to]} weight: from the ${WORD[k][from]} values (×${FACTOR[k]} in cooking)`,
  };
}
