/**
 * Where the AI money goes (PLAN 195; owner, 4 Nov: "6" — "reads $6 · chat $4 · research $1.40 · food $0.30"): the month's
 * cost by job, from the Worker's count by task. A month that began before the Worker counted by task fills in from the
 * recent calls' log, and says so. Pure.
 */

import type { CallLog, Task, UsageDoc } from "./tasks";

export const JOBS: { name: string; tasks: Task[] }[] = [
  { name: "reads", tasks: ["digest", "night", "review"] },
  { name: "chat", tasks: ["chat"] },
  { name: "deep dive & experiments", tasks: ["dive", "verdict"] },
  { name: "research", tasks: ["research", "supplement"] },
  { name: "food & drink", tasks: ["describe"] },
  { name: "questions", tasks: ["questions"] },
];

const monthOf = (at: number) => { const d = new Date(at); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };

/** The month's jobs, most spent first (nothing spent: left out). `calls`: when it's from the log, how many calls it saw. */
export function spendByJob(u: Pick<UsageDoc, "month" | "byTask" | "recent"> | null | undefined): { rows: { name: string; usd: number }[]; calls?: number } {
  if (!u) return { rows: [] };
  const counted = u.byTask && Object.values(u.byTask).some((v) => (v ?? 0) > 0);
  const log: CallLog[] = counted ? [] : (u.recent ?? []).filter((c) => monthOf(c.at) === u.month);
  const of = (t: Task) => (counted ? u.byTask?.[t] ?? 0 : log.filter((c) => c.task === t).reduce((a, c) => a + c.usd, 0));
  const rows = JOBS.map((j) => ({ name: j.name, usd: j.tasks.reduce((a, t) => a + of(t), 0) })).filter((r) => r.usd >= 0.005).sort((a, b) => b.usd - a.usd);
  return counted ? { rows } : { rows, calls: log.length };
}
