// What the reads told you, so they stop repeating it (owner, 28 Oct: "in the last liike 7 days it only recommended me to
// take in more protein w breakfast… it can repeat sometimes but not every day dude"). Planted: a protein-breakfast tip
// every day for 7 days; the 8th read brings it back as "high-protein-breakfast" with a new title — dropped; a new topic
// stays. Five days after the last one it may come back. Controls: no history drops nothing; a different protein topic
// ("protein-dinner-timing") isn't the breakfast one; two of one topic in a read keeps the first.
import { describe, expect, it } from "vitest";
import { addThreads, adviceOf, closeThreads, dropSaid, keepSaid, sameTopic, saidLines, SAID, threadLines, topicKey, type Said } from "./said";

const DAY = 86_400_000, NOW = new Date("2026-10-28T08:00:00").getTime();
const week: Said[] = Array.from({ length: 7 }, (_, k) => ({ topic: "protein-breakfast", text: `Breakfast protein, take ${k + 1} — Add 30 g at breakfast`, at: NOW - (7 - k) * DAY, from: k % 2 ? "evening" : "morning" }));
const title = (x: { title: string }) => x.title;

describe("topics", () => {
  it("names clean up; without one, the title's words that matter", () => {
    expect(topicKey("Protein Breakfast!")).toBe("protein-breakfast");
    expect(topicKey("", "Tuna breakfast: protein that actually lands")).toBe("tuna-breakfast-protein");
    expect(topicKey(undefined, "")).toBe("other");
  });
  it("the same topic in other words, and not", () => {
    expect(sameTopic("protein-breakfast", "high-protein-breakfast")).toBe(true);
    expect(sameTopic("protein-at-breakfast", "breakfast-protein")).toBe(true);
    expect(sameTopic("protein-breakfast", "protein-dinner-timing")).toBe(false);
    expect(sameTopic("caffeine-cutoff", "walk-after-lunch")).toBe(false);
  });
});

describe("a read after a week of protein at breakfast", () => {
  const items = [
    { title: "Tuna toast: 35 g before 9", topic: "high-protein-breakfast", tip: "Eat 35 g protein by 09:00" },
    { title: "Your 3 pm dip has a suspect", topic: "afternoon-dip-lunch", tip: "Walk 10 minutes after lunch" },
    { title: "Casein before bed", topic: "protein-dinner-timing", tip: "Have quark at 21:00" },
  ];
  it("drops the breakfast one under its new name; keeps the others", () => {
    const { kept, dropped } = dropSaid(items, week, NOW, title);
    expect(dropped.map((i) => i.topic)).toEqual(["high-protein-breakfast"]);
    expect(kept.map((i) => i.topic)).toEqual(["afternoon-dip-lunch", "protein-dinner-timing"]);
  });
  it("five days after the last one, it may come back", () => {
    expect(dropSaid(items, week, NOW + 4 * DAY, title).kept).toHaveLength(3);
    expect(dropSaid(items, week, NOW + 3 * DAY, title).dropped).toHaveLength(1);
  });
  it("controls: nothing said → nothing dropped; one topic twice in a read keeps the first", () => {
    expect(dropSaid(items, [], NOW, title).dropped).toEqual([]);
    const twice = dropSaid([{ what: "Walk after lunch", topic: "walk-after-lunch" }, { what: "A 10-minute walk after lunch", topic: "after-lunch-walk" }], [], NOW, (c) => c.what);
    expect(twice.kept.map((c) => c.what)).toEqual(["Walk after lunch"]);
  });
});

describe("the log", () => {
  it("keeps each item and change of a read, 30 days at most", () => {
    const add = adviceOf({ items: [{ title: "Casein before bed", tip: "Have quark at 21:00", topic: "protein-dinner-timing" }], change: [{ what: "Coffee before 14:00", topic: "caffeine-cutoff" }] }, "evening", NOW);
    expect(add).toEqual([{ topic: "protein-dinner-timing", text: "Casein before bed — Have quark at 21:00", at: NOW, from: "evening" }, { topic: "caffeine-cutoff", text: "Coffee before 14:00", at: NOW, from: "evening" }]);
    const old: Said = { topic: "x-old", text: "old", at: NOW - (SAID.days + 1) * DAY, from: "morning" };
    expect(keepSaid([old, ...week], add, NOW).map((s) => s.topic)).not.toContain("x-old");
  });
  it("for the reads: by topic, how often, when last, resting until", () => {
    expect(saidLines(week, NOW)).toEqual(['protein-breakfast — 7× since Wed 21 Oct, last Tue 27 Oct (morning): "Breakfast protein, take 7 — Add 30 g at breakfast" — resting until Sun 1 Nov']);
  });
});

describe("to look into", () => {
  let n = 0; const id = () => `a${++n}`;
  it("adds a read's new ones (no doubles, at most 2 at a time), closes covered ones, forgets after a month", () => {
    let t = addThreads([], ["Does creatine timing change how full the muscles feel?", "Does creatine timing change how full the muscles feel?", "x"], NOW, id);
    expect(t).toEqual([{ id: "a1", text: "Does creatine timing change how full the muscles feel?", at: NOW }]);
    t = addThreads(t, ["Why is Thursday energy lowest?"], NOW + DAY, id);
    expect(threadLines(t, NOW + DAY)).toEqual(["[t:a1] Does creatine timing change how full the muscles feel? (since Wed 28 Oct)", "[t:a2] Why is Thursday energy lowest? (since Thu 29 Oct)"]);
    expect(closeThreads(t, ["[t:a1]"]).map((x) => x.id)).toEqual(["a2"]);
    expect(addThreads(t, [], NOW + 30.5 * DAY, id).map((x) => x.id)).toEqual(["a2"]);
  });
});
