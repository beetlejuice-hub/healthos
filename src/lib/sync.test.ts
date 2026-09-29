import { describe, expect, it } from "vitest";
import { enqueue, mergePull, planOps, rowsFor, Syncer, type EntryRow, type Op } from "./sync";
import { EMPTY_STATE, type State } from "./store";
import type { Entry } from "./types";

const e = (id: string, at: number, kg = 80): Entry => ({ id, kind: "weight", at, kg });
const base: State = { ...EMPTY_STATE, entries: [e("a", 1), e("b", 2)] };

describe("planOps", () => {
  it("sees added, changed and removed entries, and changed docs", () => {
    const next: State = { ...base, entries: [base.entries[0], e("b", 2, 81), e("c", 3)], goals: { ...base.goals, kcal: 2400 } };
    const ops = planOps(base, { ...next, entries: next.entries.filter((x) => x.id !== "a") });
    expect(ops).toEqual(expect.arrayContaining([
      { t: "entry", id: "b", entry: e("b", 2, 81) },
      { t: "entry", id: "c", entry: e("c", 3) },
      { t: "delete", id: "a" },
      { t: "doc", key: "goals" },
    ]));
    expect(ops).toHaveLength(4);
  });

  it("is empty when nothing changed", () => {
    expect(planOps(base, base)).toEqual([]);
  });
});

describe("enqueue", () => {
  it("keeps only the latest op per id", () => {
    const q = enqueue([{ t: "entry", id: "a", entry: e("a", 1) }], [{ t: "delete", id: "a" }, { t: "doc", key: "goals" }, { t: "doc", key: "goals" }]);
    expect(q).toEqual([{ t: "delete", id: "a" }, { t: "doc", key: "goals" }]);
  });
});

describe("mergePull", () => {
  const row = (id: string, data: Entry, deleted = false): EntryRow => ({ id, kind: data.kind, at: new Date(data.at).toISOString(), data, deleted, updated_at: "2026-09-29T10:00:00Z" });

  it("adds, updates and removes entries from the server", () => {
    const m = mergePull(base, [row("c", e("c", 3)), row("b", e("b", 2, 79)), row("a", e("a", 1), true)], [], []);
    expect(m.entries.map((x) => x.id)).toEqual(["b", "c"]);
    expect((m.entries[0] as Extract<Entry, { kind: "weight" }>).kg).toBe(79);
  });

  it("never overwrites something with a pending local change", () => {
    const pending: Op[] = [{ t: "entry", id: "b", entry: e("b", 2, 85) }, { t: "doc", key: "goals" }];
    const m = mergePull(base, [row("b", e("b", 2, 79))], [{ key: "goals", value: { kcal: 1 }, updated_at: "x" }], pending);
    expect(m.entries.find((x) => x.id === "b")).toEqual(base.entries[1]);
    expect(m.goals).toEqual(base.goals);
  });

  it("replaces docs, merging goals and settings over defaults", () => {
    const m = mergePull(base, [], [{ key: "goals", value: { kcal: 2300 }, updated_at: "x" }, { key: "supplements", value: [], updated_at: "x" }], []);
    expect(m.goals).toEqual({ ...base.goals, kcal: 2300 });
    expect(m.supplements).toEqual([]);
  });

  it("returns the same object when nothing changed", () => {
    expect(mergePull(base, [], [], [])).toBe(base);
  });
});

describe("rowsFor", () => {
  it("builds upsert rows, soft-deletes, and reads docs at send time", () => {
    const r = rowsFor([{ t: "entry", id: "a", entry: e("a", 0) }, { t: "delete", id: "z" }, { t: "doc", key: "goals" }], base, "u1");
    expect(r.entries[0]).toMatchObject({ user_id: "u1", id: "a", kind: "weight", deleted: false });
    expect(r.entries[1]).toMatchObject({ id: "z", deleted: true });
    expect(r.docs).toEqual([{ user_id: "u1", key: "goals", value: base.goals }]);
  });
});

/** An in-memory stand-in for the two Supabase tables, enough for Syncer's calls. */
function fakeServer() {
  const tables: Record<string, Map<string, Record<string, unknown>>> = { entries: new Map(), docs: new Map() };
  let clock = 0;
  const stamp = () => new Date(Date.UTC(2026, 8, 29, 0, 0, 0, ++clock)).toISOString();
  const client = {
    from(t: string) {
      const table = tables[t];
      const q = {
        _gt: "", _from: 0, _to: 999,
        upsert(rows: Record<string, unknown>[], o: { onConflict: string }) {
          for (const r of rows) table.set(o.onConflict.split(",").map((k) => r[k]).join("|"), { ...r, updated_at: stamp() });
          return Promise.resolve({ error: null });
        },
        select() { return q; },
        gt(_c: string, v: string) { q._gt = v; return q; },
        order() { return q; },
        range(a: number, b: number) { q._from = a; q._to = b; return q; },
        then(res: (v: { data: unknown[]; error: null }) => void) {
          const rows = [...table.values()].filter((r) => (r.updated_at as string) > q._gt).sort((a, b) => ((a.updated_at as string) < (b.updated_at as string) ? -1 : 1));
          res({ data: rows.slice(q._from, q._to + 1), error: null });
        },
      };
      return q;
    },
  };
  return { client, tables };
}

describe("Syncer end to end against a fake server", () => {
  it("two devices converge: add on one, edit and delete on the other", async () => {
    const server = fakeServer();
    const mk = (key: string) => {
      let st: State = { ...EMPTY_STATE };
      const s = new Syncer(server.client as never, "u1", () => st, (n) => { st = n; }, key);
      return { s, get: () => st, change: (n: State) => { const p = st; st = n; s.push(n, p); } };
    };
    const phone = mk("sync:phone"), laptop = mk("sync:laptop");

    phone.change({ ...phone.get(), entries: [e("w1", 1, 80)], goals: { ...phone.get().goals, kcal: 2500 } });
    await phone.s.sync();
    await laptop.s.sync();
    expect(laptop.get().entries.map((x) => x.id)).toEqual(["w1"]);
    expect(laptop.get().goals.kcal).toBe(2500);

    laptop.change({ ...laptop.get(), entries: [e("w1", 1, 79.5), e("w2", 2, 79)] });
    await laptop.s.sync();
    laptop.change({ ...laptop.get(), entries: laptop.get().entries.filter((x) => x.id !== "w2") });
    await laptop.s.sync();
    await phone.s.sync();
    expect(phone.get().entries).toEqual([e("w1", 1, 79.5)]);
    expect(phone.s.status.pending).toBe(0);
  });
});
