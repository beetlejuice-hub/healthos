import { describe, expect, it } from "vitest";
import { exerciseSearch, pickFor, sameName } from "./exsearch";
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
