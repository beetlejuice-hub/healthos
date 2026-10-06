/**
 * The one store. Everything the app shows is read from here; every change goes through `act`.
 *
 * **Device first.** State lives in memory, is saved to `localStorage` on every change, and is read
 * back synchronously at boot, so the app opens instantly and works offline. Sync with Supabase
 * (phone ↔ laptop) plugs in through `setRemote` and never blocks the screen.
 */

import { PROGRAMS, asSplit } from "./programs";
import { useSyncExternalStore } from "react";
import type { Drink, Entry, Food, Goals, Supplement, Template, Workout } from "./types";
import { DEFAULT_GOALS, slotOf, slotsOf, slotTime } from "./types";
import { tidyWorkouts } from "./training";
import type { ScoutMemo } from "./scout";
import type { DigestItem, ModelChoice, NightAnswer, Question, SupplementAnswer } from "./ai/tasks";

/** Everything the in-app AI keeps for you, synced like the rest (doc "ai"). */
export type AiState = {
  /** Which model answers: everyday (food, chat, questions) and research (supplements, morning read). */
  models: { everyday: ModelChoice; research: ModelChoice };
  /** "What the AI knows about me": lines it added (you can delete any). */
  memory: { id: string; text: string; at: number }[];
  chat: { role: "user" | "assistant"; text: string; at: number; unprompted?: boolean }[];
  /** The morning read, for the day it's for. */
  digest: { day: string; greeting: string; items: DigestItem[]; read?: boolean } | null;
  /** The nightly read-back of a day (optional: older synced docs don't have it). */
  night?: (NightAnswer & { day: string; at: number }) | null;
  /** Titles already shown, so the morning read doesn't repeat itself. */
  shown: string[];
  /** Today's questions; daily ones are asked again every day without a new AI call. */
  questions: { day: string; list: Question[] } | null;
  daily: Question[];
  asked: string[];
  /** Supplement look-ups, by supplement id. */
  research: Record<string, SupplementAnswer & { at: number; /** The name you typed when it was looked up. */ asked: string }>;
  /** Protocols you chose to try: the app compares before and during. */
  experiments: Experiment[];
  /** When you last opened the AI tab: newer unprompted messages show a dot. */
  seenAt: number;
};
export type Experiment = { id: string; name: string; how: string; days: number; measure: string; start: string; ended?: string };
export const EMPTY_AI: AiState = { models: { everyday: "opus", research: "opus" }, memory: [], chat: [], digest: null, night: null, shown: [], questions: null, daily: [], asked: [], research: {}, experiments: [], seenAt: 0 };

/**
 * What the calculations need. Only `bedMinute` (planned bedtime) and `usualDrink` are asked of you;
 * the rest are sensible defaults for now and will be learned from your data (owner: half-life and
 * the bedtime caffeine level "should come from AI/knowledge or my data", not a form).
 */
export type Settings = {
  halfLifeMin: number;
  /** Planned bedtime. Actual bedtime comes from the wearable later. */
  bedMinute: number;
  /** Fallback caffeine for "a coffee" when no usual drink is chosen. */
  coffeeMg: number;
  bodyKg: number;
  /** The drink the one-tap button logs. Chosen on Today; ✕ clears it. */
  usualDrink: Drink | null;
  /** Which reminders to send, once notifications are on (Settings → Notifications). */
  notify?: { checkins: boolean; supps: boolean; weigh: boolean };
  /** Two-week check-ins answered (lib/checkin): when, the rate then, and the calorie goal before/after. */
  checkins?: { at: number; lossPerWeek: number; kcalBefore: number; kcalAfter: number }[];
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
  /** About you: what the stack check (and later the AI) takes into account. */
  profile: Profile;
  /** Patterns the scout has shown you: when first flagged, and whether you dismissed them. */
  scout: Record<string, ScoutMemo>;
  ai: AiState;
};

export type Profile = { conditions: string[]; meds: string[]; allergies: string[]; notes: string };
export const EMPTY_PROFILE: Profile = { conditions: [], meds: [], allergies: [], notes: "" };

export const DEFAULT_SETTINGS: Settings = { halfLifeMin: 300, bedMinute: 23 * 60, coffeeMg: 95, bodyKg: 78, usualDrink: null };

/** Your stack from the discovery answers; times are editable. */
const DEFAULT_STACK: Supplement[] = [
  { id: "creatine", name: "Creatine", dose: "5 g", slot: "morning", at: 8 * 60, active: true },
  { id: "vitd", name: "Vitamin D3", dose: "2000 IU", slot: "morning", at: 8 * 60, active: true },
  { id: "cumin", name: "Black cumin seed oil", dose: "1 tsp", slot: "morning", at: 8 * 60, active: true },
  { id: "mag", name: "Magnesium", dose: "400 mg", slot: "evening", at: 21 * 60 + 30, active: true },
  { id: "saffron", name: "Saffron", dose: "30 mg", slot: "evening", at: 21 * 60 + 30, active: true },
];

/** Older saves had a free time per supplement; snap each to its slot. */
export const normalizeStack = (list: Supplement[]): Supplement[] =>
  list.map((s) => {
    const slots = slotsOf({ slot: s.slot ?? slotOf(s.at), slots: s.slots });
    return { ...s, slot: slots[0], slots: slots.length > 1 ? slots : undefined, at: slotTime(slots[0]) };
  });

/** The split every account started with before 6 Oct, kept to recognise one nobody has changed. */
const STARTER_TEMPLATES: Template[] = [
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

/** The split a new account starts with: the owner's plan (owner, 6 Oct: the starter split "should be replaced w the saved workouts"). */
const DEFAULT_TEMPLATES: Template[] = asSplit(PROGRAMS.find((p) => p.id === "ppm")!);

const dayKey = (t: Template[]) => JSON.stringify(t.map((d) => [d.name, d.exercises.map((e) => [e.name, e.sets, e.reps, e.restSec])]));
/** A split still exactly as the old starter left it becomes the owner's plan; any split someone changed is theirs and stays. */
export const upgradeStarter = (t: Template[]): Template[] => (dayKey(t) === dayKey(STARTER_TEMPLATES) ? asSplit(PROGRAMS.find((p) => p.id === "ppm")!) : t);

const EMPTY: State = {
  entries: [], foods: [], drinks: [], supplements: DEFAULT_STACK, templates: DEFAULT_TEMPLATES, workouts: [],
  goals: DEFAULT_GOALS, settings: DEFAULT_SETTINGS, profile: EMPTY_PROFILE, scout: {}, ai: EMPTY_AI,
};

/** The save slot. Per account once signed in, so a tester and a personal account never mix. */
let KEY = "healthos.v1";
export const storageKey = () => KEY;

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const s = JSON.parse(raw) as Partial<State>;
    return { ...EMPTY, ...s, templates: upgradeStarter(s.templates ?? EMPTY.templates), supplements: normalizeStack(s.supplements ?? EMPTY.supplements), settings: { ...DEFAULT_SETTINGS, ...s.settings }, goals: { ...DEFAULT_GOALS, ...s.goals }, profile: { ...EMPTY_PROFILE, ...s.profile }, scout: s.scout ?? {}, ai: { ...EMPTY_AI, ...s.ai } };
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

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* full or blocked: the in-memory copy still works */ }
}

function commit(next: State, fromServer = false) {
  const prev = state;
  state = next;
  listeners.forEach((l) => l());
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 150);
  // Changes that came *from* the server aren't sent back to it.
  if (!fromServer) remote?.push(next, prev);
}

/** Apply the server's copy without queuing it to be sent back. */
export const applyFromServer = (next: State) => commit({ ...next, templates: upgradeStarter(next.templates) }, true);

/** Kept on the device outside the state (a half-built meal, a dismissed card). A reset clears them too. */
export const DEVICE_KEYS = ["healthos.basket", "healthos.noticed.hidden"];

/** This device back to a brand-new account: every entry, saved food, setting and learned memo gone. */
export function resetLocal() {
  for (const k of DEVICE_KEYS) { try { localStorage.removeItem(k); } catch { /* blocked storage */ } }
  commit({ ...EMPTY }, true);
  clearUndo(); // an "Undo" for something that no longer exists
  // Written now, not on the usual short delay: closing the app right after a reset mustn't bring it back.
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  save();
}

/**
 * Switch to an account's save slot. The first time an account opens on a device that has data
 * from before sign-in (the unscoped slot), that data moves into the account so nothing is lost;
 * returns true when it did, so sync can upload it.
 */
export function openStore(userId: string): boolean {
  if (saveTimer) { clearTimeout(saveTimer); save(); }
  const slot = `healthos.v1:${userId}`;
  let adopted = false;
  try {
    if (!localStorage.getItem(slot) && localStorage.getItem("healthos.v1")) {
      localStorage.setItem(slot, localStorage.getItem("healthos.v1")!);
      localStorage.removeItem("healthos.v1");
      adopted = true;
    }
  } catch { /* storage blocked */ }
  KEY = slot;
  state = load();
  listeners.forEach((l) => l());
  return adopted;
}

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
    // The newest 500, plus every food saved with a barcode (a scan of it must keep finding it).
    commit({ ...state, foods: [f, ...state.foods.filter((x) => x.id !== f.id)].filter((x, i) => i < 500 || !!x.barcode) });
  },
  saveDrink(d: Drink) {
    commit({ ...state, drinks: [d, ...state.drinks.filter((x) => x.id !== d.id)] });
  },
  setSupplements(list: Supplement[]) { commit({ ...state, supplements: normalizeStack(list) }); },
  setTemplates(list: Template[]) { commit({ ...state, templates: list }); },
  /** Save one split day. A rename carries past workouts along, so history and "up next" still line up. */
  saveTemplate(t: Template, oldName?: string) {
    const exists = state.templates.some((x) => x.id === t.id);
    const templates = exists ? state.templates.map((x) => (x.id === t.id ? t : x)) : [...state.templates, t];
    const workouts = oldName && oldName !== t.name ? state.workouts.map((w) => (w.template === oldName ? { ...w, template: t.name } : w)) : state.workouts;
    commit({ ...state, templates, workouts });
  },
  setGoals(goals: Goals) { commit({ ...state, goals }); },
  setProfile(profile: Profile) { commit({ ...state, profile }); },
  setScout(scout: Record<string, ScoutMemo>) { commit({ ...state, scout }); },
  setAi(patch: Partial<AiState> | ((ai: AiState) => Partial<AiState>)) { const p = typeof patch === "function" ? patch(state.ai) : patch; commit({ ...state, ai: { ...state.ai, ...p } }); },
  setSettings(patch: Partial<Settings>) { commit({ ...state, settings: { ...state.settings, ...patch } }); },
  /** Close forgotten workouts (lib/training tidyWorkouts). `force` closes any open one now. */
  tidyWorkouts(now = Date.now(), force = false) {
    const t = tidyWorkouts(state.workouts, state.entries.filter((e) => e.kind === "set").map((e) => ({ workoutId: (e as Extract<Entry, { kind: "set" }>).workoutId, at: e.at })), now, force);
    if (!t.end.length && !t.drop.length) return;
    const ends = new Map(t.end.map((x) => [x.id, x.at]));
    commit({ ...state, workouts: state.workouts.filter((w) => !t.drop.includes(w.id)).map((w) => (ends.has(w.id) ? { ...w, endedAt: ends.get(w.id)! } : w)) });
  },
  /** `exercises`: a premade day that isn't in your split (lib/programs). */
  startWorkout(template: string, at = Date.now(), exercises?: Template["exercises"], cardio?: string): Workout {
    act.tidyWorkouts(at, true);
    // The session gets its own copy of the plan, so adding or swapping an exercise today
    // never changes the saved split (and editing the split never changes a running session).
    const day = state.templates.find((t) => t.name === template);
    const plan = (exercises ?? day?.exercises ?? []).map((e) => ({ ...e }));
    const what = (exercises ? cardio : day?.cardio)?.trim();
    const w: Workout = { id: newId(), template, startedAt: at, endedAt: null, plan, ...(what ? { cardio: { what } } : {}) };
    commit({ ...state, workouts: [...state.workouts, w] });
    return w;
  },
  updateWorkout(id: string, patch: Partial<Workout>) {
    commit({ ...state, workouts: state.workouts.map((w) => (w.id === id ? { ...w, ...patch } : w)) });
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

/* ------------------------------------------------------------------ undo */

/**
 * The last thing you logged, offered back for a few seconds as "Undo" (owner: "I log something and
 * can't undo if it was an accident"). Separate from the state so undoing doesn't itself need undo.
 */
export type Undo = { ids: string[]; label: string; at: number };
let undo: Undo | null = null;
const undoListeners = new Set<() => void>();
const emitUndo = () => undoListeners.forEach((l) => l());
export const offerUndo = (ids: string[], label: string) => { undo = { ids, label, at: Date.now() }; emitUndo(); };
export const clearUndo = () => { undo = null; emitUndo(); };
export const runUndo = () => { if (!undo) return; const ids = new Set(undo.ids); commit({ ...state, entries: state.entries.filter((e) => !ids.has(e.id)) }); clearUndo(); };
export function useUndo(): Undo | null {
  return useSyncExternalStore((l) => { undoListeners.add(l); return () => { undoListeners.delete(l); }; }, () => undo, () => undo);
}

/** Log something and offer it back as an undo in one go. */
export function logWithUndo(e: NewEntry, label: string): Entry {
  const full = act.addEntry(e);
  offerUndo([full.id], label);
  return full;
}

/** For tests: reset to a known state without touching storage. */
export const __setState = (s: State) => { state = s; listeners.forEach((l) => l()); };
export const EMPTY_STATE = EMPTY;
