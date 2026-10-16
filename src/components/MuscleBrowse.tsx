/**
 * Pick an exercise by muscle (#81; owner, 13 Oct: "Add more exercises and that i can choose when hitting a muscle- like i
 * should do shoulder and i can choose between exercises and machine or dumbbell etc"). The muscle, then the equipment,
 * then the exercise — yours first. Opens on the muscle of the exercise you're swapping or adding after.
 */

import { useMemo, useState } from "react";
import { byMuscle, EQUIP_NAMES, EQUIPS, type Equip } from "../lib/exsearch";
import { MUSCLE_GROUPS } from "../lib/training";
import { useMyExercises } from "./useMyExercises";

export function MuscleBrowse({ start, skip, onPick }: { start: string | null; skip: string[]; onPick: (name: string) => void }) {
  const mine = useMyExercises();
  const [muscle, setMuscle] = useState<string | null>(start);
  const [equip, setEquip] = useState<Equip | "all">("all");
  const list = useMemo(() => (muscle ? byMuscle(muscle, mine, skip) : []), [muscle, mine, skip]);
  const kinds = EQUIPS.filter((e) => list.some((x) => x.equip === e));
  // a kind the new muscle doesn't have falls back to all of them
  const on = equip !== "all" && kinds.includes(equip) ? equip : "all";
  const shown = on === "all" ? list : list.filter((x) => x.equip === on);
  return (
    <div className="mbrowse">
      <span className="s">Or pick by muscle:</span>
      <div className="mb-muscles" role="group" aria-label="Muscle">
        {MUSCLE_GROUPS.map((m) => <button type="button" key={m} aria-pressed={m === muscle} onClick={() => setMuscle(m)}>{m}</button>)}
      </div>
      {muscle && kinds.length > 1 && <div className="mb-equip" role="group" aria-label="Equipment">
        {(["all", ...kinds] as const).map((e) => <button type="button" key={e} aria-pressed={e === on} onClick={() => setEquip(e)}>{e === "all" ? "All" : EQUIP_NAMES[e]}</button>)}
      </div>}
      {muscle && <div className="mb-list" aria-label={`${muscle} exercises`}>
        {shown.length === 0 ? <span className="s">Nothing else for {muscle.toLowerCase()} — type one above.</span>
          : shown.map((x) => <button type="button" key={x.name} onClick={() => onPick(x.name)}><b>{x.name}</b><small>{[EQUIP_NAMES[x.equip].toLowerCase(), x.mine ? "yours" : null].filter(Boolean).join(" · ")}</small></button>)}
      </div>}
    </div>
  );
}
