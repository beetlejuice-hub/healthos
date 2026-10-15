/**
 * The one thing that stood out about a night's evening (owner, 15 Oct: "at sleep, it should subtly show the thing that
 * happened that night. like if i slept w gf, if i was drunk, if i was scrolling too much before bed, if worked out late, if
 * too much cafffeine, if went to bed too late, etc - the most significant thing"). Pure.
 *
 * Each thing logged or measured that evening gets a weight from how much it tends to matter for sleep and how much of it
 * there was — drinks most (each lowers HRV and raises heart rate asleep, the strongest one-night effect wrist bands
 * show), then caffeine still in you at bed, a late night, training close to bed, a stressed evening, the phone, a late
 * meal, your own tags, a nap. The night's own numbers then tip it: a thing gains when what it usually moves was off that
 * night (drinks and HRV, caffeine and falling asleep), and that number is said beside it — "and", never "because".
 */

import { clockH, usual, type Evening, type Night } from "./sleep";
import type { PartId, SleepScore } from "./sleepscore";
import { nightLabel } from "./lastnight";
import { addDays } from "./time";

export type Standout = { id: string; label: string; weight: number; also: string | null };

const hm = (min: number) => (min < 60 ? `${Math.round(min)} min` : `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, "0")}`);
const clock = (h: number) => { const m = Math.round((((h % 24) + 24) % 24) * 60); return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };

/** What each thing tends to move, among the sleep score's parts — the first one off that night is said beside it. */
const MOVES: Record<string, PartId[]> = {
  drinks: ["hrv", "hrsleep", "rem", "wakings"], caf: ["onset", "deep", "length"], late: ["length"], latetrain: ["hrsleep", "onset", "hrv"],
  stress: ["onset", "hrsleep", "hrv"], phone: ["onset", "length"], meal: ["hrsleep", "onset"], nap: ["onset"], tag: ["length", "wakings", "hrsleep"],
};

/** A part that was off, in words. */
function said(p: SleepScore["parts"][number]): string | null {
  const v = p.value;
  switch (p.id) {
    case "hrv": return v < 0 ? `HRV ${Math.abs(Math.round(v))} % under your usual` : null;
    case "hrsleep": return v > 0 ? `heart rate asleep +${Math.round(v)} bpm` : null;
    case "onset": return `${Math.round(v)} min to fall asleep`;
    case "length": return `${hm(v * 60)} asleep`;
    case "deep": return `deep sleep ${Math.round(v)} %`;
    case "rem": return `REM ${Math.round(v)} %`;
    case "wakings": return `woke ${Math.round(v)}×`;
    default: return null;
  }
}

/** Everything that stood out, the most significant first; [] when nothing did. */
export function standouts(n: Night, e: Evening | undefined, ns: Night[], score?: SleepScore): Standout[] {
  if (!e) return [];
  const out: { id: string; label: string; weight: number; moves: PartId[] }[] = [];
  const add = (id: string, label: string, weight: number, moves = MOVES[id] ?? MOVES.tag) => out.push({ id, label, weight, moves });
  const k = e.drinks.length;
  if (k > 0) add("drinks", `${k} drink${k > 1 ? "s" : ""}`, Math.min(1, 0.45 + 0.15 * k));
  if (e.caffeineAtBed >= 30) add("caf", `~${Math.round(e.caffeineAtBed / 10) * 10} mg caffeine at bed`, Math.min(0.9, 0.35 + e.caffeineAtBed / 200));
  // late against the study's window and against your usual: whichever is less late (an owl's usual 00:30 isn't "late")
  const onAt = clockH(n.onset, n.eve), before = ns.filter((x) => x.id !== n.id && x.day < n.day && x.day >= addDays(n.day, -28));
  const u = usual(before.map((x) => clockH(x.onset, x.eve)))?.mid, late = Math.min(onAt - 23.5, u != null ? onAt - u : Infinity);
  if (Number.isFinite(onAt) && late >= 1) add("late", `late night — asleep ${clock(onAt)}`, Math.min(0.95, 0.5 + 0.15 * (late - 1)));
  if (e.lateTrain) add("latetrain", "trained late", 0.55);
  if (e.eveStress != null && e.eveStress >= 7) add("stress", `stressed evening, ${e.eveStress}/10`, 0.45 + 0.05 * (e.eveStress - 7));
  if (e.phoneMin != null && e.phoneMin >= 45) add("phone", e.phoneMin >= 60 ? "phone 1 h+ before sleep" : "phone ~45 min before sleep", e.phoneMin >= 60 ? 0.55 : 0.45);
  if (e.lastMealMin != null && e.lastMealMin < 90) add("meal", `ate ${hm(e.lastMealMin)} before bed`, 0.4);
  for (const t of e.tags ?? []) add(`tag:${t}`, nightLabel(t), t === "out" || t === "gf" || t === "worklate" ? 0.5 : 0.4);
  if (n.nap && n.nap.min >= 30) add("nap", `napped ${hm(n.nap.min)}`, 0.35);
  // the night's own numbers tip it: what this thing usually moves, off that night
  const parts = new Map((score?.parts ?? []).map((p) => [p.id, p]));
  return out.map((c) => {
    const off = c.moves.map((id) => parts.get(id)).find((p) => p && p.zone !== "ideal" && said(p) != null);
    return { id: c.id, label: c.label, weight: Math.round((c.weight + (off ? (off.zone === "poor" ? 0.2 : 0.08) : 0)) * 100) / 100, also: off ? said(off) : null };
  }).sort((a, b) => b.weight - a.weight);
}

/** The most significant thing about the night's evening, or null. */
export const standout = (n: Night, e: Evening | undefined, ns: Night[], score?: SleepScore): Standout | null => standouts(n, e, ns, score)[0] ?? null;

/** A word or two for the small nights on the strip (a phone fits ~8 letters under each). */
export function shortOf(so: Pick<Standout, "id" | "label">): string {
  const id = so.id.startsWith("tag:") ? "tag" : so.id;
  const W: Record<string, string> = { late: "late night", caf: "caffeine", latetrain: "late gym", stress: "stressed", phone: "phone", meal: "late meal", nap: "nap" };
  return id === "drinks" ? so.label : id === "tag" ? so.label : W[id] ?? so.label;
}
