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

describe("the owner's real sentences (1 Oct)", () => {
  it("size words, words after the name, 'w butter', words no food knows", () => {
    const lineText = (p: ReturnType<typeof parseItem>) => (p.line ? `${p.line.food.name} · ${amountText(p.line.count, p.line.unit!)}${p.unsure ? " ?" : ""}` : "—");
    expect(parseMeal("one small apple, 3 eggs scrambled, 2 pieces of bacon cooked, 2 normal toast w butter").map(lineText)).toEqual([
      "Apple · 1 small apple", "Scrambled eggs · 3 eggs", "Bacon, cooked · 2 rashers", "Toast (white) · 2 slices", "Butter · 2 thin spreads",
    ]);
    const meal = parseMeal("2 normal toast w butter");
    expect(meal.map((p) => p.line && amountText(p.line.count, p.line.unit!))).toEqual(["2 slices", "2 thin spreads"]);
  });
  it("a side is a small amount: coffee with milk is a splash", () => {
    expect(parseMeal("coffee with milk").map((p) => (p.drink ? p.drink.drink.name : `${p.line?.food.name} ${p.line?.unit}`))).toEqual(["Filter coffee", "Milk 1.5% splash"]);
  });
  it("size scales the count when the food has no sized unit", () => {
    expect(short("a big banana")).toBe("Banana · 1¼ bananas"); // rounded to a quarter
    expect(parseItem("a large latte").drink?.count).toBe(1.25);
  });
  it("grams after the name", () => {
    expect(short("chicken breast 200g")).toMatch(/Chicken breast.* · 200 g/);
    expect(short("rice 150 g")).toMatch(/rice.* · 150 g/i);
  });
  it("a dish no single food matches is split into its parts", () => {
    expect(parseMeal("bolognese spaghetti").map((p) => p.line?.food.name)).toEqual(["Bolognese sauce", "Pasta, cooked"]);
  });
});

describe("more drinks", () => {
  const name = (t: string) => parseItem(t).drink?.drink.name ?? "—";
  it("Hell, long coffee, fröccs, and sized drink names", () => {
    expect([name("hell energy drink"), name("2 hell"), name("hell zero"), name("hosszú kávé"), name("a long coffee"), name("fröccs"), name("small beer"), name("kis sör"), name("big coke")]).toEqual([
      "Hell Energy 250 ml", "Hell Energy 250 ml", "Hell Zero 250 ml", "Long coffee (hosszú kávé)", "Long coffee (hosszú kávé)", "Fröccs (spritzer) 200 ml", "Beer 330 ml, 5%", "Beer 330 ml, 5%", "Coca-Cola 500 ml",
    ]);
  });
});

describe("unknown words", () => {
  it("dropped only when most of the item is known, and then marked for a check", () => {
    expect(parseItem("fresh homemade toast").line).toBeNull(); // 1 of 3 known: not guessed
    const p = parseItem("homemade toast");
    expect(p.line?.food.name).toBe("Toast (white)");
    expect(p.unsure).toBe(true);
    expect(parseItem("zzz mystery stew").line).toBeNull();
  });
});

describe("how it was made (owner, 2 Oct: '1 cooked salmon' came out 420 kcal)", () => {
  it("'1 cooked salmon' is one salmon line with cooked reference values — not 'Cod, cooked' plus raw salmon", () => {
    const r = parseMeal("1 cooked salmon, 2 slices of bread");
    expect(r.map((p) => p.line?.food.name)).toEqual(["Salmon, cooked", "Bread, white"]);
    expect(r[0].line?.food.per100.kcal).toBe(206); // USDA farmed Atlantic, dry heat
    expect(r[0].line?.unit).toBe("fillet");
  });
  it("prep words in either language, and a prep word alone is not a food", () => {
    for (const q of ["grilled salmon", "főtt lazac", "sült lazac"]) expect(parseItem(q).line?.food.name).toBe("Salmon, cooked");
    expect(parseItem("sült csirkemell").line?.food.name).toBe("Chicken breast, cooked");
    expect(parseItem("1 cooked").line).toBeNull();
  });
  it("a food of your own that's raw becomes cooked by the cooking factor", () => {
    const mine = [{ id: "own:1", name: "Csirkemell filé Tesco", per100: { kcal: 105, p: 23, c: 0, f: 1.5 }, source: "custom" as const }];
    const p = parseItem("grillezett tesco csirkemell", mine);
    expect(p.line?.food.name).toBe("Csirkemell filé Tesco, cooked");
    expect(p.line?.food.per100.kcal).toBe(140);
  });
});

describe("logging without weighing (owner, 7 Oct: \"i am not really measuring my food, just like 1 serving, 3 eggs, 1 plate\")", () => {
  const one = (t: string) => parseMeal(t)[0];
  const line = (t: string) => { const p = one(t); return p.line ? `${p.line.food.name} · ${p.line.count} ${p.line.unit ?? "g"} = ${Math.round(gramsOf(p.line))} g` : p.drink ? `drink ${p.drink.drink.name} ×${p.drink.count}` : "none"; };
  it("his breakfast, as he wrote it", () => {
    expect(parseMeal("3 scrambled eggs, small can of tuna, cheese, 2 toast with butter").map((p) => p.line?.food.name))
      .toEqual(["Scrambled eggs", "Tuna, canned in water", "Cheese, Trappista / Gouda", "Toast (white)", "Butter"]);
  });
  it("the count after the name: 'scrambled eggs 3', 'kifli 2', 'beer 2'", () => {
    expect(line("scrambled eggs 3")).toBe("Scrambled eggs · 3 egg = 183 g");
    expect(line("kifli 2")).toBe("Kifli · 2 kifli = 80 g");
    expect(line("beer 2")).toBe("drink Beer 500 ml, 5% ×2");
  });
  it("…but a number that is part of a name stays in the name", () => {
    expect(line("hell 500")).toMatch(/^drink Hell Energy 500 ml ×1$/);
    expect(line("milk 1.5")).toMatch(/^Milk 1\.5% · 1 glass/);
    expect(line("chicken breast 200")).not.toMatch(/× ?200|200 breast/);
  });
  it("tuna in oil is its own food; plain 'tuna' stays in water but asks", () => {
    expect(line("tuna in oil")).toMatch(/^Tuna, canned in oil/);
    const t = one("tuna");
    expect(t.line?.food.name).toBe("Tuna, canned in water");
    expect(t.unsure).toBe(true);
    expect(t.alternatives.map((f) => f.name)).toContain("Tuna, canned in oil (drained)");
  });
  it("your hand as the measure: palm, fist, cupped hand, thumb", () => {
    expect(line("1 palm chicken breast")).toBe("Chicken breast, cooked · 1 palm-size = 100 g");
    expect(line("a palm of salmon")).toMatch(/^Salmon, cooked · 1 palm-size = 100 g$/);
    expect(line("a fist of rice")).toBe("White rice, cooked · 1 fist = 150 g");
    expect(line("2 fists pasta")).toBe("Pasta, cooked · 2 fist = 280 g");
    expect(line("a cupped hand of almonds")).toBe("Almonds · 1 handful = 30 g");
    expect(line("thumb of butter")).toBe("Butter · 1 thumb = 10 g");
    expect(line("2 thumbs peanut butter")).toBe("Peanut butter · 2 thumb = 32 g");
  });
  it("every everyday food that is meat or fish has a palm; every cooked starch a fist; every fat a thumb", () => {
    const has = (name: string, unit: string) => unitsOf(BASIC_FOODS.find((f) => f.name === name)!).some((u) => u.name === unit);
    for (const n of ["Chicken breast, cooked", "Chicken thigh, cooked", "Turkey breast, cooked", "Beef steak, cooked", "Pork loin, cooked", "Salmon, cooked", "Cod, cooked"]) expect(has(n, "palm-size"), n).toBe(true);
    for (const n of ["White rice, cooked", "Brown rice, cooked", "Pasta, cooked", "Potatoes, boiled", "Sweet potato, baked", "Lentils, cooked", "Chickpeas, cooked", "Kidney beans, cooked"]) expect(has(n, "fist"), n).toBe(true);
    for (const n of ["Butter", "Olive oil", "Sunflower oil", "Peanut butter", "Mayonnaise", "Cheese, Trappista / Gouda"]) expect(has(n, "thumb"), n).toBe(true);
  });
});
