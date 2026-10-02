/**
 * Hungarian → English for the plain-food database. USDA (lab-measured plain foods) only knows
 * English, so "csirkemell" found nothing there; Open Food Facts keeps your own words, since it knows
 * Hungarian products. Accent-insensitive; longest phrase first ("csirke mell" before "csirke").
 * Words it doesn't know pass through (brand names, "Milka").
 */

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const WORDS: [string, string][] = [
  // meat & fish
  ["csirkemell", "chicken breast"], ["csirke mell", "chicken breast"], ["csirkecomb", "chicken thigh"], ["csirke comb", "chicken thigh"],
  ["csirkeszarny", "chicken wing"], ["csirke", "chicken"], ["pulykamell", "turkey breast"], ["pulyka", "turkey"],
  ["marhahus", "beef"], ["marha", "beef"], ["daralthus", "ground beef"], ["daralt hus", "ground beef"], ["sertes", "pork"], ["karaj", "pork loin"],
  ["szuzpecsenye", "pork tenderloin"], ["sonka", "ham"], ["szalonna", "bacon"], ["kolbasz", "sausage"], ["virsli", "frankfurter"], ["szalami", "salami"],
  ["lazac", "salmon"], ["tonhal", "tuna"], ["hal", "fish"], ["garnela", "shrimp"], ["pisztrang", "trout"], ["ponty", "carp"],
  // dairy & eggs
  ["tojas", "egg"], ["tojasfeherje", "egg white"], ["tej", "milk"], ["teljes tej", "whole milk"], ["sovany tej", "skim milk"], ["tejfol", "sour cream"],
  ["tejszin", "cream"], ["vaj", "butter"], ["sajt", "cheese"], ["trappista", "cheese"], ["turo", "cottage cheese"], ["joghurt", "yogurt"], ["kefir", "kefir"],
  // grains & sides
  ["rizs", "rice"], ["barna rizs", "brown rice"], ["teszta", "pasta"], ["spagetti", "spaghetti"], ["makaroni", "macaroni"], ["zabpehely", "oats"], ["zab", "oats"],
  ["kenyer", "bread"], ["teljes kiorlesu", "whole wheat"], ["zsemle", "bread roll"], ["kifli", "bread roll"], ["liszt", "flour"], ["krumpli", "potato"],
  ["burgonya", "potato"], ["edesburgonya", "sweet potato"], ["husleves", "chicken soup"], ["bulgur", "bulgur"], ["kuszkusz", "couscous"], ["kinoa", "quinoa"],
  // veg & fruit
  ["paradicsom", "tomato"], ["uborka", "cucumber"], ["paprika", "bell pepper"], ["hagyma", "onion"], ["fokhagyma", "garlic"], ["repa", "carrot"],
  ["sargarepa", "carrot"], ["brokkoli", "broccoli"], ["karfiol", "cauliflower"], ["kaposzta", "cabbage"], ["spenot", "spinach"], ["salata", "lettuce"],
  ["gomba", "mushroom"], ["cukkini", "zucchini"], ["padlizsan", "eggplant"], ["bab", "beans"], ["lencse", "lentils"], ["borso", "peas"], ["csicseriborso", "chickpeas"],
  ["kukorica", "corn"], ["alma", "apple"], ["korte", "pear"], ["banan", "banana"], ["narancs", "orange"], ["mandarin", "tangerine"], ["szolo", "grapes"],
  ["eper", "strawberries"], ["malna", "raspberries"], ["afonya", "blueberries"], ["cseresznye", "cherries"], ["meggy", "sour cherries"], ["oszibarack", "peach"],
  ["kajszi", "apricot"], ["szilva", "plum"], ["gorogdinnye", "watermelon"], ["dinnye", "melon"], ["citrom", "lemon"], ["avokado", "avocado"],
  // nuts, fats, sweet
  ["dio", "walnuts"], ["mogyoro", "hazelnuts"], ["foldimogyoro", "peanuts"], ["mogyorovaj", "peanut butter"], ["mandula", "almonds"], ["kesudio", "cashews"],
  ["olaj", "oil"], ["olivaolaj", "olive oil"], ["napraforgo", "sunflower"], ["cukor", "sugar"], ["mez", "honey"], ["csokolade", "chocolate"], ["lekvar", "jam"],
  // how it's made
  ["fott", "cooked"], ["fozott", "cooked"], ["sult", "roasted"], ["rantott", "breaded fried"], ["grillezett", "grilled"], ["parolt", "steamed"],
  ["nyers", "raw"], ["fustolt", "smoked"], ["szaraz", "dry"],
].map(([h, e]) => [fold(h), e] as [string, string]).sort((a, b) => b[0].length - a[0].length);

/** The English for a Hungarian food query, or null if no word was Hungarian. */
export function toEnglish(query: string): string | null {
  let rest = ` ${fold(query).replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim()} `;
  let hit = false;
  for (const [hu, en] of WORDS) {
    const re = new RegExp(` ${hu}(?= )`, "g");
    if (re.test(rest)) { hit = true; rest = rest.replace(re, ` ${en.replace(/ /g, "\u0001")}`); }
  }
  return hit ? rest.replace(/\u0001/g, " ").replace(/\s+/g, " ").trim() : null;
}
