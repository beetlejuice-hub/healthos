import { describe, expect, it } from "vitest";
import { applyProposal, findSupp, makeProposal, type Proposal, type Setup } from "./propose";
import { runChatTool } from "./chattools";
import { DEFAULT_SETTINGS, EMPTY_AI } from "../store";
import { DEFAULT_GOALS, type Supplement } from "../types";
import { localDay } from "../time";

// PLAN 98 — owner: "understand protocols i give him, and help me set up in app". Known setups, known answers.
const NOW = new Date("2026-10-16T10:00:00").getTime();
const stack: Supplement[] = [
  { id: "mag", name: "Magnesium glycinate", dose: "200 mg", slot: "evening", at: 1290, active: true },
  { id: "d", name: "Vitamin D", dose: "2000 IU", slot: "morning", at: 480, active: true },
  { id: "c", name: "Vitamin C", dose: "500 mg", slot: "morning", at: 480, active: true, status: "low" },
  { id: "ash", name: "Ashwagandha", dose: "600 mg", slot: "evening", at: 1290, active: false, status: "stopped" },
];
const setup = (over: Partial<Setup> = {}): Setup => ({ supplements: stack, goals: DEFAULT_GOALS, settings: DEFAULT_SETTINGS, ai: { experiments: [] }, ...over });
const ok = (x: Proposal | string) => { if (typeof x === "string") throw new Error(x); return x; };
const done = <T,>(x: T | string) => { if (typeof x === "string") throw new Error(x); return x; };

describe("finding your supplement by name", () => {
  it("the same name however written, else the one it's part of; two candidates are named, none is null", () => {
    expect(findSupp(stack, "  MAGNESIUM glycinate ")).toMatchObject({ id: "mag" });
    expect(findSupp(stack, "magnesium")).toMatchObject({ id: "mag" });
    expect((findSupp(stack, "vitamin") as Supplement[]).map((s) => s.id)).toEqual(["d", "c"]);
    expect(findSupp(stack, "zinc")).toBeNull();
    // owner, 20 Oct: "vit d3" from his mom's stack is his Vitamin D, not a new one
    expect([findSupp(stack, "vit d"), findSupp(stack, "Vit. D3"), findSupp(stack, "D3")]).toMatchObject([{ id: "d" }, { id: "d" }, { id: "d" }]);
  });
});

describe("a supplement added from a protocol", () => {
  it("is worded for the card and added in its slots, in day order, active", () => {
    const p = ok(makeProposal({ change: "add_supplement", supplement: "Creatine", dose: "5 g", slots: ["evening", "morning"], why: "for strength" }, setup(), "p1"));
    expect(p.label).toBe("Add Creatine 5 g · Morning + Evening");
    const r = done(applyProposal(p, setup(), NOW, "new"));
    expect(r.supplements!.at(-1)).toEqual({ id: "new", name: "Creatine", dose: "5 g", slot: "morning", slots: ["morning", "evening"], at: 480, active: true });
    expect(r.supplements).toHaveLength(5);
  });
  it("isn't proposed when it's already there — the AI is told to change the dose or status instead", () => {
    expect(makeProposal({ change: "add_supplement", supplement: "magnesium", dose: "400 mg", slots: ["evening"], why: "" }, setup(), "p")).toMatch(/Magnesium glycinate is already in the stack.*dose or supplement_status/);
    expect(makeProposal({ change: "add_supplement", supplement: "Creatine", dose: "", slots: ["morning"], why: "" }, setup(), "p")).toMatch(/^dose:/);
    expect(makeProposal({ change: "add_supplement", supplement: "Creatine", dose: "5 g", slots: [], why: "" }, setup(), "p")).toMatch(/^slots:/);
  });
  it("tapped after you added it by hand: says so, adds nothing", () => {
    const p = ok(makeProposal({ change: "add_supplement", supplement: "Creatine", dose: "5 g", slots: ["morning"], why: "" }, setup(), "p1"));
    const later = setup({ supplements: [...stack, { id: "cr", name: "creatine monohydrate", dose: "3 g", slot: "morning", at: 480, active: true }] });
    expect(applyProposal(p, later, NOW, "new")).toBe("creatine monohydrate is already in your stack.");
  });
});

describe("a dose change", () => {
  it("shows old → new; applied, past days keep the old dose (the dose log starts with it)", () => {
    const p = ok(makeProposal({ change: "dose", supplement: "magnesium", dose: "400 mg", why: "the studied dose" }, setup(), "p2"));
    expect(p.label).toBe("Magnesium glycinate: 200 mg → 400 mg");
    const mag = done(applyProposal(p, setup(), NOW, "x")).supplements!.find((s) => s.id === "mag")!;
    expect(mag.dose).toBe("400 mg");
    expect(mag.doseLog).toEqual([{ at: 0, dose: "200 mg" }, { at: NOW, dose: "400 mg" }]);
  });
  it("the same dose, an unknown or ambiguous name: refused with the reason", () => {
    expect(makeProposal({ change: "dose", supplement: "Magnesium glycinate", dose: "200 MG", why: "" }, setup(), "p")).toBe("Magnesium glycinate is already 200 mg");
    expect(makeProposal({ change: "dose", supplement: "zinc", dose: "15 mg", why: "" }, setup(), "p")).toMatch(/zinc isn't in the stack \(it has: Magnesium glycinate, Vitamin D, Vitamin C, Ashwagandha\) — use add_supplement/);
    expect(makeProposal({ change: "dose", supplement: "vitamin", dose: "1 g", why: "" }, setup(), "p")).toBe('"vitamin" matches Vitamin D and Vitamin C — name the one you mean');
  });
  it("tapped after the supplement was deleted: says so", () => {
    const p = ok(makeProposal({ change: "dose", supplement: "magnesium", dose: "400 mg", why: "" }, setup(), "p2"));
    expect(applyProposal(p, setup({ supplements: stack.filter((s) => s.id !== "mag") }), NOW, "x")).toBe("Magnesium glycinate isn't in your stack any more.");
  });
});

describe("stop, ran out, taking again", () => {
  it("each sets what the stack editor's buttons set", () => {
    const stop = done(applyProposal(ok(makeProposal({ change: "supplement_status", supplement: "vitamin d", status: "stopped", why: "" }, setup(), "a")), setup(), NOW, "x"));
    expect(stop.supplements!.find((s) => s.id === "d")).toMatchObject({ active: false, status: "stopped" });
    const back = ok(makeProposal({ change: "supplement_status", supplement: "ashwagandha", status: "taking", why: "" }, setup(), "b"));
    expect(back.label).toBe("Ashwagandha: taking it again");
    expect(done(applyProposal(back, setup(), NOW, "x")).supplements!.find((s) => s.id === "ash")).toMatchObject({ active: true, status: undefined });
  });
  it("already so is refused — running low counts as still taking", () => {
    expect(makeProposal({ change: "supplement_status", supplement: "ashwagandha", status: "stopped", why: "" }, setup(), "p")).toBe("Ashwagandha is already stopped");
    expect(makeProposal({ change: "supplement_status", supplement: "vitamin c", status: "taking", why: "" }, setup(), "p")).toBe("Vitamin C is already being taken");
  });
});

describe("logging something taken (owner, 20 Oct: \"i took from my moms stack … it should log without offering the restock option\")", () => {
  const out = stack.map((s) => (s.id === "d" ? { ...s, active: false, status: "out" as const } : s));
  it("one you ran out of: logged at the time said, with the amount, and it stays ran out", () => {
    const p = ok(makeProposal({ change: "log_supplement", supplement: "vit d", amount: "2000 IU", time: "08:30", why: "from mom's bottle" }, setup({ supplements: out }), "p", NOW));
    expect(p.label).toBe("Log Vitamin D 2000 IU · 08:30 · you're out: this doesn't restock it");
    const r = done(applyProposal(p, setup({ supplements: out, entries: [] }), NOW, "x"));
    expect(r.supplements).toBeUndefined();
    expect(r.intake).toEqual({ op: "add", entry: { kind: "supp", at: new Date("2026-10-16T08:30:00").getTime(), suppId: "d", status: "taken", slot: "morning" } });
    expect(r.text).toBe("Logged Vitamin D 2000 IU at 08:30 — still marked as ran out.");
  });
  it("a different amount than the plan's dose is kept on the intake", () => {
    const p = ok(makeProposal({ change: "log_supplement", supplement: "magnesium", amount: "400 mg", why: "" }, setup(), "p", NOW));
    const r = done(applyProposal(p, setup({ entries: [] }), NOW, "x"));
    expect(r.intake).toMatchObject({ op: "add", entry: { suppId: "mag", amount: "400 mg", at: NOW } });
  });
  it("one that isn't yours: kept as a stopped one-off so it has a name — nothing asks for it on Today", () => {
    const p = ok(makeProposal({ change: "log_supplement", supplement: "Vitamin B complex", amount: "1 tablet", why: "" }, setup(), "p", NOW));
    expect(p.label).toBe("Log Vitamin B complex 1 tablet · 10:00 · not in your stack: logged as a one-off");
    const r = done(applyProposal(p, setup({ entries: [] }), NOW, "nb"));
    expect(r.supplements!.at(-1)).toMatchObject({ id: "nb", name: "Vitamin B complex", dose: "1 tablet", active: false, status: "stopped", slot: "morning" });
    expect(r.intake).toMatchObject({ op: "add", entry: { suppId: "nb", status: "taken", at: NOW } });
  });
  it("a \"didn't take\" for that slot becomes \"took\", like the one-tap chip", () => {
    const skipped = { id: "sk", kind: "supp" as const, at: NOW - 3600e3, suppId: "d", status: "skipped" as const, slot: "morning" as const };
    const r = done(applyProposal(ok(makeProposal({ change: "log_supplement", supplement: "vitamin d", why: "" }, setup(), "p", NOW)), setup({ entries: [skipped] }), NOW, "x"));
    expect(r.intake).toEqual({ op: "update", id: "sk", patch: { status: "taken", at: NOW } });
  });
  it("refused: later than now, a bad time, two matches", () => {
    expect(makeProposal({ change: "log_supplement", supplement: "magnesium", time: "11:30", why: "" }, setup(), "p", NOW)).toBe("11:30 is later than now (10:00) — only something already taken can be logged");
    expect(makeProposal({ change: "log_supplement", supplement: "magnesium", time: "9am", why: "" }, setup(), "p", NOW)).toMatch(/^time:/);
    expect(makeProposal({ change: "log_supplement", supplement: "vitamin", why: "" }, setup(), "p", NOW)).toBe("\"vitamin\" matches Vitamin D and Vitamin C — name the one you mean");
  });
});

describe("goals", () => {
  const burn = setup({ settings: { ...DEFAULT_SETTINGS, energy: { mode: "burn", pace: 0.5, offset: -150 } } });
  it("a calorie goal by hand while it follows your burn: the card says it stops following it; carbs move with the calories", () => {
    const p = ok(makeProposal({ change: "goals", kcal: 2300, protein: 170, why: "" }, burn, "g"));
    expect(p.label).toBe("Calorie goal 2,300 kcal (set by hand — stops following your burn) · Protein goal 160 → 170 g");
    const r = done(applyProposal(p, burn, NOW, "x"));
    expect(r.goals).toEqual({ kcal: 2300, p: 170, c: 300 - 75, f: 80 }); // −300 kcal = −75 g carbs
    expect(r.energy).toEqual({ mode: "fixed", pace: 0.5, offset: -150, moved: true }); // a pick: the move to "what you eat" won't undo it
  });
  it("a pace switches the calorie goal to follow your burn, at that pace", () => {
    const p = ok(makeProposal({ change: "goals", pace: "fast", why: "" }, setup(), "g"));
    expect(p.label).toBe("Fat-loss pace Fast, 0.65 kg a week (the calorie goal follows your burn)");
    expect(done(applyProposal(p, setup(), NOW, "x"))).toEqual({ energy: { mode: "burn", pace: 0.65, offset: 0, moved: true }, text: "Goals updated." });
  });
  it("from what you eat (PLAN 173): a goal by hand says it stops following it", () => {
    const eat = setup({ settings: { ...DEFAULT_SETTINGS, energy: { mode: "eat", pace: 0.5, offset: 0, since: "2026-10-26", moved: true } } });
    const p = ok(makeProposal({ change: "goals", kcal: 2300, why: "" }, eat, "g"));
    expect(p.label).toBe("Calorie goal 2,300 kcal (set by hand — stops following what you eat)");
    expect(done(applyProposal(p, eat, NOW, "x")).energy).toMatchObject({ mode: "fixed" });
  });
  it("out of range, both kcal and pace, nothing, or no change: refused", () => {
    expect(makeProposal({ change: "goals", kcal: 900, why: "" }, setup(), "g")).toMatch(/^kcal: a whole number, 1200–5000/);
    expect(makeProposal({ change: "goals", protein: 12.5, why: "" }, setup(), "g")).toMatch(/^protein:/);
    expect(makeProposal({ change: "goals", kcal: 2300, pace: "slow", why: "" }, setup(), "g")).toMatch(/not both/);
    expect(makeProposal({ change: "goals", why: "" }, setup(), "g")).toMatch(/give kcal, protein or pace/);
    expect(makeProposal({ change: "goals", kcal: 2600, protein: 160, why: "" }, setup(), "g")).toBe("those are already the goals");
    expect(makeProposal({ change: "goals", pace: "steady", why: "" }, burn, "g")).toBe("those are already the goals");
  });
});

describe("an experiment", () => {
  it("starts today with what to do, how long and what's measured", () => {
    const p = ok(makeProposal({ change: "experiment", experiment: "No caffeine after 14:00", how: "Last coffee by 14:00", days: 14, measure: "sleep", why: "" }, setup(), "e"));
    expect(p.label).toBe("Experiment: No caffeine after 14:00 — 14 days, measuring sleep");
    expect(done(applyProposal(p, setup(), NOW, "x1")).experiments).toEqual([{ id: "x1", name: "No caffeine after 14:00", how: "Last coffee by 14:00", days: 14, measure: "sleep", start: localDay(NOW) }]);
  });
  it("one already running by that name, too long, or a measure the app can't judge: refused", () => {
    const running = setup({ ai: { experiments: [{ id: "a", name: "no caffeine after 14:00", how: "", days: 14, measure: "sleep", start: "2026-10-10" }] } });
    expect(makeProposal({ change: "experiment", experiment: "No caffeine after 14:00", how: "x x", days: 14, measure: "sleep", why: "" }, running, "e")).toMatch(/already running/);
    expect(makeProposal({ change: "experiment", experiment: "Cold showers", how: "2 min cold", days: 90, measure: "mood", why: "" }, setup(), "e")).toMatch(/^days:/);
    expect(makeProposal({ change: "experiment", experiment: "Cold showers", how: "2 min cold", days: 14, measure: "happiness", why: "" }, setup(), "e")).toMatch(/^measure:/);
  });
});

describe("applied once", () => {
  it("a second tap changes nothing", () => {
    const p = ok(makeProposal({ change: "add_supplement", supplement: "Creatine", dose: "5 g", slots: ["morning"], why: "" }, setup(), "p1"));
    expect(applyProposal({ ...p, applied: NOW }, setup(), NOW, "x")).toBe("Already applied.");
  });
});

describe("the chat's propose tool", () => {
  const data = { state: { entries: [], workouts: [], settings: DEFAULT_SETTINGS, supplements: stack, goals: DEFAULT_GOALS, ai: EMPTY_AI }, band: null, now: NOW };
  it("returns the card and tells the AI it isn't done until the user taps Apply; changes nothing itself", () => {
    const out = runChatTool({ id: "tu_9", name: "propose", input: { change: "dose", supplement: "magnesium", dose: "400 mg", why: "the studied dose" } }, data);
    expect(out.proposal).toMatchObject({ id: "tu_9", label: "Magnesium glycinate: 200 mg → 400 mg", why: "the studied dose" });
    expect(out.text).toMatch(/Nothing changes until they tap Apply/);
    expect(stack.find((s) => s.id === "mag")!.dose).toBe("200 mg");
  });
  it("a bad one comes back as an error the AI can fix", () => {
    const out = runChatTool({ id: "tu_9", name: "propose", input: { change: "dose", supplement: "zinc", dose: "15 mg", why: "" } }, data);
    expect(out.error).toBe(true);
    expect(out.proposal).toBeUndefined();
  });
});

describe("goal cards show from → to", () => {
  it("a hand-set calorie goal shows the old one; a protein goal that stays isn't shown as a change", () => {
    expect(ok(makeProposal({ change: "goals", kcal: 2300, why: "" }, setup(), "g")).label).toBe("Calorie goal 2,600 → 2,300 kcal");
    expect(ok(makeProposal({ change: "goals", kcal: 2300, protein: 160, why: "" }, setup(), "g")).label).toBe("Calorie goal 2,600 → 2,300 kcal · Protein goal 160 g");
  });
});

// owner, 22 Oct: "can u make it able to delete entries? i asked to delete 2 entries, it found them but cant delete them"
describe("deleting an entry", () => {
  const coffee = { id: "e-cof", kind: "drink" as const, at: new Date("2026-10-15T16:30:00").getTime(), name: "Coffee", ml: 250, caffeineMg: 95, alcoholG: 0, kcal: 2 };
  const lunch = { id: "e-lun", kind: "food" as const, at: new Date("2026-10-16T09:00:00").getTime(), name: "Chicken and rice", grams: 400, macros: { kcal: 650, p: 45, c: 70, f: 18 } };
  const state = { ...setup({ entries: [coffee, lunch] }), entries: [coffee, lunch], workouts: [], foods: [] } as never;
  it("the look-ups show each entry's id — what the AI deletes by", () => {
    const day = runChatTool({ id: "t", name: "day", input: { date: "2026-10-15" } }, { state, band: null, now: NOW }).text;
    expect(day).toMatch(/16:30 drank Coffee \(95 mg caffeine\) \[id:e-cof\]/);
    const found = runChatTool({ id: "t", name: "find", input: { text: "chicken" } }, { state, band: null, now: NOW }).text;
    expect(found).toMatch(/food: Chicken and rice \(650 kcal\) \[id:e-lun\]/);
  });
  it("is a card worded with what and when, made through the chat's own tool; nothing goes before Delete", () => {
    const out = runChatTool({ id: "p", name: "propose", input: { change: "delete_entry", entry: "[id:e-cof]", why: "you said it was logged twice" } }, { state, band: null, now: NOW });
    expect(out.error).toBeFalsy();
    expect(out.proposal).toMatchObject({ change: "delete_entry", label: "Delete Coffee (95 mg caffeine) · Thu 15 Oct 16:30", entry: { id: "e-cof" } });
    expect(ok(makeProposal({ change: "delete_entry", entry: "e-lun", why: "" }, setup({ entries: [coffee, lunch] }), "p", NOW)).label).toBe("Delete Chicken and rice (650 kcal) · today 09:00");
  });
  it("an id that isn't there is sent back to the AI with how to find it", () => {
    expect(makeProposal({ change: "delete_entry", entry: "nope", why: "" }, setup({ entries: [coffee] }), "p", NOW)).toMatch(/no entry with id nope — look it up with day or find/);
  });
  it("Delete removes it; deleted already says so", () => {
    const p = ok(makeProposal({ change: "delete_entry", entry: "e-cof", why: "" }, setup({ entries: [coffee, lunch] }), "p", NOW));
    expect(done(applyProposal(p, setup({ entries: [coffee, lunch] }), NOW, "x"))).toEqual({ remove: "e-cof", text: "Deleted Coffee (95 mg caffeine)." });
    expect(applyProposal(p, setup({ entries: [lunch] }), NOW, "x")).toBe("It's already gone.");
  });
});
