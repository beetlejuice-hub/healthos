/**
 * Finding an exercise while typing (PLAN 94; owner, 14 Oct: "When i want to do a diff exercise that not in day i should be
 * able to choose one from all the already made ones and when typing it should appear not make a completely new exercise
 * thats the same", and "Add leg pushing machine" — the leg press was there, under a name he didn't type). Pure.
 *
 *  - exerciseSearch: every word you type must start a word of the exercise's name, its equipment, its muscles or a
 *    nickname — English or Hungarian, accents optional ("leg machine", "gépi", "csuklo"). Yours (used before) first.
 *  - sameName: the exercise a typed name already is, so "bench press" or "Pullups" never becomes a second exercise.
 */

import { MUSCLES, mainMuscle } from "./training";

/** Other names people type for an exercise, English and Hungarian. */
const NICK: Record<string, string> = {
  "Leg press": "leg push pushing machine labtolo labtolas",
  "Single-leg leg press": "leg push machine labtolo",
  "Leg press calf raise": "labtolo vadli",
  "Bench press": "flat bench fekvenyomas",
  "DB bench press": "fekvenyomas",
  "Incline bench press": "ferde fekvenyomas",
  "Incline DB press": "ferde fekvenyomas",
  "Chest press machine": "gepi mellnyomas",
  "Squat": "back squat guggolas",
  "Front squat": "guggolas",
  "Goblet squat": "guggolas",
  "Hack squat": "machine guggolas",
  "Smith machine squat": "guggolas",
  "Deadlift": "felhuzas",
  "Romanian deadlift": "rdl roman felhuzas",
  "Overhead press": "ohp military press vallbol nyomas",
  "DB shoulder press": "vallbol nyomas",
  "Shoulder press machine": "vallbol nyomas",
  "Pull-ups": "pullup huzodzkodas",
  "Chin-ups": "chinup huzodzkodas",
  "Assisted pull-up machine": "huzodzkodas",
  "Dips": "tolodzkodas",
  "Barbell row": "bent over row evezes",
  "DB row": "one arm row evezes",
  "Seated cable row": "low row evezes",
  "Machine row": "evezes",
  "Lat pulldown": "lehuzas mellre huzas",
  "Close-grip lat pulldown": "lehuzas",
  "Bicep curl": "curl bicepsz",
  "Tricep pushdown": "letolas tricepsz",
  "Rope pushdown": "letolas tricepsz",
  "Skull crusher": "homloknyomas",
  "Leg extension": "labfeszites",
  "Leg curl": "hamstring curl combhajlitas",
  "Seated leg curl": "combhajlitas",
  "Lying leg curl": "combhajlitas",
  "Calf raise": "lábujjhegy vadli",
  "Seated calf raise": "vadli",
  "Lateral raise": "side raise oldalemeles",
  "Cable lateral raise": "oldalemeles",
  "Machine lateral raise": "oldalemeles",
  "Hip thrust": "csipoemeles",
  "Glute bridge": "csipoemeles",
  "Wrist curl": "csuklo",
  "Reverse wrist curl": "csuklo",
  "Wrist roller": "csuklo",
  "Farmer's carry": "farmer walk grip",
  "Dead hang": "grip fugges",
  "Plate pinch": "grip",
  "Shrugs": "trapez vallvonogatas",
  "Lunges": "kitores",
  "Bulgarian split squat": "kitores",
  "Plank": "has",
  "Hanging leg raise": "labemeles",
};
/** A muscle's words, English and Hungarian (no accents: they're taken off what you type too). */
const MUSCLE_WORDS: Record<string, string> = {
  Chest: "chest pecs mell", Shoulders: "shoulders delts vall", Biceps: "biceps bicepsz", Triceps: "triceps tricepsz",
  Forearms: "forearms grip wrist alkar csuklo", Back: "back lats hat", Core: "core abs has", Quads: "quads legs comb lab",
  Hamstrings: "hamstrings legs combhajlito lab", Glutes: "glutes far fenek", Calves: "calves vadli",
};
/** Equipment, from the name, or said here for the ones whose name doesn't. */
const MACHINES = new Set(["Leg press", "Hack squat", "Leg extension", "Leg curl", "Seated leg curl", "Lying leg curl", "Pec deck", "Seated calf raise", "Pendulum squat", "Belt squat", "Reverse pec deck", "Single-leg leg press", "Leg press calf raise", "Lat pulldown", "Close-grip lat pulldown"]);
const CABLES = new Set(["Lat pulldown", "Close-grip lat pulldown", "Seated cable row", "Tricep pushdown", "Rope pushdown", "Face pull", "Cable crunch", "Straight-arm pulldown", "Pallof press"]);
export const EQUIPS = ["machine", "cable", "dumbbell", "barbell", "bodyweight", "other"] as const;
export type Equip = (typeof EQUIPS)[number];
export const EQUIP_NAMES: Record<Equip, string> = { machine: "Machine", cable: "Cable", dumbbell: "Dumbbell", barbell: "Barbell", bodyweight: "Bodyweight", other: "Other" };
const EQUIP_WORDS: Record<Equip, string> = { machine: "machine gep gepi", cable: "cable kabel csiga", dumbbell: "dumbbell db kezisulyzo egykezes", barbell: "barbell rud", bodyweight: "bodyweight sajat testsuly", other: "" };
/** The ones the name doesn't give away (#81: browsing a muscle by machine / dumbbell / …): how it's usually done. */
const EQUIP_OF: Record<string, Equip> = {
  "Pull-ups": "bodyweight", "Chin-ups": "bodyweight", "Dips": "bodyweight", "Push-ups": "bodyweight", "Diamond push-ups": "bodyweight", "Bench dips": "bodyweight",
  "Inverted row": "bodyweight", "Plank": "bodyweight", "Side plank": "bodyweight", "Hanging leg raise": "bodyweight", "Hanging knee raise": "bodyweight",
  "Decline sit-up": "bodyweight", "Dead bug": "bodyweight", "Russian twist": "bodyweight", "Back extension": "bodyweight", "Dead hang": "bodyweight",
  "Nordic curl": "bodyweight", "Sissy squat": "bodyweight", "Glute-ham raise": "bodyweight", "Glute bridge": "bodyweight", "Calf raise": "bodyweight", "Single-leg calf raise": "bodyweight",
  "Bulgarian split squat": "dumbbell", "Bicep curl": "dumbbell", "Lateral raise": "dumbbell", "Front raise": "dumbbell", "Chest fly": "dumbbell", "Rear delt fly": "dumbbell", "Chest-supported row": "dumbbell",
  "Overhead tricep extension": "dumbbell", "Lunges": "dumbbell", "Walking lunges": "dumbbell", "Reverse lunge": "dumbbell", "Step-ups": "dumbbell", "Single-leg RDL": "dumbbell",
  "Wrist curl": "dumbbell", "Reverse wrist curl": "dumbbell", "Farmer's carry": "dumbbell", "Spider curl": "dumbbell", "Zottman curl": "dumbbell",
  "T-bar row": "barbell", "Preacher curl": "barbell", "Skull crusher": "barbell", "Hip thrust": "barbell", "Upright row": "barbell", "Reverse curl": "barbell",
  "Landmine press": "barbell", "Z press": "barbell", "Meadows row": "barbell", "Seal row": "barbell", "JM press": "barbell",
  "Single-arm lat pulldown": "cable", "Standing leg curl": "machine", "Donkey calf raise": "machine",
  "Wrist roller": "other", "Plate pinch": "other", "Ab wheel": "other", "Kettlebell swing": "other",
};
/** Every kind of equipment an exercise's name says, most specific first ("Hack squat": machine, then barbell). */
function equipments(name: string): Equip[] {
  if (EQUIP_OF[name]) return [EQUIP_OF[name]];
  const n = name.toLowerCase(), out: Equip[] = [];
  if (MACHINES.has(name) || /machine|smith/.test(n)) out.push("machine");
  if (CABLES.has(name) || /cable/.test(n)) out.push("cable");
  if (/\b(db|dumbbells?)\b/.test(n) || /^(hammer|concentration|incline db|arnold|goblet|tricep kickback)/.test(n)) out.push("dumbbell");
  if (/barbell|bench press|squat$|deadlift|^overhead press|pendlay|ez-bar|rack pull|good morning|shrugs/.test(n) && !/db|machine|smith/.test(n)) out.push("barbell");
  return out;
}
/** The one kind it's listed under when you browse a muscle. */
export const equipOf = (name: string): Equip => equipments(name)[0] ?? "other";
const equipment = (name: string) => equipments(name).map((e) => EQUIP_WORDS[e]).join(" ");

/** Lower case, accents and apostrophes off, other punctuation to spaces: "Farmer's carry" → "farmers carry", "Csukló" → "csuklo". */
export const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").replace(/['’]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
/** The same name however it's typed: no spaces or hyphens, a plural "s" off each word. */
const key = (s: string) => fold(s).split(" ").map((w) => (w.length > 2 && w.endsWith("s") ? w.slice(0, -1) : w)).join("");

export type Found = { name: string; muscle: string | null; mine: boolean };

/** The exercise a typed name already is (yours or the app's), or null when it's new. */
export function sameName(typed: string, mine: string[] = []): string | null {
  const k = key(typed); if (!k) return null;
  return mine.find((n) => key(n) === k) ?? Object.keys(MUSCLES).find((n) => key(n) === k) ?? null;
}

/** The name to save for what's typed: the exercise it already is, or the new name, tidied. */
export const nameFor = (typed: string, mine: string[] = []) => sameName(typed, mine) ?? typed.trim().replace(/\s+/g, " ");

/**
 * Exercises matching what's typed: yours and the app's, best first — the name itself, then a name starting with it, then
 * yours, then the rest in the library's order. Empty query: yours, most recent first, then nothing.
 */
export function exerciseSearch(q: string, mine: string[] = [], limit = 8): Found[] {
  const words = fold(q).split(" ").filter(Boolean);
  const all = [...new Set([...mine, ...Object.keys(MUSCLES)])];
  const mineSet = new Set(mine);
  const found = (name: string): Found => ({ name, muscle: mainMuscle(name), mine: mineSet.has(name) });
  if (!words.length) return mine.slice(0, limit).map(found);
  // what's typed may already be one, written another way ("pullups", "benchpress"): that one first, always
  const same = sameName(q, mine);
  const scored: [number, number, string][] = [];
  all.forEach((name, i) => {
    if (name === same) { scored.push([-1, i, name]); return; }
    const ms = Object.entries(MUSCLES[name] ?? {}), mw = (prime: boolean) => ms.filter(([, v]) => (v >= 1) === prime).map(([m]) => MUSCLE_WORDS[m] ?? m).join(" ");
    // the name (run together too, so "benchpr" finds "Bench press"), then its nicknames and equipment, then the muscles it
    // works most, then the ones it only helps: "csukló" puts wrist curls before hammer curls
    const f = fold(name), qq = words.join(" "), w0 = f.split(" ").concat(f.replace(/ /g, ""));
    const w1 = w0.concat(fold(`${NICK[name] ?? ""} ${equipment(name)}`).split(" ")), w2 = w1.concat(fold(mw(true)).split(" ")), w3 = w2.concat(fold(mw(false)).split(" "));
    const has = (hay: string[]) => words.every((w) => hay.some((h) => h.startsWith(w)));
    const score = f === qq ? 0 : f.startsWith(qq) ? 1 : has(w0) ? 2 : has(w1) ? 2.5 : has(w2) ? 3 : has(w3) ? 3.5 : null;
    if (score == null) return;
    scored.push([score - (mineSet.has(name) ? 0.25 : 0), i, name]);
  });
  return scored.sort((a, b) => a[0] - b[0] || a[1] - b[1]).slice(0, limit).map(([, , n]) => found(n));
}

/**
 * What Enter or the Add / Swap button takes for what's typed: the exercise it already is, else the best match, else the
 * new name. A really new name that matches something is still one tap away, on its own "new exercise" row.
 */
export const pickFor = (typed: string, mine: string[] = []) => (typed.trim() ? sameName(typed, mine) ?? exerciseSearch(typed, mine, 1)[0]?.name ?? nameFor(typed, mine) : "");

export type Browsed = { name: string; equip: Equip; mine: boolean };
/**
 * Browsing a muscle (#81; owner: "i should do shoulder and i can choose between exercises and machine or dumbbell etc"):
 * every exercise it's a main muscle of — Dips under chest and triceps — yours first (most recent first), then the
 * library's, without `skip` (what's already planned).
 */
export function byMuscle(muscle: string, mine: string[] = [], skip: string[] = []): Browsed[] {
  const mineSet = new Set(mine);
  return [...new Set([...mine, ...Object.keys(MUSCLES)])]
    .filter((n) => !skip.includes(n) && (MUSCLES[n]?.[muscle] ?? 0) >= 1)
    .map((n) => ({ name: n, equip: equipOf(n), mine: mineSet.has(n) }));
}
