import { describe, expect, it } from "vitest";
import { extractTime, parseItem, parseMeal } from "./quickadd";
import { amountText, approx, gramsOf, macrosOfLine, mealFood, plural, step, unitsOf } from "./units";
import { BASIC_FOODS } from "./foods-basic";

const short = (text: string, mine = []) => {
  const p = parseItem(text, mine);
  return p.line ? `${p.line.food.name} · ${p.line.unit ? amountText(p.line.count, p.line.unit) : `${p.line.grams} g`}${p.unsure ? " ?" : ""}` : "—";
};

describe("type what you ate", () => {
  it("reads the owner's example", () => {
    expect(parseMeal("2 scrambled eggs, toast, an apple").map((p) => short(p.text))).toEqual([
      "Scrambled eggs · 2 eggs", "Toast (white) · 1 slice", "Apple · 1 apple",
    ]);
  });

  it("reads Hungarian", () => {
    expect(parseMeal("2 tojás, pirítós és egy alma").map((p) => short(p.text))).toEqual([
      "Egg, whole · 2 eggs", "Toast (white) · 1 slice", "Apple · 1 apple",
    ]);
  });

  it("plain 'eggs' means whole eggs, not egg whites", () => {
    expect(short("3 eggs")).toBe("Egg, whole · 3 eggs");
  });

  it("reads unit words, grams and fractions", () => {
    expect(short("2 slices of bread")).toBe("Bread, white · 2 slices");
    expect(short("200g rice")).toMatch(/rice.* · 200 g/i);
    expect(short("½ avocado")).toBe("Avocado · ½ avocado");
    expect(short("1 tbsp olive oil")).toBe("Olive oil · 1 tbsp");
    expect(short("2 szelet kenyér")).toBe("Bread, white · 2 slices");
  });

  it("prefers your own saved foods", () => {
    const special = mealFood("custom:1", "Arnold's special", [{ food: BASIC_FOODS.find((f) => f.name === "Scrambled eggs")!, count: 6, unit: "egg" }], 6);
    expect(short("3 arnold's special", [special] as never)).toBe("Arnold's special · 3 pieces");
  });

  it("says when it isn't sure or doesn't know", () => {
    expect(short("rice")).toBe("White rice, cooked · 1 bowl"); // not rice cakes
    expect(parseItem("milk").unsure).toBe(true); // 1.5% or 3.5%: 40% apart per glass
    expect(parseItem("milk").alternatives.length).toBeGreaterThan(0);
    expect(parseItem("bread").unsure).toBe(false); // white or wholemeal: close enough
    expect(parseItem("zzqx").line).toBeNull();
  });
});

describe("units", () => {
  it("every everyday food can be counted", () => {
    expect(BASIC_FOODS.filter((f) => !f.units?.length).map((f) => f.name)).toEqual([]);
  });
  it("turns a count into grams and ≈ calories", () => {
    const eggs = { food: BASIC_FOODS.find((f) => f.name === "Scrambled eggs")!, count: 2, unit: "egg" };
    expect(gramsOf(eggs)).toBe(122);
    expect(approx(macrosOfLine(eggs).kcal)).toBe(180);
  });
  it("plurals and steps", () => {
    expect([plural("egg", 2), plural("slice", 1), plural("glass", 2), plural("half", 2), plural("potato", 3)]).toEqual(["eggs", "slice", "glasses", "halves", "potatoes"]);
    expect([step(1, 1), step(0.5, 1), step(1, -1), step(2.5, -1), step(0.5, -1)]).toEqual([2, 1, 0.5, 2, 0.5]);
  });
  it("a saved meal is counted in pieces with the right calories", () => {
    const eggs = BASIC_FOODS.find((f) => f.name === "Scrambled eggs")!, toast = BASIC_FOODS.find((f) => f.name.startsWith("Toast"))!;
    const lines = [{ food: eggs, count: 4, unit: "egg" }, { food: toast, count: 2, unit: "slice" }];
    const total = lines.reduce((a, l) => a + macrosOfLine(l).kcal, 0);
    const special = mealFood("custom:x", "Arnold's special", lines, 4);
    expect(unitsOf(special)[0].name).toBe("piece");
    expect(macrosOfLine({ food: special, count: 4, unit: "piece" }).kcal).toBeCloseTo(total, 5);
    expect(macrosOfLine({ food: special, count: 1, unit: "piece" }).kcal).toBeCloseTo(total / 4, 5);
  });
});

describe("drinks in the same sentence", () => {
  const d = (text: string) => { const p = parseItem(text); return p.drink ? `${p.drink.count} × ${p.drink.drink.name}` : p.line ? `food: ${p.line.food.name}` : "—"; };
  it("coffee, beer, wine are drinks — caffeine and alcohol count", () => {
    expect(parseMeal("2 eggs, 2 toast, coffee").map((p) => (p.drink ? p.drink.drink.name : p.line?.food.name))).toEqual(["Egg, whole", "Toast (white)", "Filter coffee"]);
    expect([d("2 beers"), d("egy sör"), d("a glass of wine"), d("double espresso"), d("kávé"), d("coke zero")]).toEqual([
      "2 × Beer 500 ml, 5%", "1 × Beer 500 ml, 5%", "1 × Wine 150 ml, 12%", "1 × Double espresso", "1 × Filter coffee", "1 × Coke Zero 330 ml",
    ]);
  });
  it("only whole names: 'coffee cake' or 'orange juice' stay food", () => {
    expect(d("orange juice")).toBe("food: Orange juice");
    expect(parseItem("coffee cake").drink).toBeUndefined();
  });
  it("your own drinks by name", () => {
    const office = { id: "drink:o", name: "Office coffee", ml: 200, caffeineMg: 120, alcoholG: 0, kcal: 5 };
    expect(parseItem("2 office coffee", [], [office]).drink).toEqual({ drink: office, count: 2 });
  });
});

describe("logging for earlier", () => {
  it("reads a time in the sentence and takes it out", () => {
    expect(extractTime("coffee at 11")).toEqual({ text: "coffee", minute: 660 });
    expect(extractTime("2 eggs, toast at 8:30")).toEqual({ text: "2 eggs, toast", minute: 510 });
    expect(extractTime("beer 9pm")).toEqual({ text: "beer", minute: 1260 });
    expect(extractTime("kávé 11kor")).toEqual({ text: "kávé", minute: 660 });
    expect(extractTime("2 eggs, toast")).toEqual({ text: "2 eggs, toast", minute: null });
  });
});
