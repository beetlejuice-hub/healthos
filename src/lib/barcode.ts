/**
 * Barcodes: point the camera at a can or a packet and it's found in Open Food Facts by its code —
 * no typing, no picking between brands. Pure parts live here (tested); the camera is in
 * components/Scanner.tsx and the lookup runs on our Worker (`/api/food?barcode=`).
 */

import type { Food } from "./types";
import { fromOff, OFF_FIELDS } from "./off";
import { mlInName } from "./drinkdb";

/** GTIN check digit (EAN-8, UPC-A, EAN-13, GTIN-14): weights 3,1,3,1… from the right, excluding the check digit. */
export function validGtin(code: string): boolean {
  if (!/^\d+$/.test(code) || ![8, 12, 13, 14].includes(code.length)) return false;
  const d = code.split("").map(Number), check = d.pop()!;
  const sum = d.reverse().reduce((s, v, i) => s + v * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/** One code per product: UPC-A (12) is an EAN-13 with a leading 0, which is how OFF stores it. */
export function normalizeGtin(code: string): string | null {
  const c = code.replace(/\D/g, "");
  if (!validGtin(c)) return null;
  return c.length === 12 ? `0${c}` : c;
}

export const BARCODE_FIELDS = `${OFF_FIELDS},quantity,categories_tags`;

type OffProduct = Parameters<typeof fromOff>[0] & { quantity?: string; categories_tags?: string[] };

export type Scanned = { food: Food; drink: boolean; ml: number | null };

/** An OFF product → a food, whether it's a drink (and its size, from "500 ml" / "0,33 l"). */
export function fromScan(code: string, p: OffProduct): Scanned | null {
  const food = fromOff({ ...p, code: p.code ?? code });
  if (!food) return null;
  const ml = mlInName(p.quantity ?? "") ?? mlInName(food.name);
  const drink = (p.categories_tags ?? []).some((t) => /^en:(beverages|drinks|sodas|waters|beers|wines|energy-drinks|carbonated-drinks|juices)/.test(t)) || (ml != null && !/\bg\b|kg/i.test(p.quantity ?? ""));
  return { food, drink, ml: drink ? ml : null };
}

export type Lookup = { status: "found"; scanned: Scanned } | { status: "missing" } | { status: "error" };

/** Look a code up in Open Food Facts. `fetcher` is injectable for tests and the Worker. */
export async function lookupBarcode(code: string, fetcher: typeof fetch = fetch): Promise<Lookup> {
  try {
    const r = await fetcher(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${BARCODE_FIELDS}`, { headers: { "User-Agent": "HealthOS/1.0 (personal app)" } });
    if (r.status === 404) return { status: "missing" };
    if (!r.ok) return { status: "error" };
    const body = (await r.json()) as { status?: number; product?: OffProduct };
    if (body.status === 0 || !body.product) return { status: "missing" };
    const scanned = fromScan(code, body.product);
    // Known code but no calories on it: as good as missing — it can't be logged honestly.
    return scanned ? { status: "found", scanned } : { status: "missing" };
  } catch {
    return { status: "error" };
  }
}

/** The app's lookup: our Worker (cached), else Open Food Facts directly. */
export async function findBarcode(code: string): Promise<Lookup> {
  try {
    const r = await fetch(`/api/food?barcode=${code}`);
    if (r.ok && (r.headers.get("content-type") ?? "").includes("application/json")) {
      const body = (await r.json()) as Lookup;
      if (body.status !== "error") return body;
    }
  } catch { /* fall through */ }
  return lookupBarcode(code);
}

/**
 * The bars of an EAN-13 as 95 modules ("1" = black), quiet zones not included. Not used by the app's
 * scanning — it's how tests and the browser suite draw a real barcode to scan.
 */
export function ean13Modules(code: string): string {
  if (!/^\d{13}$/.test(code)) throw new Error("EAN-13 needs 13 digits");
  const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
  const G = L.map((p) => p.split("").reverse().map((b) => (b === "1" ? "0" : "1")).join(""));
  const R = L.map((p) => p.split("").map((b) => (b === "1" ? "0" : "1")).join(""));
  const PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];
  const d = code.split("").map(Number), par = PARITY[d[0]];
  let s = "101";
  for (let i = 1; i <= 6; i++) s += (par[i - 1] === "L" ? L : G)[d[i]];
  s += "01010";
  for (let i = 7; i <= 12; i++) s += R[d[i]];
  return s + "101";
}
