import { describe, expect, it } from "vitest";
import { toEnglish } from "./hu";
import { searchAll } from "./foodsearch";

describe("Hungarian → English for USDA", () => {
  it("translates everyday food words, accents or not", () => {
    expect(toEnglish("csirkemell")).toBe("chicken breast");
    expect(toEnglish("Csirke mell")).toBe("chicken breast");
    expect(toEnglish("főtt rizs")).toBe("cooked rice");
    expect(toEnglish("fott rizs")).toBe("cooked rice");
    expect(toEnglish("spagetti")).toBe("spaghetti");
    expect(toEnglish("sárgarépa")).toBe("carrot");
    expect(toEnglish("túró")).toBe("cottage cheese");
  });

  it("whole words only, longest first", () => {
    expect(toEnglish("kesudió")).toBe("cashews"); // not "kesu walnuts"
    expect(toEnglish("teljes tej")).toBe("whole milk");
    expect(toEnglish("halászlé")).toBeNull(); // "hal" inside a word isn't "fish"
  });

  it("English or brand queries are left alone", () => {
    expect(toEnglish("chicken breast")).toBeNull();
    expect(toEnglish("Milka")).toBeNull();
  });

  it("the search asks USDA in English and Open Food Facts in your words", async () => {
    const asked: string[] = [];
    const fetcher = (async (u: string) => { asked.push(decodeURIComponent(String(u))); return new Response(JSON.stringify({ hits: [], foods: [], products: [] })); }) as unknown as typeof fetch;
    await searchAll("csirkemell", undefined, fetcher);
    expect(asked.find((u) => u.includes("nal.usda.gov"))).toContain("query=chicken breast");
    expect(asked.find((u) => u.includes("openfoodfacts"))).toContain("q=csirkemell");
  });
});
