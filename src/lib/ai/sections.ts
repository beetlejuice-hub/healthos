/**
 * Parts of what the AI is told that the app knew but didn't say (owner, 15 Oct: "make sure app sees all data, organized"):
 * this morning's readiness and why, training (this week, the main lifts' trends, the last sessions), and what the Sleep /
 * Heart / Mind / Training grids found with what you said about it. Pure: lines in, the context file puts them in order.
 */

import type { Notice } from "../inbox";
import type { LiftTrend, Session, ThisWeek } from "../liftstrength";
import type { Readiness } from "../readiness";

const r1 = (v: number) => Math.round(v * 10) / 10;
const ymd = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

/** This morning: readiness, what held it, each part with its points. */
export function todayLines(r: Readiness | null): string[] {
  if (!r) return [];
  return [
    `Readiness ${r.score}/100 (${r.word})${r.cap ? ` — held at ${r.cap.to}: ${r.cap.why} (the parts add to ${r.added})` : ""}.`,
    ...r.parts.map((p) => `${p.name}: ${r1(p.got)}/${p.max} (${p.zone}) — ${p.why}`),
    ...(r.left.length ? [`Not known yet: ${r.left.map((l) => l.name).join(", ")}.`] : []),
  ];
}

/** This week against the 4 before it, each main lift's estimated 1-rep max and its trend, and the last sessions. */
export function trainingLines(ss: Session[], lifts: LiftTrend[], week: ThisWeek, last = 6): string[] {
  if (!ss.length) return [];
  const w = `This week: ${week.sessions} session${week.sessions === 1 ? "" : "s"}${week.usualSessions != null ? ` (usual ${r1(week.usualSessions)})` : ""}, ${week.workingSets} working sets${week.usualSets != null ? ` (usual ${Math.round(week.usualSets)})` : ""}${week.pct != null ? `, strength ${week.pct >= 0 ? "+" : ""}${r1(week.pct)} % against your trend` : ""}.`;
  const L = lifts.map((t) => { const p = t.pts[t.pts.length - 1]; return `${t.exercise}: best set ${p.kg} kg × ${p.reps} (≈ ${Math.round(p.e1rm)} kg 1-rep max), ${t.gain >= 0 ? "+" : ""}${r1(t.gain)} kg over ${Math.round(t.days)} days`; });
  const S = ss.slice(-last).map((s) => `${ymd(s.startedAt)} ${s.template}: ${s.workingSets} working sets, ${Math.round(s.volume).toLocaleString("en-GB")} kg${s.pct != null ? `, ${s.pct >= 0 ? "+" : ""}${r1(s.pct)} % vs trend` : ""}`);
  return [w, ...L, ...(S.length ? ["Last sessions:", ...S] : [])];
}

/** The grids' clear findings the app sent you, newest last, with your reply when there is one. */
export function gridLines(inbox: Notice[]): string[] {
  return inbox.filter((n) => n.kind === "finding").map((n) => {
    const text = n.text.replace(/ Goes with, not proof of why — anything else going on those \w+\?$/, "");
    return `${text}${n.reply ? ` — I said: "${n.reply.text}"` : ""}`;
  });
}
