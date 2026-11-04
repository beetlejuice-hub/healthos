// What the reads told you, so they stop repeating it (owner, 28 Oct: "in the last liike 7 days it only recommended me to
// take in more protein w breakfast… it can repeat sometimes but not every day dude"). Planted: a protein-breakfast tip
// every day for 7 days; the 8th read brings it back as "high-protein-breakfast" with a new title — dropped; a new topic
// stays. Five days after the last one it may come back. Controls: no history drops nothing; a different protein topic
// ("protein-dinner-timing") isn't the breakfast one; two of one topic in a read keeps the first.
import { describe, expect, it } from "vitest";
import { addNever, addThreads, adviceOf, BORED, closeThreads, dropCited, dropSaid, isNever, keepCited, keepSaid, liftNever, neverList, readItems, sameTopic, saidLines, saidNever, SAID, sourceKey, threadLines, topicKey, unlinkedNote, type Said } from "./said";

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
  it("a one-word topic is only itself (owner, 31 Oct: \"the morning read has only one study/graph linked instead of the 3\")", () => {
    expect([sameTopic("sleep", "sleep-regularity"), sameTopic("deep-sleep-alcohol", "sleep"), sameTopic("protein", "protein-breakfast")]).toEqual([false, false, false]);
    expect(sameTopic("sleep", "sleep")).toBe(true);
    expect(sameTopic("other", "other")).toBe(false);
  });
});

describe("a read the day after a broad \"sleep\" item (owner, 31 Oct: one item of three)", () => {
  const said: Said[] = [{ topic: "sleep", text: "Sleep — bed by 23:00", at: NOW - DAY, from: "morning" }];
  const read = [
    { title: "Regular wake time beats long lie-ins", topic: "sleep-regularity" },
    { title: "Drinks cut your deep sleep by a third", topic: "deep-sleep-alcohol" },
    { title: "Creatine timing barely matters", topic: "creatine-timing" },
  ];
  it("all three stay — before, the two with \"sleep\" in them were dropped and one item was left", () => {
    expect(dropSaid(read, said, NOW, title).kept.map((i) => i.topic)).toEqual(["sleep-regularity", "deep-sleep-alcohol", "creatine-timing"]);
  });
  it("control: the same broad topic again is still a repeat", () => {
    expect(dropSaid([{ title: "Sleep more", topic: "sleep" }], said, NOW, title).dropped).toHaveLength(1);
  });
  it("the spare: shown in place of one said lately; not shown when all three are new; never more than 3", () => {
    const spare = { title: "Walk after lunch", topic: "walk-after-lunch" };
    expect(readItems([{ title: "Sleep more", topic: "sleep" }, ...read.slice(1), spare], said, NOW, title).map((i) => i.topic)).toEqual(["deep-sleep-alcohol", "creatine-timing", "walk-after-lunch"]);
    expect(readItems([...read, spare], said, NOW, title)).toHaveLength(3);
    expect(readItems([...read, spare], said, NOW, title).map((i) => i.topic)).not.toContain("walk-after-lunch");
  });
  // PLAN 193 (owner, 4 Nov: "tooday morning read had absolutely no study"): a study every morning
  it("no study in the three: a spare study takes the third's place; control: one already there, the spare stays out", () => {
    const three = [{ title: "Late coffee", topic: "late-coffee", type: "pattern" }, { title: "Walk after lunch", topic: "walk-after-lunch", type: "try" }, { title: "Mood and steps", topic: "mood-steps", type: "connection" }];
    const study = { title: "Creatine and sleep", topic: "creatine-sleep", type: "study" };
    expect(readItems([...three, study], [], NOW, title).map((i) => i.type)).toEqual(["pattern", "try", "study"]);
    const withOne = [three[0], { ...study, title: "Magnesium and sleep", topic: "magnesium-sleep" }, three[1]];
    expect(readItems([...withOne, study], [], NOW, title).map((i) => i.title)).toEqual(["Late coffee", "Magnesium and sleep", "Walk after lunch"]);
    // no spare study: the three as they were
    expect(readItems(three, [], NOW, title)).toEqual(three.map((x) => ({ ...x })));
  });
  it("one left out over its link is said, not lost; the study by name when none is left", () => {
    expect(unlinkedNote([{ type: "pattern" }], undefined)).toBeNull();
    expect(unlinkedNote([{ type: "pattern" }], [])).toBeNull();
    expect(unlinkedNote([{ type: "pattern" }, { type: "try" }], ["study"])).toBe("The study was left out — its link didn't open, or the page was about something else.");
    expect(unlinkedNote([{ type: "study" }], ["study"])).toBe("1 item left out — its link didn't open, or the page was about something else.");
    expect(unlinkedNote([{ type: "study" }], ["try", "fact"])).toMatch(/^2 items left out — their links didn't open/);
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
  // PLAN 194 (owner, 4 Nov: "im bored of the advice of adding skyr to my breakfast for protein, we talked ab this")
  it("said in 3 reads within 30 days it's worn out: it rests 30 days, not 5", () => {
    expect(dropSaid(items, week, NOW + 4 * DAY, title).dropped.map((i) => i.topic)).toEqual(["high-protein-breakfast"]);
    expect(dropSaid(items, week, NOW + 28 * DAY, title).dropped).toHaveLength(1);
    expect(dropSaid(items, week, NOW + 30 * DAY, title).kept).toHaveLength(3);
  });
  it("control: said in 2 reads, five days after the last one it may come back", () => {
    const twice = week.slice(-2);
    expect(dropSaid(items, twice, NOW + 3 * DAY, title).dropped).toHaveLength(1);
    expect(dropSaid(items, twice, NOW + 4 * DAY, title).kept).toHaveLength(3);
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
    expect(saidLines(week, NOW)).toEqual(['protein-breakfast — 7× since Wed 21 Oct, last Tue 27 Oct (morning): "Breakfast protein, take 7 — Add 30 g at breakfast" — worn out, resting until Thu 26 Nov']);
    expect(saidLines(week.slice(-1), NOW)).toEqual(['protein-breakfast — 1× since Tue 27 Oct, last Tue 27 Oct (morning): "Breakfast protein, take 7 — Add 30 g at breakfast" — resting until Sun 1 Nov']);
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

// PLAN 194 (owner, 4 Nov: "im bored of the advice of adding skyr to my breakfast for protein, we talked ab this"):
// never again, in any words. Planted: skyr, quark and Greek yoghurt mornings under new names; a tapped "Not again".
describe("never again", () => {
  const read = [
    { title: "Skyr bowl: 30 g before 9", topic: "skyr-bowl", tip: "Have 250 g skyr with berries" },
    { title: "A Greek yogurt start", topic: "morning-yogurt", tip: "Greek yogurt and oats by 08:30" },
    { title: "Quark pancakes for the win", topic: "pancake-swap", tip: "" },
    { title: "Casein before bed", topic: "protein-dinner-timing", tip: "Have cottage cheese at 21:00" },
    { title: "Walk after lunch", topic: "walk-after-lunch", tip: "10 minutes outside" },
  ];
  it("protein at breakfast is on the list from his words: skyr, quark, Greek yoghurt go under any name; the rest stays", () => {
    const nv = neverList(undefined, undefined);
    expect(nv.map((n) => n.topic)).toEqual(["protein-breakfast"]);
    expect(dropSaid(read, [], NOW, title, nv).kept.map((i) => i.topic)).toEqual(["protein-dinner-timing", "walk-after-lunch"]);
    expect(dropSaid([{ title: "High-protein breakfast, again", topic: "high-protein-breakfast" }], [], NOW, title, nv).kept).toEqual([]);
    // the morning read and the evening's changes alike
    expect(readItems(read, [], NOW, title, nv).map((i) => i.title)).toEqual(["Casein before bed", "Walk after lunch"]);
    expect(dropSaid([{ what: "Add skyr to breakfast", topic: "breakfast-boost" }], [], NOW, (c) => c.what, nv).kept).toEqual([]);
  });
  it("control: lifted in Settings, they can come back; nothing on the list, nothing dropped", () => {
    expect(dropSaid(read, [], NOW, title, neverList([], ["protein-breakfast"])).kept).toHaveLength(5);
    expect(dropSaid(read, [], NOW, title, []).kept).toHaveLength(5);
  });
  it("a tap on \"Not again\": that topic in other words goes; another topic doesn't; tapped again, it's lifted", () => {
    const nv = addNever([], read[4], NOW);
    expect(nv).toEqual([{ topic: "walk-after-lunch", text: "Walk after lunch — 10 minutes outside", at: NOW }]);
    expect(addNever(nv, { title: "A walk after lunch", topic: "after-lunch-walk" }, NOW)).toBe(nv);
    expect(isNever(nv, "after-lunch-walk", "")).toBe(true);
    expect(isNever(nv, "caffeine-cutoff", "Coffee before 14:00")).toBe(false);
    expect(saidNever(nv, read[4])).toBe(true);
    expect(liftNever(nv, [], "walk-after-lunch")).toEqual({ never: [], neverLifted: [] });
    expect(liftNever([], [], BORED[0].topic)).toEqual({ never: [], neverLifted: ["protein-breakfast"] });
  });
});

// PLAN 194 (owner, 4 Nov: "make sure studies are good, not the same thing"): a paper cited once isn't cited again.
describe("never the same paper", () => {
  it("one paper under its forms of address is one paper", () => {
    expect(sourceKey("https://pubmed.ncbi.nlm.nih.gov/24235903/")).toBe("pmid:24235903");
    expect(sourceKey("https://pubmed.ncbi.nlm.nih.gov/24235903/?utm_source=x")).toBe("pmid:24235903");
    expect(sourceKey("https://doi.org/10.5664/jcsm.3170")).toBe(sourceKey("https://jcsm.aasm.org/doi/10.5664/jcsm.3170"));
    expect(sourceKey("https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3805807/")).toBe("pmc3805807");
    expect(sourceKey("https://www.example.org/a/b/?x=1#y")).toBe("example.org/a/b");
  });
  it("cited before: dropped from a later read, whatever its title; a rewrite of the same read keeps its own; 180 days on it may come back", () => {
    const cited = keepCited([], [{ title: "Caffeine 6 hours before bed", url: "https://pubmed.ncbi.nlm.nih.gov/24235903/" }, undefined], NOW);
    const items = [{ title: "Coffee at 4 pm", source: { url: "https://pubmed.ncbi.nlm.nih.gov/24235903" } }, { title: "Kiwi", source: { url: "https://doi.org/10.1/kiwi" } }, { title: "No link" }];
    expect(dropCited(items, cited).map((i) => i.title)).toEqual(["Kiwi", "No link"]);
    expect(dropCited(items, cited, NOW)).toHaveLength(3);
    expect(keepCited(cited, [{ title: "again", url: "https://pubmed.ncbi.nlm.nih.gov/24235903/" }], NOW + DAY)).toHaveLength(1);
    expect(keepCited(cited, [], NOW + (SAID.citedDays + 1) * DAY)).toEqual([]);
    // control: nothing cited, nothing dropped
    expect(dropCited(items, [])).toHaveLength(3);
  });
});
