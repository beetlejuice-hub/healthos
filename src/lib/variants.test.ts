import { describe, expect, it } from "vitest";
import { MOVEMENTS, variantsOf } from "./variants";
import { MUSCLES, mainMuscle } from "./training";
import { PROGRAMS } from "./programs";

describe("variants (owner, 20 Oct: \"incline bench press and the i can choose wheter machine, bench w barbell, bemch w dumbbell\")", () => {
  it("every variant is an exercise the catalog knows — a switch never makes a second one", () => {
    expect(MOVEMENTS.flatMap((m) => m.options.map((o) => o.name)).filter((n) => !MUSCLES[n])).toEqual([]);
  });
  it("each exercise belongs to at most one movement", () => {
    const names = MOVEMENTS.flatMap((m) => m.options.map((o) => o.name));
    expect(names.length).toBe(new Set(names).size);
  });
  it("incline press: barbell, dumbbell, machine, Smith — from any of them", () => {
    expect(variantsOf("Incline DB press")!.options.map((o) => `${o.label}: ${o.name}`)).toEqual(["Barbell: Incline bench press", "Dumbbell: Incline DB press", "Machine: Incline chest press machine", "Smith: Smith machine incline press"]);
    expect(variantsOf("Smith machine incline press")!.move).toBe("Incline press");
    expect(variantsOf("Face pull")).toBeNull();
  });
});

describe("Upper · Lower · Full (owner: \"Would a lower upper body then a full body day work better than the current 3 full body day?\")", () => {
  const ulf = PROGRAMS.find((p) => p.id === "ulf")!, ppm = PROGRAMS.find((p) => p.id === "ppm")!;
  it("three lifting days of his own exercises, and the same cardio and rest days", () => {
    expect(ulf.days.map((d) => d.name)).toEqual(["Upper", "Lower", "Full"]);
    expect(ulf.other).toEqual(ppm.other);
  });
  it("chest, back, shoulders and quads twice a week; hamstrings once — as in his Push · Pull · Mixed", () => {
    const times = (p: typeof ulf, muscle: string) => p.days.filter((d) => d.exercises.some((e) => mainMuscle(e.name) === muscle)).length;
    expect(["Chest", "Back", "Shoulders", "Quads", "Hamstrings"].map((m) => times(ulf, m))).toEqual([2, 2, 2, 2, 1]);
    expect(times(ppm, "Hamstrings")).toBe(1);
  });
});
