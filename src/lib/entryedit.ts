/** What a logged food or drink holds, as numbers to change, and the patch that writes them back (PLAN 71). Pure. */

import type { Entry, EntryOf } from "./types";

export type Field = "kcal" | "p" | "c" | "f" | "caf";
export const LABEL: Record<Field, string> = { kcal: "kcal", p: "Protein g", c: "Carbs g", f: "Fat g", caf: "Caffeine mg" };
export const numIn = (s: string) => { const v = Number(s.replace(",", ".")); return Number.isFinite(v) && v >= 0 ? v : null; };

/** The numbers an entry shows in the editor, and the patch that writes them back. */
export function editable(e: EntryOf<"food"> | EntryOf<"drink">): Record<Field, number | null> {
  return e.kind === "food" ? { kcal: e.macros.kcal, p: e.macros.p, c: e.macros.c, f: e.macros.f, caf: null }
    : { kcal: e.kcal, p: e.p ?? 0, c: e.c ?? 0, f: e.f ?? 0, caf: e.caffeineMg };
}
export function patchOf(e: EntryOf<"food"> | EntryOf<"drink">, v: Record<Field, number | null>): Partial<Entry> {
  const r1 = (x: number | null, d: number) => (x == null ? d : Math.round(x * 10) / 10);
  if (e.kind === "food") return { macros: { ...e.macros, kcal: r1(v.kcal, e.macros.kcal), p: r1(v.p, e.macros.p), c: r1(v.c, e.macros.c), f: r1(v.f, e.macros.f) } } as Partial<Entry>;
  return { kcal: r1(v.kcal, e.kcal), p: r1(v.p, e.p ?? 0), c: r1(v.c, e.c ?? 0), f: r1(v.f, e.f ?? 0), caffeineMg: Math.round(v.caf ?? e.caffeineMg) } as Partial<Entry>;
}
