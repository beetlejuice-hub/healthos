import { describe, expect, it } from "vitest";
import { scanGrayBuffer } from "@undecaf/zbar-wasm";
import { ean13Modules, fromScan, lookupBarcode, normalizeGtin, validGtin } from "./barcode";
import { handleFood } from "../../worker/index";

const SPRITE = "5449000014535";
const sprite = { code: SPRITE, product_name: "Sprite", brands: "Sprite", quantity: "500 ml", categories_tags: ["en:beverages", "en:carbonated-drinks"], nutriments: { "energy-kcal_100g": 19, carbohydrates_100g: 4.5, proteins_100g: 0, fat_100g: 0 } };

describe("codes", () => {
  it("checks the check digit", () => {
    expect(validGtin(SPRITE)).toBe(true);
    expect(validGtin("5449000014536")).toBe(false); // one digit off: a misread
    expect(validGtin("96385074")).toBe(true); // EAN-8
    expect(validGtin("036000291452")).toBe(true); // UPC-A
    expect(validGtin("12345")).toBe(false);
  });
  it("UPC-A becomes the EAN-13 OFF stores", () => {
    expect(normalizeGtin("036000291452")).toBe("0036000291452");
    expect(normalizeGtin(" 5449000014535 ")).toBe(SPRITE);
    expect(normalizeGtin("5449000014536")).toBeNull();
  });
});

describe("product → food or drink", () => {
  it("a can of Sprite is a 500 ml drink", () => {
    expect(fromScan(SPRITE, sprite)).toMatchObject({ drink: true, ml: 500, food: { name: "Sprite", per100: { kcal: 19 } } });
  });
  it("a chocolate bar is a food, even with 'ml' nowhere", () => {
    const bar = { code: "1", product_name: "Milka Alpine Milk", quantity: "100 g", categories_tags: ["en:snacks", "en:chocolates"], nutriments: { "energy-kcal_100g": 539, proteins_100g: 6.6, carbohydrates_100g: 59, fat_100g: 29 } };
    expect(fromScan("1", bar)).toMatchObject({ drink: false, ml: null });
  });
  it("no calories on the label → can't be logged → treated as missing", async () => {
    const fetcher = (async () => new Response(JSON.stringify({ status: 1, product: { product_name: "Mystery" } }))) as unknown as typeof fetch;
    expect((await lookupBarcode("1", fetcher)).status).toBe("missing");
  });
});

describe("lookup", () => {
  const fake = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
  it("found, missing (OFF says status 0 or 404), and a network error are three different answers", async () => {
    expect((await lookupBarcode(SPRITE, fake(200, { status: 1, product: sprite }))).status).toBe("found");
    expect((await lookupBarcode(SPRITE, fake(200, { status: 0 }))).status).toBe("missing");
    expect((await lookupBarcode(SPRITE, fake(404, {}))).status).toBe("missing");
    expect((await lookupBarcode(SPRITE, fake(503, {}))).status).toBe("error");
    expect((await lookupBarcode(SPRITE, (async () => { throw new Error("offline"); }) as unknown as typeof fetch)).status).toBe("error");
  });

  it("the Worker route: normalises the code, refuses junk", async () => {
    const real = globalThis.fetch;
    let asked = "";
    globalThis.fetch = (async (u: string) => { asked = u; return new Response(JSON.stringify({ status: 1, product: { ...sprite, code: "0036000291452" } })); }) as unknown as typeof fetch;
    try {
      const env = { ASSETS: { fetch: async () => new Response("") } };
      const ok = await handleFood(new Request("https://app/api/food?barcode=036000291452"), env);
      expect(((await ok.json()) as { status: string }).status).toBe("found");
      expect(asked).toContain("/product/0036000291452.json");
      const bad = await handleFood(new Request("https://app/api/food?barcode=123"), env);
      expect(bad.status).toBe(400);
    } finally { globalThis.fetch = real; }
  });
});

describe("the decoder reads a real barcode", () => {
  it("zbar decodes an EAN-13 drawn from ean13Modules (so the test drawing is a real barcode)", async () => {
    const mods = ean13Modules(SPRITE), px = 3, quiet = 12 * px, h = 80;
    const w = mods.length * px + 2 * quiet;
    const buf = new Uint8Array(w * h).fill(255);
    for (let y = 0; y < h; y++) for (let i = 0; i < mods.length; i++) if (mods[i] === "1") for (let k = 0; k < px; k++) buf[y * w + quiet + i * px + k] = 0;
    const found = await scanGrayBuffer(buf.buffer, w, h);
    expect(found[0]?.typeName).toBe("ZBAR_EAN13"); // the name Scanner.tsx filters on
    expect(found.map((s) => s.decode())).toContain(SPRITE);
  });
});
