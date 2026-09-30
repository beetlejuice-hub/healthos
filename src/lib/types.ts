/**
 * The data model. Everything you log is an **entry** with a time (`at`, epoch ms) and a kind.
 * One list, one shape per kind — so the master graph, the day view and every insight read the
 * same thing, and a new kind is one union member, not a new table's worth of plumbing.
 */

export type Macros = { kcal: number; p: number; c: number; f: number };

/** Something you can eat, per 100 g. From Open Food Facts or added by you (and then reused). */
export type Food = {
  id: string;
  name: string;
  brand?: string;
  per100: Macros;
  /** Grams in one usual serving, when known — "1 bar", "1 slice". */
  servingG?: number;
  /** Everyday amounts to count in ("egg" = 50 g, "slice" = 35 g); the first is the default. */
  units?: Unit[];
  /** "typical" = the median of several near-identical products (see foodgroup.ts). */
  source: "off" | "usda" | "basic" | "custom" | "typical";
  barcode?: string;
  /** Small product photo (Open Food Facts), https only. */
  img?: string;
  /** For a typical food: how many products it's the median of. */
  basis?: number;
  /** You changed the values; your version is what's saved and offered again. */
  edited?: boolean;
};

export type Unit = { name: string; g: number };

/** A drink's active contents, per serving. Coffee, energy drinks, beer, wine. */
export type Drink = {
  id: string;
  name: string;
  ml: number;
  caffeineMg: number;
  /** Grams of pure alcohol. 0 for anything non-alcoholic. */
  alcoholG: number;
  kcal: number;
};

/**
 * When in the day a supplement belongs. Owner: "morning, midday and evening categorized, each
 * arrives at a set time — not sure it's worth tracking exact time for supps."
 */
export type Slot = "morning" | "midday" | "evening";
export const SLOTS: { id: Slot; name: string; at: number }[] = [
  { id: "morning", name: "Morning", at: 8 * 60 },
  { id: "midday", name: "Midday", at: 13 * 60 },
  { id: "evening", name: "Evening", at: 21 * 60 + 30 },
];
export const slotOf = (at: number): Slot => (at < 11 * 60 ? "morning" : at < 17 * 60 ? "midday" : "evening");
export const slotTime = (slot: Slot) => SLOTS.find((s) => s.id === slot)!.at;

/** A supplement in your stack. `at` is always its slot's time (kept so older data still reads). */
export type Supplement = {
  id: string;
  name: string;
  dose: string;
  slot: Slot;
  /** Minutes from midnight — the slot's time. */
  at: number;
  active: boolean;
};

export type Entry =
  | { id: string; kind: "food"; at: number; foodId?: string; name: string; grams: number; macros: Macros; /** As you counted it: 2 × "egg". */ count?: number; unit?: string }
  | { id: string; kind: "drink"; at: number; drinkId?: string; name: string; ml: number; caffeineMg: number; alcoholG: number; kcal: number }
  | { id: string; kind: "supp"; at: number; suppId: string; status: "taken" | "skipped" }
  | { id: string; kind: "set"; at: number; workoutId: string; exercise: string; kg: number; reps: number }
  | { id: string; kind: "weight"; at: number; kg: number }
  | { id: string; kind: "feel"; at: number; energy?: number; mood?: number; focus?: number; anxiety?: number; stress?: number; note?: string };

export type EntryKind = Entry["kind"];
export type EntryOf<K extends EntryKind> = Extract<Entry, { kind: K }>;

export type Workout = {
  id: string;
  template: string;
  startedAt: number;
  endedAt: number | null;
  /** This session's exercises: a copy of the template at start, changed by adds and swaps. */
  plan?: Template["exercises"];
  /** How it felt, in your words. */
  note?: string;
};

/** A saved split day: "Upper A" → bench, row, OHP, pulldown, with the reps you aim for. */
export type Template = {
  id: string;
  name: string;
  exercises: { name: string; sets: number; reps: number; restSec: number }[];
};

export type Goals = Macros;

export const DEFAULT_GOALS: Goals = { kcal: 2600, p: 160, c: 300, f: 80 };
