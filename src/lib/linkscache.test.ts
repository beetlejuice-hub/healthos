import { describe, expect, it } from "vitest";
import { linkRuns, linksFor } from "./linkscache";
import { DEFAULT_SETTINGS } from "./store";
import type { Entry } from "./types";

// Item 16 of the open list (owner, 14 Nov): the links worked out once a screen, not once a card.
describe("the links, worked out once", () => {
  const none: never[] = [], noImports = [] as Parameters<typeof linksFor>[4];
  const entries: Entry[] = [{ id: "m1", kind: "feel", at: new Date("2026-11-10T15:00:00").getTime(), mood: 6 }];
  it("the same data asked for again: the same answer, nothing run", () => {
    const before = linkRuns, a = linksFor(entries, none, DEFAULT_SETTINGS, null, noImports, "2026-11-13"), b = linksFor(entries, none, DEFAULT_SETTINGS, null, noImports, "2026-11-13");
    expect(b).toBe(a);
    expect(linkRuns - before).toBe(1);
  });
  it("new data, or a new day: worked out again", () => {
    const before = linkRuns;
    const e2 = [...entries];
    linksFor(e2, none, DEFAULT_SETTINGS, null, noImports, "2026-11-13");
    linksFor(e2, none, DEFAULT_SETTINGS, null, noImports, "2026-11-14");
    expect(linkRuns - before).toBe(2);
  });
});
