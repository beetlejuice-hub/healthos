// Where the AI money goes (PLAN 195). Planted: a month of calls — reads $6.10, chat $4.20, research $1.40, food $0.30.
import { describe, expect, it } from "vitest";
import { spendByJob } from "./spend";
import type { CallLog, Task } from "./tasks";

const at = (d: number) => new Date(2026, 10, d, 9).getTime();
const call = (task: Task, usd: number, d = 2): CallLog => ({ at: at(d), task, model: "sonnet", in: 0, cached: 0, written: 0, out: 0, searches: 0, usd });

describe("the month's AI cost by job", () => {
  it("from the Worker's count: the jobs, most first; nothing spent, left out", () => {
    const r = spendByJob({ month: "2026-11", byTask: { digest: 4.1, night: 1.6, review: 0.4, chat: 4.2, research: 1.0, supplement: 0.4, describe: 0.3, questions: 0 } });
    expect(r.rows.map((x) => [x.name, +x.usd.toFixed(2)])).toEqual([["reads", 6.1], ["chat", 4.2], ["research", 1.4], ["food & drink", 0.3]]);
    expect(r.calls).toBeUndefined();
  });
  it("a month from before the count: the recent calls of this month fill in, and how many", () => {
    const recent = [call("digest", 0.12), call("chat", 0.05), call("chat", 0.04), { ...call("digest", 9), at: new Date(2026, 9, 30).getTime() }];
    const r = spendByJob({ month: "2026-11", recent });
    expect(r.rows.map((x) => [x.name, +x.usd.toFixed(2)])).toEqual([["reads", 0.12], ["chat", 0.09]]);
    expect(r.calls).toBe(3);
  });
  it("control: nothing yet, nothing to show", () => {
    expect(spendByJob(null).rows).toEqual([]);
    expect(spendByJob({ month: "2026-11", byTask: {}, recent: [] }).rows).toEqual([]);
  });
});
