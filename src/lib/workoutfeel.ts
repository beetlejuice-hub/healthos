/**
 * A workout's 1–10 (PLAN 202; owner, 10 Nov: "Do a 1-10 slider for workouts and connect sleep, how i feel, what i eat to
 * my gym performance, cardio strength etc"): how it went, in a word on the slider. Pure.
 */
export const workoutWord = (v: number) => (v >= 9 ? "great" : v >= 7 ? "strong" : v >= 5 ? "okay" : v >= 3 ? "flat" : "rough");
