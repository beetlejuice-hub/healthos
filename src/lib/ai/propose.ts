/**
 * Changes the AI proposes and you apply with one tap (PLAN 98; owner: "understand protocols i give him, and help me set up
 * in app"). The chat's `propose` tool lands here: `makeProposal` checks what the AI asked for against your setup and words
 * it for the card; `applyProposal` makes the change when you tap Apply — checked again then, since a card can be tapped
 * days later (the supplement deleted, already added, the dose already changed). Nothing here changes anything by itself.
 */

import type { AiState, Experiment, State } from "../store";
import { SLOTS, SUPP_STATUS_PATCH, slotTime, suppStatus, type Goals, type Slot, type Supplement } from "../types";
import { changeDose, doseAt } from "../dose";
import { DEFAULT_ENERGY, PACES, withKcal, type Energy } from "../energy";
import { localDay } from "../time";
import { EXPERIMENT_MEASURES, PACE_NAMES, PROPOSE_CHANGES, type ProposeChange } from "./tasks";

type SetStatus = "taking" | "stopped" | "out";

export type Proposal = {
  id: string;
  change: ProposeChange;
  /** The card's line: "Add Creatine 5 g · Morning". */
  label: string;
  /** The AI's one line on why. */
  why: string;
  supp?: { id?: string; name: string; dose?: string; slots?: Slot[]; status?: SetStatus };
  goals?: { kcal?: number; p?: number; pace?: number };
  experiment?: { name: string; how: string; days: number; measure: string };
  /** When you tapped Apply, or Not now. */
  applied?: number;
  dismissed?: number;
};

export type Setup = Pick<State, "supplements" | "goals" | "settings"> & { ai: Pick<AiState, "experiments"> };
export type Applied = { supplements?: Supplement[]; goals?: Goals; energy?: Energy; experiments?: Experiment[]; text: string };

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const str = (x: unknown, max: number) => (typeof x === "string" && x.trim() && x.trim().length <= max ? x.trim() : null);
const int = (x: unknown, lo: number, hi: number) => (typeof x === "number" && Number.isInteger(x) && x >= lo && x <= hi ? x : null);
const kcalText = (n: number) => n.toLocaleString("en-GB");
const STATUS_WORDS: Record<SetStatus, string> = { taking: "taking it again", stopped: "stopped", out: "ran out" };
const ALREADY: Record<SetStatus, string> = { taking: "being taken", stopped: "stopped", out: "marked as ran out" };
/** "Running low" is still taking it. */
const isNow = (s: Supplement, status: SetStatus) => suppStatus(s) === status || (status === "taking" && suppStatus(s) === "low");
export const GOAL_RANGE = { kcal: [1200, 5000], p: [40, 350] } as const;

/** Your supplement by name: the same name however written, else the one name that contains it (or it contains). */
export function findSupp(list: Supplement[], name: string): Supplement | Supplement[] | null {
  const q = fold(name);
  if (!q) return null;
  const same = list.find((s) => fold(s.name) === q);
  if (same) return same;
  const near = list.filter((s) => { const n = fold(s.name); return n && (n.includes(q) || q.includes(n)); });
  return near.length === 1 ? near[0] : near.length ? near : null;
}

const slotWords = (slots: Slot[]) => SLOTS.filter((x) => slots.includes(x.id)).map((x) => x.name).join(" + ");

/** What the AI proposed, checked and worded — or why it can't be proposed (sent back to the AI so it can fix it). */
export function makeProposal(input: Record<string, unknown>, s: Setup, id: string): Proposal | string {
  const change = input.change as ProposeChange;
  const why = str(input.why, 200) ?? "";
  if (!PROPOSE_CHANGES.includes(change)) return `change must be one of ${PROPOSE_CHANGES.join(", ")}`;

  if (change === "add_supplement" || change === "dose" || change === "supplement_status") {
    const name = str(input.supplement, 60);
    if (!name) return "supplement: its name, up to 60 characters";
    const found = findSupp(s.supplements, name);
    if (Array.isArray(found)) return `"${name}" matches ${found.map((x) => x.name).join(" and ")} — name the one you mean`;
    if (change === "add_supplement") {
      if (found) return `${found.name} is already in the stack (${suppStatus(found)}, ${found.dose || "no dose"}) — propose dose or supplement_status instead`;
      const dose = str(input.dose, 40);
      if (!dose) return "dose: how much each time, e.g. \"5 g\", \"400 mg\", \"2 capsules\"";
      const slots = Array.isArray(input.slots) ? SLOTS.map((x) => x.id).filter((x) => (input.slots as unknown[]).includes(x)) : [];
      if (!slots.length) return "slots: when they take it — morning, midday and/or evening";
      return { id, change, why, supp: { name, dose, slots }, label: `Add ${name} ${dose} · ${slotWords(slots)}` };
    }
    if (!found) return `${name} isn't in the stack (it has: ${s.supplements.map((x) => x.name).join(", ") || "nothing"}) — use add_supplement`;
    if (change === "dose") {
      const dose = str(input.dose, 40);
      if (!dose) return "dose: the new amount each time, e.g. \"400 mg\"";
      const now = doseAt(found, Number.MAX_SAFE_INTEGER);
      if (fold(now) === fold(dose)) return `${found.name} is already ${now}`;
      return { id, change, why, supp: { id: found.id, name: found.name, dose }, label: `${found.name}: ${now || "no dose"} → ${dose}` };
    }
    const status = input.status as SetStatus;
    if (!["taking", "stopped", "out"].includes(status)) return "status: taking, stopped or out";
    if (isNow(found, status)) return `${found.name} is already ${ALREADY[status]}`;
    return { id, change, why, supp: { id: found.id, name: found.name, status }, label: `${found.name}: ${status === "taking" ? "taking it again" : status === "stopped" ? "stop it" : "mark it ran out"}` };
  }

  if (change === "goals") {
    const kcal = input.kcal == null ? undefined : int(input.kcal, ...GOAL_RANGE.kcal);
    const p = input.protein == null ? undefined : int(input.protein, ...GOAL_RANGE.p);
    const pace = input.pace == null ? undefined : PACES.find((x) => x.name.toLowerCase() === String(input.pace).toLowerCase());
    if (kcal === null) return `kcal: a whole number, ${GOAL_RANGE.kcal.join("–")}`;
    if (p === null) return `protein: grams a day, a whole number, ${GOAL_RANGE.p.join("–")}`;
    if (input.pace != null && !pace) return `pace: ${PACE_NAMES.join(", ")}`;
    if (kcal == null && p == null && !pace) return "goals: give kcal, protein or pace";
    if (kcal != null && pace) return "either kcal (set by hand) or pace (follows the burn), not both";
    const burn = s.settings.energy?.mode === "burn";
    if ((kcal == null || (kcal === s.goals.kcal && !burn)) && (p == null || p === s.goals.p) && (!pace || (burn && pace.kg === s.settings.energy?.pace))) return "those are already the goals";
    const parts = [
      kcal != null && `Calorie goal ${burn ? "" : `${kcalText(s.goals.kcal)} → `}${kcalText(kcal)} kcal${burn ? " (set by hand — stops following your burn)" : ""}`,
      pace && `Fat-loss pace ${pace.name}, ${pace.kg} kg a week${burn ? "" : " (the calorie goal follows your burn)"}`,
      p != null && `Protein goal ${p === s.goals.p ? "" : `${s.goals.p} → `}${p} g`,
    ].filter(Boolean);
    return { id, change, why, goals: { ...(kcal != null ? { kcal } : {}), ...(p != null ? { p } : {}), ...(pace ? { pace: pace.kg } : {}) }, label: parts.join(" · ") };
  }

  const name = str(input.experiment, 60), how = str(input.how, 200), days = int(input.days, 3, 60), measure = input.measure as string;
  if (!name) return "experiment: a short name, up to 60 characters";
  if (!how) return "how: what to do each day, up to 200 characters";
  if (days == null) return "days: how long, 3–60";
  if (!(EXPERIMENT_MEASURES as readonly string[]).includes(measure)) return `measure: ${EXPERIMENT_MEASURES.join(", ")}`;
  if (s.ai.experiments.some((x) => !x.ended && fold(x.name) === fold(name))) return `an experiment called ${name} is already running`;
  return { id, change, why, experiment: { name, how, days, measure }, label: `Experiment: ${name} — ${days} days, measuring ${measure}` };
}

/** Make the change now, against your setup as it is now — or say why it can't be made any more. */
export function applyProposal(p: Proposal, s: Setup, now: number, id: string): Applied | string {
  if (p.applied) return "Already applied.";
  if (p.change === "add_supplement") {
    const { name, dose = "", slots = ["morning"] } = p.supp!;
    const found = findSupp(s.supplements, name);
    if (found) return `${Array.isArray(found) ? found[0].name : found.name} is already in your stack.`;
    const add: Supplement = { id, name, dose, slot: slots[0], ...(slots.length > 1 ? { slots } : {}), at: slotTime(slots[0]), active: true };
    return { supplements: [...s.supplements, add], text: `Added ${name} — it's on Today from now.` };
  }
  if (p.change === "dose" || p.change === "supplement_status") {
    const cur = s.supplements.find((x) => x.id === p.supp!.id);
    if (!cur) return `${p.supp!.name} isn't in your stack any more.`;
    const patch = p.change === "dose" ? changeDose(cur, p.supp!.dose!, now) : isNow(cur, p.supp!.status!) ? null : SUPP_STATUS_PATCH[p.supp!.status!];
    if (!patch) return p.change === "dose" ? `${cur.name} is already ${cur.dose}.` : `${cur.name} is already ${ALREADY[p.supp!.status!]}.`;
    return { supplements: s.supplements.map((x) => (x.id === cur.id ? { ...x, ...patch } : x)), text: p.change === "dose" ? `${cur.name} is ${p.supp!.dose} from today — past days keep their dose.` : `${cur.name}: ${STATUS_WORDS[p.supp!.status!]}.` };
  }
  if (p.change === "goals") {
    const g = p.goals!, energy = s.settings.energy ?? DEFAULT_ENERGY;
    let goals = s.goals;
    if (g.kcal != null) goals = withKcal(goals, g.kcal) ?? { ...goals, kcal: g.kcal };
    if (g.p != null) goals = { ...goals, p: g.p };
    const nextEnergy = g.pace != null ? { ...energy, mode: "burn" as const, pace: g.pace } : g.kcal != null && energy.mode === "burn" ? { ...energy, mode: "fixed" as const } : undefined;
    return { ...(goals !== s.goals ? { goals } : {}), ...(nextEnergy ? { energy: nextEnergy } : {}), text: "Goals updated." };
  }
  const x = p.experiment!;
  if (s.ai.experiments.some((e) => !e.ended && fold(e.name) === fold(x.name))) return `${x.name} is already running.`;
  return { experiments: [...s.ai.experiments, { id, ...x, start: localDay(now) }], text: `${x.name} starts today — ${x.days} days.` };
}
