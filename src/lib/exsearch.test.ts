import { describe, expect, it } from "vitest";
import { byMuscle, equipOf, EQUIPS, exerciseSearch, pickFor, sameName } from "./exsearch";
import { MUSCLES, sameMuscle } from "./training";

const names = (q: string, mine: string[] = [], n = 8) => exerciseSearch(q, mine, n).map((f) => f.name);

describe("finding an exercise while typing (PLAN 94)", () => {
  it("the owner's words find the leg press: \"leg pushing machine\", \"leg machine\", Hungarian lábtoló", () => {
    expect(names("leg push")[0]).toBe("Leg press");
    expect(names("leg pushing machine")[0]).toBe("Leg press");
    expect(names("leg machine")).toContain("Leg press");
    expect(names("lábtoló")[0]).toBe("Leg press");
  });
  it("wrist and forearm (\"csuklya and forearm\"), accents optional", () => {
    for (const q of ["csukló", "csuklo", "wrist", "forearm", "alkar"]) expect(names(q)).toContain("Wrist curl");
    // the wrist work first, the ones that only help the forearm (hammer curls, shrugs) after
    expect(names("csukló").slice(0, 3)).toEqual(["Wrist curl", "Reverse wrist curl", "Wrist roller"]);
    expect(names("forearm", [], 20)).toEqual(expect.arrayContaining(["Wrist curl", "Reverse wrist curl", "Reverse curl", "Wrist roller", "Farmer's carry", "Dead hang"]));
  });
  it("the name itself first, then names starting with it", () => {
    expect(names("bench press")[0]).toBe("Bench press");
    expect(names("bench")[0]).toBe("Bench press");
    expect(names("Lat")[0]).toBe("Lat pulldown");
  });
  it("by equipment and muscle: \"chest machine\", \"cable\", \"gépi\"", () => {
    expect(names("chest machine")).toEqual(expect.arrayContaining(["Chest press machine", "Pec deck"]));
    expect(names("cable", [], 20)).toEqual(expect.arrayContaining(["Cable fly", "Seated cable row", "Tricep pushdown", "Face pull"]));
    expect(names("gépi")).toContain("Leg press");
  });
  it("yours (used before) come first, your own names too; nothing typed → yours", () => {
    expect(names("curl", ["Spider curl", "Bicep curl"])[0]).toBe("Spider curl");
    expect(names("", ["Squat", "Spider curl"])).toEqual(["Squat", "Spider curl"]);
    expect(names("zzz")).toEqual([]);
  });
  it("a typed name that already exists is that exercise — no second \"bench press\"", () => {
    expect(sameName("bench press")).toBe("Bench press");
    expect(sameName("  Leg Press ")).toBe("Leg press");
    expect(sameName("Pullups")).toBe("Pull-ups");
    expect(sameName("pull up")).toBe("Pull-ups");
    expect(sameName("lunge")).toBe("Lunges");
    expect(sameName("farmers carry")).toBe("Farmer's carry");
    expect(sameName("my curl", ["My curl"])).toBe("My curl");
    expect(sameName("Leg curl")).toBe("Leg curl"); // not "Seated leg curl"
    expect(sameName("Zercher squat")).toBeNull();
  });
  it("written another way, the exercise it already is comes first — never an empty list (\"pullups\", \"benchpress\")", () => {
    expect(names("pullups")[0]).toBe("Pull-ups");
    expect(names("benchpress")[0]).toBe("Bench press");
    expect(names("farmers carry")[0]).toBe("Farmer's carry");
    expect(names("spidercurls", ["Spider curl"])[0]).toBe("Spider curl");
  });
  it("Enter and the Add / Swap button take the same: the one it is, else the best match, else the new name", () => {
    expect(pickFor("leg push")).toBe("Leg press");
    expect(pickFor("pullups")).toBe("Pull-ups");
    expect(pickFor("  Zercher   squat ")).toBe("Zercher squat");
    expect(pickFor("   ")).toBe("");
  });
  it("every library exercise is found by its own name, first", () => {
    for (const n of Object.keys(MUSCLES)) expect(names(n)[0]).toBe(n);
  });
  it("a taken machine has neighbours: the leg press, the chest press, the lat pulldown", () => {
    expect(sameMuscle("Leg press", [], 20)).toEqual(expect.arrayContaining(["Hack squat", "Smith machine squat", "Pendulum squat", "Belt squat"]));
    expect(sameMuscle("Chest press machine", [], 20)).toEqual(expect.arrayContaining(["Bench press", "Pec deck", "Cable fly"]));
    expect(sameMuscle("Lat pulldown", [], 20)).toEqual(expect.arrayContaining(["Pull-ups", "Assisted pull-up machine", "Machine row"]));
  });
});

describe("browsing by muscle (#81: \"i should do shoulder and i can choose between exercises and machine or dumbbell etc\")", () => {
  it("every exercise in the library has one equipment kind, and the ones the name hides are right", () => {
    const kinds = Object.keys(MUSCLES).map((n) => [n, equipOf(n)] as const);
    expect(kinds.filter(([, e]) => !EQUIPS.includes(e))).toEqual([]);
    expect(kinds.filter(([, e]) => e === "other").map(([n]) => n).sort()).toEqual(["Ab wheel", "Kettlebell swing", "Plate pinch", "Wrist roller"]);
    expect(["Pull-ups", "Dips", "Lateral raise", "Hack squat", "Lat pulldown", "Cable fly", "Goblet squat", "Bench press", "Smith machine squat"].map(equipOf))
      .toEqual(["bodyweight", "bodyweight", "dumbbell", "machine", "machine", "cable", "dumbbell", "barbell", "machine"]);
    // "…squat" reads as a barbell squat — not these two (seen on the phone: "Bulgarian split squat · barbell")
    expect(["Squat", "Front squat", "Bulgarian split squat", "Sissy squat"].map(equipOf)).toEqual(["barbell", "barbell", "dumbbell", "bodyweight"]);
  });
  it("shoulders: every main-shoulder exercise, by kind — the machine, the cable and the dumbbell ones", () => {
    const sh = byMuscle("Shoulders");
    const of = (e: string) => sh.filter((x) => x.equip === e).map((x) => x.name);
    expect(of("machine")).toEqual(["Shoulder press machine", "Machine lateral raise", "Reverse pec deck", "Smith machine shoulder press"]);
    expect(of("cable")).toEqual(expect.arrayContaining(["Face pull", "Cable lateral raise", "Cable rear delt fly"]));
    expect(of("dumbbell")).toEqual(expect.arrayContaining(["Lateral raise", "DB shoulder press", "Arnold press", "Front raise", "Rear delt fly"]));
    expect(sh.some((x) => x.name === "Bench press")).toBe(false); // shoulders only help there
  });
  it("an exercise with two main muscles is under both; yours first, most recent first; what's planned is left out", () => {
    expect(byMuscle("Triceps").some((x) => x.name === "Dips") && byMuscle("Chest").some((x) => x.name === "Dips")).toBe(true);
    const back = byMuscle("Back", ["Seal row", "Bench press", "Lat pulldown"], ["Pull-ups"]);
    expect(back.slice(0, 2)).toEqual([{ name: "Seal row", equip: "barbell", mine: true }, { name: "Lat pulldown", equip: "machine", mine: true }]);
    expect(back.some((x) => x.name === "Pull-ups" || x.name === "Bench press")).toBe(false);
  });
  it("calves and glutes have real choice now (3–4 each before)", () => {
    expect(byMuscle("Calves").length).toBeGreaterThanOrEqual(7);
    expect(byMuscle("Glutes").length).toBeGreaterThanOrEqual(12);
  });
  it("the kinds are found by typing too: 'bodyweight back', 'gepi vall'", () => {
    expect(exerciseSearch("bodyweight back", [], 10).map((f) => f.name)).toEqual(expect.arrayContaining(["Pull-ups", "Chin-ups", "Inverted row"]));
    expect(exerciseSearch("gepi vall", [], 10).map((f) => f.name)).toEqual(expect.arrayContaining(["Shoulder press machine", "Machine lateral raise"]));
  });
});
