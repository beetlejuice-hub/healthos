/**
 * The one store. Everything the app shows is read from here; every change goes through `act`.
 *
 * **Device first.** State lives in memory, is saved to `localStorage` on every change, and is read
 * back synchronously at boot, so the app opens instantly and works offline. Sync with Supabase
 * (phone ↔ laptop) plugs in through `setRemote` and never blocks the screen.
 */

import { useSyncExternalStore } from "react";
import type { Drink, Entry, Food, Goals, Supplement, Template, Workout } from "./types";
import { DEFAULT_GOALS } from "./types";

export type Settings = {
  halfLifeMin: number;
  bedMinute: number;
  caffeineTargetMg: number;
  coffeeMg: number;
  bodyKg: number;
};

export type State = {
  entries: Entry[];
  foods: Food[];
  drinks: Drink[];
  supplements: Supplement[];
  templates: Template[];
  workouts: Workout[];
  goals: Goals;
  settings: Settings;
};

export const DEFAULT_SETTINGS: Settings = { halfLifeMin: 300, bedMinute: 23 * 60, caffeineTargetMg: 50, coffeeMg: 95, bodyKg: 78 };

/** Your stack from the discovery answers; times are editable. */
const DEFAULT_STACK: Supplement[] = [
  { id: "creatine", name: "Creatine", dose: "5 g", at: 8 * 60 + 15, active: true },
  { id: "vitd", name: "Vitamin D3", dose: "2000 IU", at: 8 * 60 + 15, active: true },
  { id: "cumin", name: "Black cumin seed oil", dose: "1 tsp", at: 8 * 60 + 15, active: true },
  { id: "mag", name: "Magnesium", dose: "400 mg", at: 22 * 60 + 30, active: true },
  { id: "saffron", name: "Saffron", dose: "30 mg", at: 22 * 60 + 30, active: true },
];

const DEFAULT_TEMPLATES: Template[] = [
  { id: "upper-a", name: "Upper A", exercises: [
    { name: "Bench press", sets: 3, reps: 6, restSec: 150 }, { name: "Barbell row", sets: 3, reps: 8, restSec: 120 },
    { name: "Overhead press", sets: 3, reps: 6, restSec: 150 }, { name: "Lat pulldown", sets: 3, reps: 10, restSec: 90 }] },
  { id: "lower-a", name: "Lower A", exercises: [
    { name: "Squat", sets: 3, reps: 5, restSec: 180 }, { name: "Romanian deadlift", sets: 3, reps: 8, restSec: 150 },
    { name: "Leg press", sets: 3, reps: 10, restSec: 120 }, { name: "Calf raise", sets: 3, reps: 12, restSec: 60 }] },
  { id: "upper-b", name: "Upper B", exercises: [
    { name: "Overhead press", sets: 3, reps: 6, restSec: 150 }, { name: "Pull-ups", sets: 3, reps: 8, restSec: 120 },
    { name: "Incline DB press", sets: 3, reps: 10, restSec: 120 }, { name: "Bicep curl", sets: 3, reps: 12, restSec: 60 }] },
  { id: "lower-b", name: "Lower B", exercises: [
    { name: "Deadlift", sets: 3, reps: 5, restSec: 180 }, { name: "Front squat", sets: 3, reps: 6, restSec: 150 },
    { name: "Leg curl", sets: 3, reps: 12, restSec: 90 }] },
];

const EMPTY: State = {
  entries: [], foods: [], drinks: [], supplements: DEFAULT_STACK, templates: DEFAULT_TEMPLATES, workouts: [],
  goals: DEFAULT_GOALS, settings: DEFAULT_SETTINGS,
};

const KEY = "healthos.v1";

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const s = JSON.parse(raw) as Partial<State>;
    return { ...EMPTY, ...s, settings: { ...DEFAULT_SETTINGS, ...s.settings }, goals: { ...DEFAULT_GOALS, ...s.goals } };
  } catch {
    return EMPTY;
  }
}

let state: State = typeof localStorage === "undefined" ? EMPTY : load();
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

/** Something that mirrors changes to a server. Set once auth is ready. */
export type Remote = { push: (next: State, prev: State) => void };
let remote: Remote | null = null;
export const setRemote = (r: Remote | null) => { remote = r; };

function commit(next: State) {
  const prev = state;
  state = next;
  listeners.forEach((l) => l());
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* full or blocked: the in-memory copy still works */ } }, 150);
  remote?.push(next, prev);
}

/** Replace everything — used when the server's copy arrives. */
export const replaceState = (next: State) => commit(next);

export const getState = () => state;
export const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export function useStore<T>(pick: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => pick(state), () => pick(state));
}

export const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

const byTime = (a: Entry, b: Entry) => a.at - b.at;

type NewEntry = Entry extends infer E ? (E extends Entry ? Omit<E, "id"> : never) : never;

export const act = {
  addEntry(e: NewEntry): Entry {
    const full = { ...e, id: newId() } as Entry;
    commit({ ...state, entries: [...state.entries, full].sort(byTime) });
    return full;
  },
  updateEntry(id: string, patch: Partial<Entry>) {
    commit({ ...state, entries: state.entries.map((e) => (e.id === id ? ({ ...e, ...patch } as Entry) : e)).sort(byTime) });
  },
  removeEntry(id: string) {
    commit({ ...state, entries: state.entries.filter((e) => e.id !== id) });
  },
  /** Save a food so it's offered again next time — owner: "if I once add a food it should be saved". */
  rememberFood(f: Food) {
    commit({ ...state, foods: [f, ...state.foods.filter((x) => x.id !== f.id)].slice(0, 500) });
  },
  saveDrink(d: Drink) {
    commit({ ...state, drinks: [d, ...state.drinks.filter((x) => x.id !== d.id)] });
  },
  setSupplements(list: Supplement[]) { commit({ ...state, supplements: list }); },
  setTemplates(list: Template[]) { commit({ ...state, templates: list }); },
  setGoals(goals: Goals) { commit({ ...state, goals }); },
  setSettings(patch: Partial<Settings>) { commit({ ...state, settings: { ...state.settings, ...patch } }); },
  startWorkout(template: string, at = Date.now()): Workout {
    const w: Workout = { id: newId(), template, startedAt: at, endedAt: null };
    commit({ ...state, workouts: [...state.workouts, w] });
    return w;
  },
  endWorkout(id: string, at = Date.now()) {
    commit({ ...state, workouts: state.workouts.map((w) => (w.id === id ? { ...w, endedAt: at } : w)) });
  },
  /** Add or remove the generated sample data (ids start with `sample:`). */
  loadSample(sample: Pick<State, "entries" | "workouts">) {
    const keep = state.entries.filter((e) => !e.id.startsWith("sample:"));
    commit({ ...state, entries: [...keep, ...sample.entries].sort(byTime), workouts: [...state.workouts.filter((w) => !w.id.startsWith("sample:")), ...sample.workouts] });
  },
  clearSample() {
    commit({ ...state, entries: state.entries.filter((e) => !e.id.startsWith("sample:")), workouts: state.workouts.filter((w) => !w.id.startsWith("sample:")) });
  },
};

/** For tests: reset to a known state without touching storage. */
export const __setState = (s: State) => { state = s; listeners.forEach((l) => l()); };
export const EMPTY_STATE = EMPTY;
