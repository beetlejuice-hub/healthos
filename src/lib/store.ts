/**
 * The one store. Everything the app shows is read from here; every change goes through `act`.
 *
 * **Device first.** State lives in memory, is saved to `localStorage` on every change, and is read
 * back synchronously at boot, so the app opens instantly and works offline. Sync with Supabase
 * (phone ↔ laptop) plugs in through `setRemote` and never blocks the screen.
 */

import { PROGRAMS, asSplit } from "./programs";
import { useSyncExternalStore } from "react";
import type { Saved } from "./ai/saved";
import type { Said, Thread } from "./ai/said";
import type { Watch } from "./watch";
import type { Drink, Entry, Food, Goals, Supplement, Template, Workout } from "./types";
import { DEFAULT_GOALS, slotOf, slotsOf, slotTime } from "./types";
import { tidyWorkouts } from "./training";
import type { ScoutMemo } from "./scout";
import type { Energy } from "./energy";
import type { LeadMark } from "./ai/lead";
import { DEFAULT_MODELS, MODELS_V, modelsNow, type DigestItem, type Models, type NightAnswer, type Question, type ReviewAnswer, type SupplementAnswer, type DiveAnswer, type DiveStudy } from "./ai/tasks";
import type { Due, ReviewRow } from "./review";
import type { ChartSpec } from "./ai/chattools";
import type { Proposal } from "./ai/propose";
import type { Notice } from "./inbox";
import type { Check } from "./overall";

/** Everything the in-app AI keeps for you, synced like the rest (doc "ai"). */
export type AiState = {
  /** Which model answers each tier (tasks.ts TIER); `modelsV` 2 once picks saved before the reads tier have moved. */
  models: Models; modelsV?: number;
  /** "What the AI knows about me": lines it added (you can delete any). */
  memory: { id: string; text: string; at: number }[];
  /** charts: what the AI asked to show under its reply (PLAN 67) — drawn from the app's data when shown. looked: the tools it used. */
  chat: { role: "user" | "assistant"; text: string; at: number; unprompted?: boolean; charts?: ChartSpec[]; looked?: string[]; /** Changes it proposed, applied only on your tap (PLAN 98). */ proposals?: Proposal[]; /** A news message's source (#109). */ source?: { title: string; url: string } }[];
  /** The morning read, for the day it's for. */
  digest: { day: string; /** When it was written (lib/ai/morning). */ at?: number; greeting: string; items: DigestItem[]; read?: boolean; /** When you first opened it (16 Oct: highlighted until then). */ seen?: number;
    /** The app's look-ups it was checked with (PLAN 160). */ looked?: string[] } | null;
  /** The nightly read-back of a day (optional: older synced docs don't have it). */
  night?: (NightAnswer & { day: string; at: number; /** When you first opened it — a re-read is new again. */ seen?: number; /** The app's look-ups (PLAN 160). */ looked?: string[];
    /** The day's food and drink totals it was written from (lib/ai/nightread nightStale); `redone`: rewritten on its own for that. */ tot?: { kcal: number; p: number }; redone?: number }) | null;
  /** The week and month reads (PLAN 65), newest last: what the AI wrote, and the app's numbers it was written from (for the card's table and charts). */
  reviews?: (Due & ReviewAnswer & { at: number; rows: ReviewRow[]; /** the columns: the week's days, or the month's weeks ("1–7") */ cols?: string[] })[];
  /** Titles already shown, so the morning read doesn't repeat itself. */
  shown: string[];
  /** What the reads told you, by topic, and what they mean to look into (lib/ai/said; owner, 28 Oct: "should keep a log of what it said … so it doesnt forget things it already said a million trimes"). */
  said?: Said[]; threads?: Thread[];
  /** What you asked it to look out for, from your notes, each with its evening question (lib/watch; owner, 28 Oct). */
  watches?: Watch[];
  /** The latest questions and the read that brought them — shown while that read is (PLAN 155–156); "fallback": the cheap call. */
  questions: { day: string; list: Question[]; from?: "morning" | "evening" | "fallback"; at?: number } | null;
  /** What's tracked: a tracking question's key and its latest words — re-worded every time it's asked (PLAN 156; before 21 Oct these were asked word for word every day). */
  daily: Question[];
  asked: string[];
  /** Questions you said to stop asking (their keys), and those skipped today (owner, 16 Oct: "Stop asking this is not working also i should be able to skip question"). */
  stopped?: string[];
  skipped?: { day: string; keys: string[] };
  /** Supplement look-ups, by supplement id. */
  research: Record<string, SupplementAnswer & { at: number; /** The name you typed when it was looked up. */ asked: string }>;
  /** Protocols you chose to try: the app compares before and during. */
  experiments: Experiment[];
  /** Coin-flip experiments, retired 28 Oct (owner: "remove coin flip from body lab"): kept only so old saved data loads. */
  coins?: unknown[];
  /** This week's deep dive (PLAN 160), and the topics so far (never again). `repicks`: "pick another" taps this week. */
  dive?: (DiveAnswer & { key: string; at: number; seen?: number; looked?: string[]; repicks?: number; skipped?: string[] }) | null;
  dives?: { key: string; topic: string }[];
  /** Leads the morning read has explained, and when (PLAN 176): one rests 3 weeks before it leads again. */
  leads?: LeadMark[];
  /** Read items you saved for later (PLAN 159), newest first. */
  saved?: Saved[];
  /** When you last opened the AI tab: newer unprompted messages show a dot. */
  seenAt: number;
  /** What the app wrote to you (PLAN 102), and every id it ever wrote, so none comes twice (optional: older synced docs). */
  inbox?: Notice[];
  /** The month read's overall check (PLAN 137): findings it named as noise or plain sense, and his Hide / Keep. */
  checks?: Check[];
  sent?: string[];
  /** The day the grids were last read for new findings. */
  findingsDay?: string;
  /** Background calls that failed, newest last (22 Oct: the morning read didn't come, and nothing said why) — in Settings → AI. */
  failed?: { at: number; task: string; error: string; message: string }[];
};
export type Experiment = { id: string; name: string; how: string; days: number; measure: string; start: string; ended?: string;
  /** When it ended (PLAN 160): the AI's words on the app's result, what to do next, studies it leaned on. */
  verdict?: { at: number; state: "better" | "worse" | "no-clear-change"; text: string; next: string; found: DiveStudy[]; /** You opened it from Today. */ seen?: number };
  /** An ended one's line on Today was tapped (PLAN 160). */ seen?: number };
export const EMPTY_AI: AiState = { models: DEFAULT_MODELS, modelsV: MODELS_V, memory: [], chat: [], digest: null, night: null, shown: [], questions: null, daily: [], asked: [], research: {}, experiments: [], seenAt: 0 };

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
  /** For heart-rate zones (lib/cardio maxHrOf): his age, or a max heart rate he knows — this one wins. */
  age?: number; maxHr?: number;
  /** Whose norms your fitness age is set against (lib/fitage; owner, 27 Oct: "men"). Unset: the card asks once. */
  sex?: "male" | "female";
  /** The drink the one-tap button logs. Chosen on Today; ✕ clears it. */
  usualDrink: Drink | null;
  /** Which reminders to send, once notifications are on (Settings → Notifications). */
  notify?: { checkins: boolean; supps: boolean; weigh: boolean; slump?: boolean };
  /** Two-week check-ins answered (lib/checkin): when, the rate then, and the calorie goal before/after. */
  checkins?: { at: number; lossPerWeek: number; kcalBefore: number; kcalAfter: number }[];
  /** The calorie goal set by hand, or from what you burn at a pace (lib/energy). Unset: by hand. */
  energy?: Energy;
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

export type Profile = { conditions: string[]; meds: string[]; allergies: string[]; notes: string; /** What you're working towards, in your words (PLAN 131); unset on older docs. */ aims?: string[] };
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

/** What this page last read from or wrote to its slot: a close only saves over that, never over someone else's write. */
let lastSeen: string | null = null;

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    lastSeen = raw;
    if (!raw) return EMPTY;
    const s = JSON.parse(raw) as Partial<State>;
    return { ...EMPTY, ...s, templates: upgradeStarter(s.templates ?? EMPTY.templates), supplements: normalizeStack(s.supplements ?? EMPTY.supplements), settings: { ...DEFAULT_SETTINGS, ...s.settings }, goals: { ...DEFAULT_GOALS, ...s.goals }, profile: { ...EMPTY_PROFILE, ...s.profile }, scout: s.scout ?? {}, ai: { ...EMPTY_AI, ...s.ai, models: modelsNow(s.ai?.models, s.ai?.modelsV), modelsV: MODELS_V } };
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
  saveTimer = null;
  try { const raw = JSON.stringify(state); localStorage.setItem(KEY, raw); lastSeen = raw; } catch { /* full or blocked: the in-memory copy still works */ }
}
// Saving waits 150 ms so a burst of taps writes once — but a page closing (app swiped away, reload) doesn't wait: a log
// made just before it was lost (found 13 Oct: a supplement tapped right before a reload was gone after it). Only when the
// slot still holds what this page last saw: another tab or a reset that wrote it since keeps its write.
if (typeof window !== "undefined") {
  const flush = () => {
    if (!saveTimer) return;
    clearTimeout(saveTimer); saveTimer = null;
    let cur: string | null = null; try { cur = localStorage.getItem(KEY); } catch { /* blocked */ }
    if (cur === lastSeen) save();
  };
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });
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
  /** A deleted entry back exactly as it was (the AI's delete card: "Put it back"). */
  restoreEntry(e: Entry) {
    if (state.entries.some((x) => x.id === e.id)) return;
    commit({ ...state, entries: [...state.entries, e].sort(byTime) });
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
    const ends = new Map(t.end.map((x) => [x.id, x]));
    commit({ ...state, workouts: state.workouts.filter((w) => !t.drop.includes(w.id)).map((w) => { const e = ends.get(w.id); return e ? { ...w, endedAt: e.at, ...(e.auto ? { autoEnded: true as const } : {}) } : w; }) });
  },
  /** A cardio session of its own (PLAN 130): one tap, the timer starts. Any open workout ends first. */
  startCardio(what: string, at = Date.now()): Workout {
    act.tidyWorkouts(at, true);
    const w: Workout = { id: newId(), template: "Cardio", kind: "cardio", startedAt: at, endedAt: null, cardio: { what, startedAt: at } };
    commit({ ...state, workouts: [...state.workouts, w] });
    return w;
  },
  /** Throw away a cardio session started by mistake (it has no sets; workouts sync as one doc, so it's gone everywhere). */
  discardCardio(id: string) {
    commit({ ...state, workouts: state.workouts.filter((w) => !(w.id === id && w.kind === "cardio")) });
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
