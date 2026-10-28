// Your own tips (owner, 28 Oct: "music helps me focus, exercise clears my head … whenever my focus is low it should
// recommend to put on my focus music"). Known answers for the ways he writes it; controls that aren't tips (the other
// way round, a bad effect, too long to be a thing); when a check-in is low it suggests his tip for that feeling, and only then.
import { describe, expect, it } from "vitest";
import { readTips, tipAsk, tipEntry, tipKey, tipLines, tipsFrom, TIPS } from "./tips";
import type { Entry } from "./types";

const H = 3_600_000, NOW = new Date("2026-10-28T14:00:00").getTime();
let n = 0;
const note = (text: string, at = NOW - 48 * H): Entry => ({ id: `n${n++}`, kind: "notice", at, text });
const feel = (x: { focus?: number; energy?: number; mood?: number; stress?: number }, at = NOW - 0.5 * H): Entry => ({ id: `f${n++}`, kind: "feel", at, ...x });
const pick = (t: string) => readTips(t).map((x) => `${x.what}→${x.for}${x.off ? " (off)" : ""}`);

describe("reading a tip from what you type", () => {
  it("his own words: music helps me focus, exercise clears my head — two tips from one note", () => {
    expect(pick("music helps me focus, exercise clears my head")).toEqual(["music→focus", "exercise→focus"]);
  });
  it("other ways of saying it, each to its feeling", () => {
    expect(pick("Listening to music really helps me concentrate")).toEqual(["Listening to music→focus"]);
    expect(pick("I focus better with music on")).toEqual(["music→focus"]);
    expect(pick("a walk outside calms me down")).toEqual(["a walk outside→stress"]);
    expect(pick("cold showers give me energy")).toEqual(["cold showers→energy"]);
    expect(pick("I think sunlight lifts my mood")).toEqual(["sunlight→mood"]);
    expect(pick("breathing exercises help with stress")).toEqual(["breathing exercises→stress"]);
    expect(pick("Noticed: green tea is good for focus.")).toEqual(["green tea→focus"]);
  });
  it("controls: not tips — a bad effect, a plain note, an 'it', a whole sentence", () => {
    expect(pick("coffee makes me anxious")).toEqual([]); // stress words only count the calming way
    expect(pick("went downstairs to do something, forgot why")).toEqual([]);
    expect(pick("it helps me focus")).toEqual([]);
    expect(pick("when I finally got home after the long meeting with the whole team it helps me relax")).toEqual([]);
  });
  it("said the other way is marked off: doesn't help, makes me lose focus", () => {
    expect(pick("music doesn't help me focus anymore")).toEqual(["music→focus (off)"]);
    expect(pick("my phone makes me lose focus")).toEqual(["my phone→focus (off)"]);
  });
});

describe("your tips, over all your notes", () => {
  it("the latest saying wins; said the other way later, it's dropped; one thing, one key", () => {
    const es = [note("music helps me focus", NOW - 72 * H), note("exercise clears my head", NOW - 60 * H), note("music doesn't help me focus anymore", NOW - 24 * H)];
    expect(tipsFrom(es).map((t) => t.what)).toEqual(["exercise"]);
    expect(tipKey("My focus music")).toBe("tip:focus-music");
    expect(tipKey("Music")).toBe(tipKey("music"));
  });
});

describe("suggested when that feeling is low", () => {
  const tips = [note("music helps me focus, exercise clears my head", NOW - 72 * H), note("a walk calms me down", NOW - 50 * H)];
  it("focus 3 half an hour ago: his focus tips, latest said first; nothing about stress", () => {
    const a = tipAsk([...tips, feel({ focus: 3, mood: 6, stress: 4 })], NOW)!;
    expect(a.for).toBe("focus"); expect(a.value).toBe(3);
    expect(a.tips.map((t) => t.what)).toEqual(["music", "exercise"]);
  });
  it("control: focus 6 — nothing; focus 3 four hours ago — nothing; no tip for a low feeling — nothing", () => {
    expect(tipAsk([...tips, feel({ focus: 6 })], NOW)).toBeNull();
    expect(tipAsk([...tips, feel({ focus: 3 }, NOW - 4 * H)], NOW)).toBeNull();
    expect(tipAsk([...tips, feel({ energy: 2, focus: 7 })], NOW)).toBeNull(); // no energy tip
    expect(tipAsk([feel({ focus: 2 })], NOW)).toBeNull(); // no tips at all
  });
  it(`the edges: focus ${TIPS.low} is low, 5 isn't; stress ${TIPS.stress} is, 6 isn't`, () => {
    expect(tipAsk([...tips, feel({ focus: TIPS.low })], NOW)?.for).toBe("focus");
    expect(tipAsk([...tips, feel({ focus: TIPS.low + 1 })], NOW)).toBeNull();
    expect(tipAsk([...tips, feel({ stress: TIPS.stress })], NOW)?.for).toBe("stress");
    expect(tipAsk([...tips, feel({ stress: TIPS.stress - 1 })], NOW)).toBeNull();
  });
  it("two low: the lower one past its line (focus 4 vs stress 9 → stress)", () => {
    expect(tipAsk([...tips, feel({ focus: 4, stress: 9 })], NOW)!.for).toBe("stress");
  });
  it("only the last check-in counts: low then fine → nothing", () => {
    expect(tipAsk([...tips, feel({ focus: 2 }, NOW - 2 * H), feel({ focus: 7 }, NOW - 0.2 * H)], NOW)).toBeNull();
  });
  it("'Doing it' is kept as an answer and the ask goes; the next low check-in asks again; the AI's line counts it", () => {
    const f1 = feel({ focus: 3 }, NOW - 2 * H), a = tipAsk([...tips, f1], NOW - 1.9 * H)!;
    const did: Entry = { id: "a1", ...tipEntry(a, a.tips[0], NOW - 1.8 * H) };
    expect(did).toMatchObject({ kind: "answer", key: "tip:music", question: 'Focus 3 — your tip: "music helps me focus"', answer: "doing it" });
    expect(tipAsk([...tips, f1, did], NOW - 1.7 * H)).toBeNull();
    expect(tipAsk([...tips, f1, did, feel({ focus: 2 }, NOW - 0.1 * H)], NOW)!.for).toBe("focus");
    expect(tipLines([...tips, did])).toEqual(['focus: "music helps me focus" — did it 1 time when suggested', 'focus: "exercise clears my head"', 'stress: "a walk calms me down"']);
  });
});
