// PLAN 225 — pin the AI's numbers. Known answers: a number it was given passes, rounded or not; a difference of two on
// one line passes ("8 above your usual"); one it wasn't given is caught; times, dates, years, small counts and links are
// left alone; the marks split the text at exactly those numbers.
import { describe, expect, it } from "vitest";
import { numbersOf, splitPinned, unpinned } from "./pin";

const ctx = `## Last night\n- Asleep 7 h 32, deep 1 h 04, HRV 52 ms (usual 44), resting heart 51 bpm\n## Food\n- 2,447 kcal, protein 162 g\n- Weight 80.43 kg`;

describe("pinning the AI's numbers", () => {
  it("given numbers pass, as written or rounded; differences on a line pass", () => {
    expect(unpinned(["HRV was 52 ms, 8 above your usual — you slept 7 h 32 and ate about 2,400 kcal with 162 g protein; weight 80.4 kg."], [ctx])).toEqual([]);
  });
  it("a misremembered number is caught, each once as written", () => {
    expect(unpinned(["HRV was 48 ms and resting heart 51 bpm. 48 is low; protein 130 g."], [ctx])).toEqual(["48", "130"]);
  });
  it("times, dates, years, small counts, '14 Nov' and links aren't checked", () => {
    expect(numbersOf("In bed at 23:40 on 2026-11-14 (14 Nov), 3 drinks in 2025, see https://x.org/a/123456").map((n) => n.raw)).toEqual([]);
  });
  it("the look-ups' answers count as given", () => {
    expect(unpinned(["Your mood on drink days averaged 5.8"], [ctx, '{"type":"tool_result","content":"mood on 12 days with drinks: 5.83; without: 6.71"}'])).toEqual([]);
  });
  it("the marks split the text at exactly those numbers", () => {
    expect(splitPinned("HRV 48 ms, 148 steps, 48.5 kcal", ["48"])).toEqual([{ text: "HRV ", unpinned: false }, { text: "48", unpinned: true }, { text: " ms, 148 steps, 48.5 kcal", unpinned: false }]);
    expect(splitPinned("nothing", [])).toEqual([{ text: "nothing", unpinned: false }]);
  });
});
