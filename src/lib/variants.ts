/**
 * The same movement on different equipment (owner, 20 Oct: "On workouts can we have the exercises as like incline bench
 * press and the i can choose wheter machine, bench w barbell, bemch w dumbbell etc? Idk if it changes anything tho"). It
 * does: each variant keeps its own history and weights — a 30 kg dumbbell and a 60 kg bar aren't the same lift — so a
 * variant is its own exercise in the catalog, and this table groups them so switching is one tap. Only names that exist in
 * the catalog (training MUSCLES), so a switch never makes a second exercise. Pure.
 */

export type Variant = { label: string; name: string };
export type Movement = { move: string; options: Variant[] };

const m = (move: string, ...options: [label: string, name: string][]): Movement => ({ move, options: options.map(([label, name]) => ({ label, name })) });

export const MOVEMENTS: Movement[] = [
  m("Flat press", ["Barbell", "Bench press"], ["Dumbbell", "DB bench press"], ["Machine", "Chest press machine"], ["Smith", "Smith machine bench press"]),
  m("Incline press", ["Barbell", "Incline bench press"], ["Dumbbell", "Incline DB press"], ["Machine", "Incline chest press machine"], ["Smith", "Smith machine incline press"]),
  m("Shoulder press", ["Barbell", "Overhead press"], ["Dumbbell", "DB shoulder press"], ["Machine", "Shoulder press machine"], ["Smith", "Smith machine shoulder press"]),
  m("Chest fly", ["Dumbbell", "DB fly"], ["Cable", "Cable fly"], ["Machine", "Pec deck"]),
  m("Lateral raise", ["Dumbbell", "Lateral raise"], ["Cable", "Cable lateral raise"], ["Machine", "Machine lateral raise"]),
  m("Rear delt", ["Dumbbell", "Rear delt fly"], ["Cable", "Cable rear delt fly"], ["Machine", "Reverse pec deck"]),
  m("Row", ["Barbell", "Barbell row"], ["Dumbbell", "DB row"], ["Cable", "Seated cable row"], ["Machine", "Machine row"], ["Chest-supported", "Chest-supported row"]),
  m("Squat", ["Barbell", "Squat"], ["Smith", "Smith machine squat"], ["Hack", "Hack squat"], ["Goblet", "Goblet squat"]),
  m("Biceps curl", ["Barbell", "Barbell curl"], ["Dumbbell", "Bicep curl"], ["Cable", "Cable curl"], ["Machine", "Machine curl"]),
  m("Hammer curl", ["Dumbbell", "Hammer curl"], ["Cable", "Cable hammer curl"]),
  m("Triceps overhead", ["Dumbbell", "Overhead tricep extension"], ["Cable", "Cable overhead extension"]),
  m("Triceps pushdown", ["Bar", "Tricep pushdown"], ["Rope", "Rope pushdown"], ["One arm", "Single-arm cable pushdown"]),
  m("Leg curl", ["Seated", "Seated leg curl"], ["Lying", "Lying leg curl"], ["Standing", "Standing leg curl"]),
  m("Calf raise", ["Standing", "Standing calf raise machine"], ["Seated", "Seated calf raise"], ["Leg press", "Leg press calf raise"], ["Smith", "Smith machine calf raise"]),
  m("Lat pulldown", ["Wide", "Lat pulldown"], ["Close grip", "Close-grip lat pulldown"], ["One arm", "Single-arm lat pulldown"]),
  m("Hip thrust", ["Barbell", "Hip thrust"], ["Machine", "Hip thrust machine"]),
  m("Pull-up", ["Bodyweight", "Pull-ups"], ["Assisted", "Assisted pull-up machine"]),
  m("Dips", ["Bodyweight", "Dips"], ["Machine", "Tricep dip machine"], ["Bench", "Bench dips"]),
];

const BY_NAME = new Map(MOVEMENTS.flatMap((mv) => mv.options.map((o) => [o.name, mv] as const)));
/** The movement an exercise is a variant of, with all its options — null when it has no other variant. */
export const variantsOf = (name: string): Movement | null => BY_NAME.get(name) ?? null;
