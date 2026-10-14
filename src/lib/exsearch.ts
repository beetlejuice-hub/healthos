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
function equipment(name: string): string {
  const n = name.toLowerCase(), out: string[] = [];
  if (MACHINES.has(name) || /machine|smith/.test(n)) out.push("machine gep gepi");
  if (CABLES.has(name) || /cable/.test(n)) out.push("cable kabel csiga");
  if (/\b(db|dumbbells?)\b/.test(n) || /^(hammer|concentration|incline db|arnold|goblet|tricep kickback)/.test(n)) out.push("dumbbell db kezisulyzo egykezes");
  if (/barbell|bench press|squat$|deadlift|^overhead press|pendlay|ez-bar|rack pull|good morning|shrugs/.test(n) && !/db|machine|smith/.test(n)) out.push("barbell rud");
  return out.join(" ");
}

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
