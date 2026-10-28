/**
 * Changes the AI proposes and you apply with one tap (PLAN 98; owner: "understand protocols i give him, and help me set up
 * in app"). The chat's `propose` tool lands here: `makeProposal` checks what the AI asked for against your setup and words
 * it for the card; `applyProposal` makes the change when you tap Apply — checked again then, since a card can be tapped
 * days later (the supplement deleted, already added, the dose already changed). Nothing here changes anything by itself.
 * `log_supplement` logs something taken — one you ran out of, or one that isn't yours (owner, 20 Oct: "i took from my moms
 * stack so i should be able to tell ai i took x amount of vit d3 and it should log without offering the restock option").
 * `log_food` / `log_drink` / `log_feel` / `log_weight` log what you tell the chat, and `edit_entry` fixes one logged wrong
 * (owner, 28 Oct: "give ai more tools, so it can reach and do more inside app") — still a card you Apply. `watch` looks out
 * for something you noticed (lib/watch; owner, 28 Oct: "make ai look out for these things … give me followup questions").
 */

import type { AiState, Experiment, State } from "../store";
import { SLOTS, SUPP_STATUS_PATCH, slotOf, slotTime, suppStatus, type Entry, type Goals, type Slot, type Supplement } from "../types";
import { changeDose, doseAt } from "../dose";
import { DEFAULT_ENERGY, PACES, withKcal, type Energy } from "../energy";
import { addDays, atMinute, clock, dayLabel, localDay, minuteOfDay } from "../time";
import { logIntake, type Intake } from "../supplog";
import { resolve } from "../stackcheck/check";
import { EXPERIMENT_MEASURES, PACE_NAMES, PROPOSE_CHANGES, SURE, type ProposeChange } from "./tasks";
import { WATCH, watchLive, type Watch, type WatchFind } from "../watch";

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
  /** watch: what to look out for, its evening question, and what's out there. */
  watch?: Omit<Watch, "id" | "at" | "start">;
  /** log_supplement: when it was taken, and how much when they said. */
  log?: { at: number; amount?: string };
  /** delete_entry: the entry, kept on the card so "Put it back" can restore it. */
  entry?: Entry;
  /** log_food / log_drink / log_feel / log_weight: the entry to add. */
  add?: NewEntry;
  /** edit_entry: what changes, and the entry as it was, so "Put it back" can restore it. */
  edit?: { patch: Partial<Entry>; before: Entry };
  /** When "Put it back" restored a deleted entry. */
  restored?: number;
  /** When you tapped Apply, or Not now. */
  applied?: number;
  dismissed?: number;
};

export type Setup = Pick<State, "supplements" | "goals" | "settings"> & { ai: Pick<AiState, "experiments" | "watches">; entries?: Entry[] };
type Kinds = Entry extends infer E ? (E extends { kind: "food" | "drink" | "feel" | "weight" } ? E : never) : never;
export type NewEntry = Kinds extends infer E ? (E extends Entry ? Omit<E, "id"> : never) : never;
export type Applied = { supplements?: Supplement[]; goals?: Goals; energy?: Energy; experiments?: Experiment[]; watches?: Watch[]; intake?: Intake; /** delete_entry: the entry to delete. */ remove?: string; /** log_*: the entry to add. */ add?: NewEntry; /** edit_entry */ patch?: { id: string; patch: Partial<Entry> }; text: string };

/** An entry in a few words, for a delete card: "Coffee (95 mg caffeine)", "check-in: mood 6", "weigh-in 82.4 kg". */
export function entryWords(e: Entry, supplements: Supplement[]): string {
  switch (e.kind) {
    case "food": return `${e.name} (${Math.round(e.macros.kcal)} kcal)`;
    case "drink": return `${e.name}${e.caffeineMg ? ` (${e.caffeineMg} mg caffeine)` : e.alcoholG ? ` (${e.alcoholG} g alcohol)` : ""}`;
    case "supp": return `${supplements.find((s) => s.id === e.suppId)?.name ?? "a supplement"} ${e.status === "skipped" ? "skipped" : "taken"}`;
    case "feel": return `check-in${(["mood", "energy", "focus", "stress"] as const).filter((k) => e[k] != null).map((k) => ` ${k} ${e[k]}`).slice(0, 2).join(",")}`;
    case "weight": return `weigh-in ${e.kg} kg`;
    case "sleep": return e.rating != null ? `sleep rating ${e.rating}/10` : "a note about last night";
    case "notice": return `note "${e.text.slice(0, 40)}${e.text.length > 40 ? "…" : ""}"`;
    case "answer": return `answer "${e.answer.slice(0, 40)}"`;
    default: return e.kind;
  }
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\bvit\b\.?/g, "vitamin").replace(/\s+/g, " ").trim();
const str = (x: unknown, max: number) => (typeof x === "string" && x.trim() && x.trim().length <= max ? x.trim() : null);
const int = (x: unknown, lo: number, hi: number) => (typeof x === "number" && Number.isInteger(x) && x >= lo && x <= hi ? x : null);
const kcalText = (n: number) => n.toLocaleString("en-GB");
const STATUS_WORDS: Record<SetStatus, string> = { taking: "taking it again", stopped: "stopped", out: "ran out" };
const ALREADY: Record<SetStatus, string> = { taking: "being taken", stopped: "stopped", out: "marked as ran out" };
/** "Running low" is still taking it. */
const isNow = (s: Supplement, status: SetStatus) => suppStatus(s) === status || (status === "taking" && suppStatus(s) === "low");
export const GOAL_RANGE = { kcal: [1200, 5000], p: [40, 350] } as const;

/**
 * Your supplement by name: the same name however written ("vit d" is "vitamin d"), else the one name that contains it (or
 * it contains), else the one that's the same thing to the stack check ("D3" is your "Vitamin D", "fekete kömény" your
 * "Black cumin seed oil") — so logging "vit d3" doesn't make a second Vitamin D.
 */
export function findSupp(list: Supplement[], name: string): Supplement | Supplement[] | null {
  const q = fold(name);
  if (!q) return null;
  const same = list.find((s) => fold(s.name) === q);
  if (same) return same;
  const near = list.filter((s) => { const n = fold(s.name); return n && (n.includes(q) || q.includes(n)); });
  if (near.length) return near.length === 1 ? near[0] : near;
  const kind = resolve(name), alike = kind ? list.filter((s) => resolve(s.name)?.key === kind.key) : [];
  return alike.length === 1 ? alike[0] : alike.length ? alike : null;
}

/** `time` "HH:MM" and `day` today / yesterday → a moment; now when neither is given; never later than now. */
function whenOf(input: Record<string, unknown>, now: number): number | string {
  const day = input.day == null || input.day === "today" ? localDay(now) : input.day === "yesterday" ? addDays(localDay(now), -1) : null;
  if (!day) return "day: today or yesterday";
  if (input.time == null) return day === localDay(now) ? now : "time: \"HH:MM\" — when yesterday";
  const m = typeof input.time === "string" ? input.time.match(/^(\d{1,2}):(\d{2})$/) : null;
  if (!m || +m[1] > 23 || +m[2] > 59) return "time: \"HH:MM\"";
  const at = atMinute(day, +m[1] * 60 + +m[2]);
  return at > now ? `${input.time} is later than now (${clock(now)}) — only what already happened can be logged` : at;
}

/** One thing found about a watch: a line, how sure, and its link — a study (strong / some) without a real link isn't kept. */
function findOf(x: unknown): WatchFind | null {
  const f = x as { text?: unknown; sure?: unknown; title?: unknown; url?: unknown } | null;
  const text = str(f?.text, 220), sure = f?.sure as WatchFind["sure"], url = typeof f?.url === "string" && /^https:\/\//.test(f.url) ? f.url : null;
  if (!text || !(SURE as readonly string[]).includes(sure) || sure === "yours") return null;
  if ((sure === "strong" || sure === "some") && !url) return null;
  return { text, sure, ...(url ? { source: { title: str(f?.title, 120) ?? "Source", url } } : {}) };
}

const slotWords = (slots: Slot[]) => SLOTS.filter((x) => slots.includes(x.id)).map((x) => x.name).join(" + ");

/** What the AI proposed, checked and worded — or why it can't be proposed (sent back to the AI so it can fix it). */
export function makeProposal(input: Record<string, unknown>, s: Setup, id: string, now = Date.now()): Proposal | string {
  const change = input.change as ProposeChange;
  const why = str(input.why, 200) ?? "";
  if (!PROPOSE_CHANGES.includes(change)) return `change must be one of ${PROPOSE_CHANGES.join(", ")}`;

  if (change === "log_supplement") {
    const name = str(input.supplement, 60);
    if (!name) return "supplement: its name, up to 60 characters";
    const found = findSupp(s.supplements, name);
    if (Array.isArray(found)) return `"${name}" matches ${found.map((x) => x.name).join(" and ")} — name the one you mean`;
    const amount = input.amount == null ? undefined : str(input.amount, 40);
    if (amount === null) return "amount: what they took, e.g. \"2000 IU\", \"1 capsule\" — or leave it out for the usual dose";
    let at = now;
    if (input.time != null) {
      const m = typeof input.time === "string" ? input.time.match(/^(\d{1,2}):(\d{2})$/) : null;
      if (!m || +m[1] > 23 || +m[2] > 59) return "time: \"HH:MM\" today, or leave it out for now";
      at = atMinute(localDay(now), +m[1] * 60 + +m[2]);
      if (at > now) return `${input.time} is later than now (${clock(now)}) — only something already taken can be logged`;
    }
    const st = found ? suppStatus(found) : null;
    const note = !found ? " · not in your stack: logged as a one-off" : st === "out" ? " · you're out: this doesn't restock it" : st === "stopped" ? " · stays stopped" : "";
    return { id, change, why, supp: { ...(found ? { id: found.id } : {}), name: found?.name ?? name }, log: { at, ...(amount ? { amount } : {}) }, label: `Log ${found?.name ?? name}${amount ? ` ${amount}` : ""} · ${clock(at)}${note}` };
  }

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

  // owner, 22 Oct: "i asked to delete 2 entries, it found them but cant delete them" — by the [id:…] the look-ups show
  if (change === "delete_entry") {
    const ref = typeof input.entry === "string" ? input.entry.trim().replace(/^\[?id:/, "").replace(/\]$/, "") : "";
    const e = (s.entries ?? []).find((x) => x.id === ref);
    if (!e) return ref ? `no entry with id ${ref} — look it up with day or find and use the [id:…] shown after it` : "entry: the [id:…] the day or find look-up shows after it";
    return { id, change, why, entry: e, label: `Delete ${entryWords(e, s.supplements)} · ${localDay(e.at) === localDay(now) ? "today" : dayLabel(e.at)} ${clock(e.at)}` };
  }

  if (change === "log_food" || change === "log_drink" || change === "log_feel" || change === "log_weight") {
    const at = whenOf(input, now);
    if (typeof at === "string") return at;
    const when = `${localDay(at) === localDay(now) ? "" : "yesterday "}${clock(at)}`;
    if (change === "log_food") {
      const name = str(input.name, 80), grams = int(input.grams, 1, 3000), kcal = int(input.kcal, 0, 5000);
      const [p, c, f] = [input.protein, input.carbs, input.fat].map((x) => (x == null ? 0 : int(x, 0, 500)));
      if (!name) return "name: what they ate, up to 80 characters";
      if (grams == null) return "grams: how much, 1–3000 (your best estimate)";
      if (kcal == null) return "kcal: for that amount, 0–5000";
      if (p == null || c == null || f == null) return "protein, carbs, fat: grams for that amount, 0–500 each";
      return { id, change, why, add: { kind: "food", at, name, grams, macros: { kcal, p, c, f } }, label: `Log ${name} ${grams} g · ${kcalText(kcal)} kcal, ${p} g protein · ${when}` };
    }
    if (change === "log_drink") {
      const name = str(input.name, 80), ml = int(input.ml, 1, 3000), kcal = input.kcal == null ? 0 : int(input.kcal, 0, 2000);
      const caf = input.caffeine_mg == null ? 0 : int(input.caffeine_mg, 0, 1000);
      const alc = input.alcohol_g == null ? 0 : typeof input.alcohol_g === "number" && input.alcohol_g >= 0 && input.alcohol_g <= 200 ? Math.round(input.alcohol_g * 10) / 10 : null;
      if (!name) return "name: what they drank, up to 80 characters";
      if (ml == null) return "ml: how much, 1–3000";
      if (kcal == null || caf == null || alc == null) return "kcal 0–2000, caffeine_mg 0–1000, alcohol_g 0–200 (leave out what's none)";
      const what = [caf ? `${caf} mg caffeine` : "", alc ? `${alc} g alcohol` : "", kcal ? `${kcal} kcal` : ""].filter(Boolean).join(", ");
      return { id, change, why, add: { kind: "drink", at, name, ml, caffeineMg: caf, alcoholG: alc, kcal }, label: `Log ${name} ${ml} ml${what ? ` · ${what}` : ""} · ${when}` };
    }
    if (change === "log_feel") {
      const vals: Partial<Record<"mood" | "energy" | "focus" | "stress", number>> = {};
      for (const k of ["mood", "energy", "focus", "stress"] as const) {
        if (input[k] == null) continue;
        const v = int(input[k], 1, 10);
        if (v == null) return `${k}: 1–10`;
        vals[k] = v;
      }
      const note = input.note == null ? undefined : str(input.note, 300);
      if (note === null) return "note: up to 300 characters";
      if (!Object.keys(vals).length) return "log_feel: give at least one of mood, energy, focus, stress (1–10)";
      return { id, change, why, add: { kind: "feel", at, ...vals, ...(note ? { note } : {}) }, label: `Log a check-in: ${Object.entries(vals).map(([k, v]) => `${k} ${v}`).join(", ")}${note ? ` · "${note.slice(0, 40)}"` : ""} · ${when}` };
    }
    const kg = typeof input.kg === "number" && input.kg >= 30 && input.kg <= 300 ? Math.round(input.kg * 100) / 100 : null;
    if (kg == null) return "kg: 30–300";
    return { id, change, why, add: { kind: "weight", at, kg }, label: `Log weigh-in ${kg} kg · ${when}` };
  }

  if (change === "edit_entry") {
    const ref = typeof input.entry === "string" ? input.entry.trim().replace(/^\[?id:/, "").replace(/\]$/, "") : "";
    const e = (s.entries ?? []).find((x) => x.id === ref);
    if (!e) return ref ? `no entry with id ${ref} — look it up with day or find and use the [id:…] shown after it` : "entry: the [id:…] the day or find look-up shows after it";
    const patch: Record<string, unknown> = {}, said: string[] = [];
    if (input.time != null) {
      const m = typeof input.time === "string" ? input.time.match(/^(\d{1,2}):(\d{2})$/) : null;
      if (!m || +m[1] > 23 || +m[2] > 59) return "time: \"HH:MM\", on the same day as the entry";
      const at = atMinute(localDay(e.at), +m[1] * 60 + +m[2]);
      if (at > now) return `${input.time} that day is later than now`;
      if (at !== e.at) { patch.at = at; said.push(`${clock(e.at)} → ${clock(at)}`); }
    }
    if (input.name != null) {
      const name = str(input.name, 80);
      if (!name || !("name" in e)) return "name: only a food or drink has one, up to 80 characters";
      if (name !== e.name) { patch.name = name; said.push(`“${name}”`); }
    }
    if (input.grams != null) {
      const g = int(input.grams, 1, 3000);
      if (e.kind !== "food" || g == null) return "grams: only for a food, 1–3000";
      const k = g / (e.grams || g), r = (n: number) => Math.round(n * k);
      if (g !== e.grams) { patch.grams = g; patch.macros = { kcal: r(e.macros.kcal), p: r(e.macros.p), c: r(e.macros.c), f: r(e.macros.f) }; said.push(`${e.grams} → ${g} g (${kcalText(Math.round(e.macros.kcal))} → ${kcalText(r(e.macros.kcal))} kcal)`); }
    }
    if (input.ml != null) {
      const ml = int(input.ml, 1, 3000);
      if (e.kind !== "drink" || ml == null) return "ml: only for a drink, 1–3000";
      const k = ml / (e.ml || ml);
      if (ml !== e.ml) { Object.assign(patch, { ml, caffeineMg: Math.round(e.caffeineMg * k), alcoholG: Math.round(e.alcoholG * k * 10) / 10, kcal: Math.round(e.kcal * k) }); said.push(`${e.ml} → ${ml} ml`); }
    }
    if (!said.length) return "nothing to change: give time, name, grams (a food) or ml (a drink) that differ from what's logged";
    return { id, change, why, edit: { patch: patch as Partial<Entry>, before: e }, label: `Change ${entryWords(e, s.supplements)}: ${said.join(", ")}` };
  }

  if (change === "watch") {
    const what = str(input.what, 60), note = str(input.note, 400), question = str(input.question, 120);
    const options = Array.isArray(input.options) ? input.options.map((o) => str(o, 30)).filter((o): o is string => !!o) : [];
    const days = input.days == null ? WATCH.days : int(input.days, WATCH.minDays, WATCH.maxDays);
    if (!what) return "what: the watch in a few words, like 'Creatine → fuller muscles' (up to 60 characters)";
    if (!note) return "note: what they said, in their words";
    if (!question) return "question: one short evening question about the effect, answered with a tap (up to 120 characters)";
    if (options.length < WATCH.options[0] || options.length > WATCH.options[1] || new Set(options.map(fold)).size !== options.length) return "options: 2–4 different short answers, low to high ('Not really', 'A bit', 'Very')";
    if (days == null) return `days: ${WATCH.minDays}–${WATCH.maxDays}`;
    const live = (s.ai.watches ?? []).filter((w) => watchLive(w, now));
    if (live.some((w) => fold(w.what) === fold(what))) return `already watching ${what}`;
    if (live.length >= WATCH.max) return `already watching ${WATCH.max} things — they can stop one in the AI tab first`;
    const found = (Array.isArray(input.found) ? input.found : []).map(findOf).filter((f): f is WatchFind => !!f).slice(0, 3);
    return { id, change, why, watch: { what, note, question, options, days, found }, label: `Watch: ${what} — ask “${question}” each evening for ${days} days` };
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
    const burn = s.settings.energy?.mode === "burn", auto = burn || s.settings.energy?.mode === "eat";
    if ((kcal == null || (kcal === s.goals.kcal && !auto)) && (p == null || p === s.goals.p) && (!pace || (burn && pace.kg === s.settings.energy?.pace))) return "those are already the goals";
    const parts = [
      kcal != null && `Calorie goal ${auto ? "" : `${kcalText(s.goals.kcal)} → `}${kcalText(kcal)} kcal${auto ? ` (set by hand — stops following ${burn ? "your burn" : "what you eat"})` : ""}`,
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
  if (p.change === "log_supplement") {
    const { at, amount } = p.log!;
    const near = p.supp!.id ? s.supplements.find((x) => x.id === p.supp!.id) : findSupp(s.supplements, p.supp!.name);
    const cur = Array.isArray(near) ? undefined : near ?? undefined;
    // Not yours: kept as a stopped one, so the intake has a name and a history — and nothing asks for it on Today.
    const one: Supplement | undefined = cur ? undefined : { id, name: p.supp!.name, dose: amount ?? "", slot: slotOf(minuteOfDay(at)), at: slotTime(slotOf(minuteOfDay(at))), ...SUPP_STATUS_PATCH.stopped };
    const sup = cur ?? one!;
    const r = logIntake(sup, s.entries ?? [], at), extra = amount && amount !== doseAt(sup, at) ? { amount } : {};
    const intake: Intake = r.op === "add" ? { op: "add", entry: { ...r.entry, ...extra } } : { op: "update", id: r.id, patch: { ...r.patch, ...extra } };
    return { ...(one ? { supplements: [...s.supplements, one] } : {}), intake, text: `Logged ${sup.name}${amount ? ` ${amount}` : ""} at ${clock(at)}${cur && suppStatus(cur) === "out" ? " — still marked as ran out" : ""}.` };
  }
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
  if (p.add) {
    const a = p.add;
    return { add: a, text: `Logged ${a.kind === "food" || a.kind === "drink" ? a.name : a.kind === "weight" ? `${a.kg} kg` : "the check-in"} at ${clock(a.at)}.` };
  }
  if (p.change === "edit_entry") {
    const e = (s.entries ?? []).find((x) => x.id === p.edit!.before.id);
    if (!e) return "That entry is gone.";
    return { patch: { id: e.id, patch: p.edit!.patch }, text: `Changed ${entryWords(e, s.supplements)}.` };
  }
  if (p.change === "goals") {
    const g = p.goals!, energy = s.settings.energy ?? DEFAULT_ENERGY;
    let goals = s.goals;
    if (g.kcal != null) goals = withKcal(goals, g.kcal) ?? { ...goals, kcal: g.kcal };
    if (g.p != null) goals = { ...goals, p: g.p };
    const nextEnergy = g.pace != null ? { ...energy, mode: "burn" as const, pace: g.pace, moved: true } : g.kcal != null && energy.mode !== "fixed" ? { ...energy, mode: "fixed" as const, moved: true } : undefined;
    return { ...(goals !== s.goals ? { goals } : {}), ...(nextEnergy ? { energy: nextEnergy } : {}), text: "Goals updated." };
  }
  if (p.change === "delete_entry") {
    const e = (s.entries ?? []).find((x) => x.id === p.entry!.id);
    return e ? { remove: e.id, text: `Deleted ${entryWords(e, s.supplements)}.` } : "It's already gone.";
  }
  if (p.change === "watch") {
    const w = p.watch!;
    if ((s.ai.watches ?? []).some((x) => watchLive(x, now) && fold(x.what) === fold(w.what))) return `Already watching ${w.what}.`;
    return { watches: [...(s.ai.watches ?? []), { id, at: now, start: localDay(now), ...w }], text: `Watching ${w.what} — ${new Date(now).getHours() >= WATCH.from ? "its first question is in For you on Today now" : `its first question comes at ${WATCH.from}:00`}.` };
  }
  const x = p.experiment!;
  if (s.ai.experiments.some((e) => !e.ended && fold(e.name) === fold(x.name))) return `${x.name} is already running.`;
  return { experiments: [...s.ai.experiments, { id, ...x, start: localDay(now) }], text: `${x.name} starts today — ${x.days} days.` };
}
