// PLAN 187 phase 1 — discoveries (owner, 3 Nov: "finding new studies, random ones, random supplement studies related to
// fat loss, brain fog, trainign etc. or reddit forums that talk ab things that changed their lives, random posts, etc.
// one or 2 for each day. completely random. like it sent me the kiwi study and i am trying it rn"). Known answers: the
// pick is random across topics and kinds but the same for a read written again; recent topics are skipped; what comes
// back is kept only when whole, a forum post is an anecdote; "Try it" is a watch the app's own rules accept.
import { describe, expect, it } from "vitest";
import { checkDiscovery, discoveryLines, keepDiscovery, KINDS, pickDiscovery, TOPICS, watchInput, type KeptDiscovery } from "./discover";
import { makeProposal } from "./propose";
import { SYSTEM } from "./tasks";
import { addDays } from "../time";

const kiwi = { topic: "sleep", kind: "study", title: "Two kiwis before bed, 35 minutes more sleep", text: "In a 4-week trial, adults who ate two kiwifruit an hour before bed fell asleep 35% faster.", why: "Your sleep score dips on weeknights.", sure: "some", source: { title: "Lin 2011, Asia Pac J Clin Nutr", url: "https://pubmed.ncbi.nlm.nih.gov/21669584/" },
  try: { what: "Kiwi before bed → sleep", question: "Did you fall asleep faster?", options: ["No", "A bit", "Yes"], days: 14, cause_kind: "food", cause_name: "kiwi", feel: "energy" } };

describe("the random pick", () => {
  it("the same read on the same day picks the same; morning and evening and other days differ", () => {
    expect(pickDiscovery("2026-11-03", "morning", [])).toEqual(pickDiscovery("2026-11-03", "morning", []));
    const days = Array.from({ length: 30 }, (_, i) => addDays("2026-11-01", i));
    const both = days.filter((d) => pickDiscovery(d, "morning", []).topic.id !== pickDiscovery(d, "evening", []).topic.id).length;
    expect(both).toBeGreaterThan(20);
  });
  it("random across every topic and kind over a few months — studies most, forum posts next, older studies least", () => {
    const topics = new Map<string, number>(), kinds = new Map<string, number>();
    let recent: string[] = [];
    for (let i = 0; i < 300; i++) {
      const p = pickDiscovery(addDays("2026-01-01", i), i % 2 ? "evening" : "morning", recent as never);
      topics.set(p.topic.id, (topics.get(p.topic.id) ?? 0) + 1); kinds.set(p.kind.id, (kinds.get(p.kind.id) ?? 0) + 1);
      recent = [...recent, p.topic.id].slice(-5);
    }
    expect(topics.size).toBe(TOPICS.length);
    for (const n of topics.values()) expect(n).toBeGreaterThan(300 / TOPICS.length / 2);
    expect(kinds.size).toBe(KINDS.length);
    expect(kinds.get("study")!).toBeGreaterThan(kinds.get("forum")!);
    expect(kinds.get("forum")!).toBeGreaterThan(kinds.get("classic")!);
  });
  it("never a topic of the last five", () => {
    for (let i = 0; i < 100; i++) {
      const recent = TOPICS.slice(i % 6, (i % 6) + 5).map((t) => t.id);
      expect(recent).not.toContain(pickDiscovery(addDays("2026-02-01", i), "morning", recent).topic.id);
    }
  });
  it("the read is told the pick and what's been shown", () => {
    const kept = [{ ...kiwi, id: "a", day: "2026-11-02", slot: "evening", at: 1 }] as KeptDiscovery[];
    const lines = discoveryLines("2026-11-03", "morning", kept);
    expect(lines[0]).toMatch(/^## Today's discovery \(picked at random by the app — topic "[a-z-]+", kind "(study|forum|classic)"\)$/);
    expect(lines).toContain("- Two kiwis before bed, 35 minutes more sleep");
    for (const t of ["digest", "night"] as const) expect(SYSTEM[t]).toMatch(/DISCOVERY \(owner, 3 Nov[\s\S]*"## Today's discovery"[\s\S]*"try" only when/);
  });
});

describe("what comes back", () => {
  it("kept whole; a forum post is one person's story whatever it was called", () => {
    expect(checkDiscovery(kiwi)).toMatchObject({ topic: "sleep", kind: "study", sure: "some", try: { days: 14, options: ["No", "A bit", "Yes"] } });
    expect(checkDiscovery({ ...kiwi, kind: "forum", sure: "strong" })?.sure).toBe("anecdote");
  });
  it("controls: no link, a plain http link, a topic it wasn't asked, no words — nothing", () => {
    expect([checkDiscovery({ ...kiwi, source: { title: "x", url: "" } }), checkDiscovery({ ...kiwi, source: { title: "x", url: "http://x.org" } }), checkDiscovery({ ...kiwi, topic: "astrology" }), checkDiscovery({ ...kiwi, text: " " }), checkDiscovery(null)]).toEqual([null, null, null, null, null]);
  });
  it("a try without 2–4 answers is left off; its days held to 7–28", () => {
    expect(checkDiscovery({ ...kiwi, try: { ...kiwi.try, options: ["Yes"] } })?.try).toBeUndefined();
    expect(checkDiscovery({ ...kiwi, try: { ...kiwi.try, days: 90 } })?.try?.days).toBe(28);
  });
  it("a read written again replaces its own — not one you tried or said no to", () => {
    const d = checkDiscovery(kiwi)!, other = checkDiscovery({ ...kiwi, title: "Another" })!;
    const one = keepDiscovery([], d, "2026-11-03", "morning", 1);
    expect(keepDiscovery(one, other, "2026-11-03", "morning", 2).map((x) => x.title)).toEqual(["Another"]);
    expect(keepDiscovery([{ ...one[0], tried: 5 }], other, "2026-11-03", "morning", 2).map((x) => x.title)).toEqual(["Two kiwis before bed, 35 minutes more sleep"]);
    expect(keepDiscovery(one, null, "2026-11-03", "morning", 2)).toBe(one);
  });
});

describe("Try it", () => {
  const setup = { supplements: [], goals: { kcal: 2400, p: 160, c: 250, f: 80 }, entries: [], workouts: [], settings: {}, ai: { watches: [], experiments: [] } } as never;
  it("is a watch the app's own rules accept: the thing, its question, its study", () => {
    const p = makeProposal(watchInput(checkDiscovery(kiwi)!)!, setup, "w1", Date.UTC(2026, 10, 3, 9));
    expect(typeof p).not.toBe("string");
    expect((p as { watch: { what: string; question: string; days: number; found: { sure: string }[] } }).watch).toMatchObject({ what: "Kiwi before bed → sleep", question: "Did you fall asleep faster?", days: 14, found: [{ sure: "some" }] });
  });
  it("a feeling or a cause the watch doesn't know is left out, so it still starts", () => {
    const odd = checkDiscovery({ ...kiwi, try: { ...kiwi.try, feel: "sleep", cause_kind: "vibes" } })!;
    const w = watchInput(odd)!;
    expect(["feel" in w, "cause_kind" in w]).toEqual([false, false]);
    expect(typeof makeProposal(w, setup, "w2", Date.UTC(2026, 10, 3, 9))).not.toBe("string");
  });
});
