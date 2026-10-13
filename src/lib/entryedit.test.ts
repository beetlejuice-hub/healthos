import { describe, expect, it } from "vitest";
import { editable, patchOf } from "./entryedit";
import type { EntryOf } from "./types";

describe("changing a logged food or drink (PLAN 71)", () => {
  it("a drink: its own kcal, macros and caffeine change; nothing else does", () => {
    const d: EntryOf<"drink"> = { id: "d", kind: "drink", at: 1, drinkId: "drink:off:1:330", name: "Protein coffee 330 ml", ml: 330, caffeineMg: 150, alcoholG: 0, kcal: 165 };
    expect(editable(d)).toEqual({ kcal: 165, p: 0, c: 0, f: 0, caf: 150 });
    expect(patchOf(d, { kcal: 170, p: 25.04, c: 9, f: 2.5, caf: 150 })).toEqual({ kcal: 170, p: 25, c: 9, f: 2.5, caffeineMg: 150 });
  });
  it("a food: its macros change, its grams and name don't", () => {
    const f: EntryOf<"food"> = { id: "f", kind: "food", at: 1, name: "Lángos", grams: 250, macros: { kcal: 700, p: 15, c: 80, f: 35 } };
    expect(editable(f)).toEqual({ kcal: 700, p: 15, c: 80, f: 35, caf: null });
    expect(patchOf(f, { kcal: 650, p: 14, c: 78, f: 30, caf: null })).toEqual({ macros: { kcal: 650, p: 14, c: 78, f: 30 } });
  });
});
