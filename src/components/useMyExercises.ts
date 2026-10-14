import { useMemo } from "react";
import { useStore } from "../lib/store";

/** The exercises you've done or planned, most recent first (PLAN 94: they come first while typing one). */
export function useMyExercises(): string[] {
  const entries = useStore((s) => s.entries), templates = useStore((s) => s.templates);
  return useMemo(() => {
    const done: string[] = [];
    for (let i = entries.length - 1; i >= 0; i--) { const e = entries[i]; if (e.kind === "set" && !done.includes(e.exercise)) done.push(e.exercise); }
    return [...new Set([...done, ...templates.flatMap((t) => t.exercises.map((x) => x.name.trim()).filter(Boolean))])];
  }, [entries, templates]);
}
