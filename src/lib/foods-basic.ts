/**
 * Everyday foods built into the app: instant, offline, no network. Branded products come from
 * Open Food Facts; this covers the plain things a barcode database is bad at ("chicken breast",
 * "rice, cooked", "túró"). Values per 100 g, typical references (USDA and Hungarian labels),
 * rounded — good to within a few percent, which is the honest precision of any food log.
 */

import type { Food } from "./types";

type Row = [name: string, kcal: number, p: number, c: number, f: number, servingG?: number, aka?: string];

const ROWS: Row[] = [
  // meat, fish, eggs
  ["Chicken breast, raw", 120, 22.5, 0, 2.6, 150, "csirkemell"],
  ["Chicken breast, cooked", 165, 31, 0, 3.6, 150, "csirkemell sült"],
  ["Chicken thigh, cooked", 209, 26, 0, 10.9, 120, "csirkecomb"],
  ["Turkey breast, cooked", 135, 30, 0, 1, 150, "pulykamell"],
  ["Beef mince 10% fat, raw", 176, 20, 0, 10, 125, "darált marha"],
  ["Beef steak, cooked", 250, 26, 0, 15, 200, "marha steak"],
  ["Pork loin, cooked", 242, 27, 0, 14, 150, "sertés karaj"],
  ["Pork shoulder, raw", 236, 17, 0, 18.5, 150, "sertés lapocka"],
  ["Ham, sliced", 145, 21, 1.5, 6, 30, "sonka"],
  ["Bacon, cooked", 541, 37, 1.4, 42, 20, "szalonna"],
  ["Sausage (kolbász)", 300, 13, 2, 27, 50, "kolbász virsli"],
  ["Salmon, raw", 208, 20, 0, 13, 125, "lazac"],
  ["Tuna, canned in water", 116, 26, 0, 0.8, 120, "tonhal"],
  ["Cod, cooked", 105, 23, 0, 0.9, 150, "tőkehal"],
  ["Egg, whole", 143, 12.6, 0.7, 9.5, 50, "tojás"],
  ["Egg white", 52, 10.9, 0.7, 0.2, 33, "tojásfehérje"],
  // dairy
  ["Milk 1.5%", 46, 3.4, 4.8, 1.5, 250, "tej"],
  ["Milk 3.5%", 64, 3.3, 4.7, 3.6, 250, "tej"],
  ["Greek yoghurt 0%", 59, 10.3, 3.6, 0.4, 150, "görög joghurt"],
  ["Greek yoghurt, full-fat", 97, 9, 3.9, 5, 150, "görög joghurt"],
  ["Natural yoghurt", 61, 3.5, 4.7, 3.3, 150, "natúr joghurt"],
  ["Túró (quark), half-fat", 105, 17, 3, 3, 250, "túró quark"],
  ["Cottage cheese", 98, 11, 3.4, 4.3, 200, "cottage"],
  ["Sour cream 20% (tejföl)", 204, 2.8, 3.5, 20, 30, "tejföl"],
  ["Cheese, Trappista / Gouda", 356, 25, 2.2, 27, 30, "sajt trappista"],
  ["Mozzarella", 280, 28, 3, 17, 60],
  ["Parmesan", 431, 38, 4, 29, 10],
  ["Butter", 717, 0.9, 0.1, 81, 10, "vaj"],
  ["Whey protein powder", 390, 78, 7, 6, 30, "fehérjepor"],
  // grains, potatoes
  ["Oats (zabpehely)", 379, 13, 67.7, 6.5, 50, "zabpehely"],
  ["White rice, cooked", 130, 2.7, 28, 0.3, 200, "rizs főtt"],
  ["White rice, dry", 360, 6.6, 79, 0.6, 80, "rizs"],
  ["Brown rice, cooked", 123, 2.7, 25.6, 1, 200, "barna rizs"],
  ["Pasta, cooked", 158, 5.8, 30.9, 0.9, 200, "tészta főtt"],
  ["Pasta, dry", 371, 13, 75, 1.5, 100, "tészta"],
  ["Bread, white", 265, 9, 49, 3.2, 35, "kenyér fehér"],
  ["Bread, wholemeal", 247, 13, 41, 3.4, 35, "teljes kiőrlésű kenyér"],
  ["Kifli", 280, 8, 55, 3, 40],
  ["Zsemle (bread roll)", 272, 8.8, 53, 1.8, 60, "zsemle"],
  ["Tortilla wrap", 310, 8, 50, 8, 60],
  ["Potatoes, boiled", 87, 1.9, 20, 0.1, 200, "burgonya krumpli főtt"],
  ["Sweet potato, baked", 90, 2, 20.7, 0.2, 200, "édesburgonya batáta"],
  ["French fries", 312, 3.4, 41, 15, 150, "hasábburgonya"],
  ["Corn flakes", 357, 7.5, 84, 0.4, 40],
  ["Granola", 471, 10, 64, 20, 50, "müzli"],
  ["Rice cakes", 387, 8, 81, 2.8, 9, "puffasztott rizs"],
  // fruit
  ["Banana", 89, 1.1, 22.8, 0.3, 120, "banán"],
  ["Apple", 52, 0.3, 13.8, 0.2, 180, "alma"],
  ["Orange", 47, 0.9, 11.8, 0.1, 150, "narancs"],
  ["Pear", 57, 0.4, 15, 0.1, 180, "körte"],
  ["Strawberries", 32, 0.7, 7.7, 0.3, 150, "eper"],
  ["Blueberries", 57, 0.7, 14.5, 0.3, 100, "áfonya"],
  ["Grapes", 69, 0.7, 18, 0.2, 150, "szőlő"],
  ["Dates", 282, 2.5, 75, 0.4, 30, "datolya"],
  ["Raisins", 299, 3.1, 79, 0.5, 30, "mazsola"],
  ["Orange juice", 45, 0.7, 10.4, 0.2, 250, "narancslé"],
  // vegetables, legumes
  ["Broccoli", 34, 2.8, 6.6, 0.4, 150, "brokkoli"],
  ["Tomato", 18, 0.9, 3.9, 0.2, 120, "paradicsom"],
  ["Cucumber", 15, 0.7, 3.6, 0.1, 150, "uborka"],
  ["Bell pepper", 26, 1, 6, 0.3, 150, "paprika"],
  ["Carrot", 41, 0.9, 9.6, 0.2, 80, "répa"],
  ["Onion", 40, 1.1, 9.3, 0.1, 80, "hagyma"],
  ["Spinach", 23, 2.9, 3.6, 0.4, 100, "spenót"],
  ["Salad leaves", 17, 1.2, 3.3, 0.2, 80, "saláta"],
  ["Green beans", 31, 1.8, 7, 0.2, 150, "zöldbab"],
  ["Mushrooms", 22, 3.1, 3.3, 0.3, 100, "gomba"],
  ["Avocado", 160, 2, 8.5, 14.7, 150, "avokádó"],
  ["Sweetcorn", 86, 3.3, 19, 1.4, 80, "kukorica"],
  ["Kidney beans, cooked", 127, 8.7, 22.8, 0.5, 150, "vörösbab bab"],
  ["Chickpeas, cooked", 164, 8.9, 27, 2.6, 150, "csicseriborsó"],
  ["Lentils, cooked", 116, 9, 20, 0.4, 150, "lencse"],
  // fats, nuts, sweet
  ["Olive oil", 884, 0, 0, 100, 10, "olívaolaj"],
  ["Sunflower oil", 884, 0, 0, 100, 10, "napraforgó olaj"],
  ["Peanut butter", 588, 25, 20, 50, 20, "mogyoróvaj"],
  ["Almonds", 579, 21, 22, 50, 30, "mandula"],
  ["Walnuts", 654, 15, 14, 65, 30, "dió"],
  ["Cashews", 553, 18, 30, 44, 30, "kesudió"],
  ["Dark chocolate 70%", 598, 7.8, 46, 43, 20, "étcsokoládé"],
  ["Milk chocolate", 535, 7.7, 59, 30, 20, "tejcsokoládé"],
  ["Honey", 304, 0.3, 82, 0, 20, "méz"],
  ["Sugar", 387, 0, 100, 0, 5, "cukor"],
  ["Jam", 250, 0.4, 62, 0.1, 20, "lekvár"],
  ["Protein bar", 360, 30, 35, 12, 60, "fehérjeszelet"],
  ["Potato chips", 536, 7, 53, 34, 30, "chips"],
  ["Ice cream", 207, 3.5, 24, 11, 100, "fagyi fagylalt"],
  ["Croissant", 406, 8.2, 45.8, 21, 60],
  ["Biscuits", 480, 6, 65, 22, 15, "keksz"],
  // dishes (typical home recipes; portions are a plate)
  ["Gulyásleves", 70, 5, 5, 3.5, 400, "gulyás goulash"],
  ["Pörkölt (pork)", 190, 16, 4, 12, 250, "pörkölt stew"],
  ["Paprikás csirke", 150, 14, 4, 9, 300, "chicken paprikash"],
  ["Lecsó", 60, 2, 6, 3.5, 300],
  ["Rántott hús (breaded schnitzel)", 290, 18, 14, 18, 180, "rántott schnitzel"],
  ["Főzelék", 90, 4, 12, 3, 300, "főzelék"],
  ["Túrós csusza", 220, 11, 25, 9, 350],
  ["Lángos with sour cream & cheese", 330, 9, 36, 17, 250, "lángos"],
  ["Palacsinta with jam", 230, 6, 36, 7, 70, "palacsinta pancake"],
  ["Pizza margherita", 250, 10, 31, 9, 300, "pizza"],
  ["Burger (beef, bun)", 250, 13, 24, 11, 220, "hamburger"],
  ["Gyros in pita", 215, 11, 22, 9, 350, "gyros kebab"],
  ["Sushi, maki", 150, 5, 29, 1, 200, "sushi"],
];

const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export const BASIC_FOODS: (Food & { aka?: string })[] = ROWS.map(([name, kcal, p, c, f, servingG, aka]) => ({
  id: `basic:${slug(name)}`, name, per100: { kcal, p, c, f }, servingG, source: "basic", aka,
}));

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Basic foods matching every word of the query, in English or Hungarian, accents optional. */
export function searchBasic(query: string, limit = 8): Food[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return BASIC_FOODS.filter((f) => { const hay = fold(`${f.name} ${f.aka ?? ""}`); return words.every((w) => hay.includes(w)); }).slice(0, limit);
}
