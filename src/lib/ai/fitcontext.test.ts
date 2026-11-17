import { describe, expect, it } from "vitest";
import { CONTEXT_MAX, GIVE_WAY, fitContext } from "./context";
import { CONTEXT_LIMIT } from "./limits";

// Owner, 17 Nov (a screenshot: every morning read and question "failed · context too long"). Only the journal used to give
// way; the rest outgrew the Worker's limit on its own. Now the whole fits, the least needed going first, and what's left
// out is named.
const sec = (h: string, n: number, w = 100) => [`## ${h}`, ...Array.from({ length: n }, (_, i) => `- ${h} line ${i} ${"x".repeat(w)}`)].join("\n");
const big = ["Now: Tue 17 Nov 2026, 15:36", sec("About me", 5), sec("This morning (readiness)", 6), sec("Today so far (Tue 17 Nov, up to 15:36)", 30),
  sec("Last 14 days", 60), sec("Training", 40), sec("Things I noticed about myself (my words)", 80), sec("Early patterns (could be chance)", 60),
  sec("Connecting the dots — the app's own maths over 120 days", 50), sec("My nights from the band, newest last", 120), sec("Mood journal, every check-in", 200)].join("\n");

describe("the context fits", () => {
  it("within the budget it comes back as it was", () => {
    const small = [sec("About me", 3), sec("Training", 3)].join("\n");
    expect(fitContext(small)).toBe(small);
  });
  it("too long: under the budget and the Worker's limit, the core kept, the least needed gone first, and named", () => {
    expect(big.length).toBeGreaterThan(CONTEXT_MAX * 1.4);
    const f = fitContext(big);
    expect(f.length).toBeLessThanOrEqual(CONTEXT_MAX);
    expect(f.length).toBeLessThan(CONTEXT_LIMIT);
    for (const keep of ["## About me", "## This morning", "## Today so far", "## Last 14 days", "## Training"]) expect(f).toContain(keep);
    expect(f).not.toContain("## Mood journal");
    expect(f).not.toContain("## Things I noticed");
    expect(f).toMatch(/## Left out to fit \(ask the app's tools for any of it\)\n- Mood journal, every check-in; Things I noticed about myself/);
    // only as much as needed: the dots and the nights came later in the order, and stay when there's room
    expect(f).toContain("## Connecting the dots");
  });
  it("the order: the journal before anything, the dots late", () => {
    expect(GIVE_WAY[0]).toBe("Mood journal");
    expect(GIVE_WAY.indexOf("Connecting the dots")).toBeGreaterThan(GIVE_WAY.indexOf("Early patterns"));
  });
  it("still over with nothing left to drop: the longest section loses its oldest lines, its heading kept", () => {
    const core = [sec("About me", 2), sec("Last 14 days", 800)].join("\n");
    const f = fitContext(core, 20_000);
    expect(f.length).toBeLessThanOrEqual(20_000);
    expect(f).toContain("## Last 14 days");
    expect(f).toContain("line 799"); // newest kept
    expect(f).not.toContain("Last 14 days line 0 ");
    expect(f).toContain("About me line 0 ");
  });
});
