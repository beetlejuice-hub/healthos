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
        _gt: "", _from: 0, _to: 999, _del: false, _eq: [] as [string, string][], _notIn: [] as [string, string[]][],
        delete() { q._del = true; return q; },
        eq(c: string, v: string) { q._eq.push([c, v]); return q; },
        not(c: string, _op: string, list: string) { q._notIn.push([c, list.replace(/[()]/g, "").split(",")]); return q; },
        upsert(rows: Record<string, unknown>[], o: { onConflict: string }) {
          for (const r of rows) table.set(o.onConflict.split(",").map((k) => r[k]).join("|"), { ...r, updated_at: stamp() });
          return Promise.resolve({ error: null });
        },
        select() { return q; },
        gt(_c: string, v: string) { q._gt = v; return q; },
        order() { return q; },
        range(a: number, b: number) { q._from = a; q._to = b; return q; },
        then(res: (v: { data: unknown[]; error: null }) => void) {
          const match = (r: Record<string, unknown>) => q._eq.every(([c, v]) => String(r[c]) === v) && q._notIn.every(([c, l]) => !l.includes(String(r[c])));
          if (q._del) { for (const [k, r] of [...table.entries()]) if (match(r)) table.delete(k); res({ data: [], error: null }); return; }
          const rows = [...table.values()].filter((r) => (r.updated_at as string) > q._gt && match(r)).sort((a, b) => ((a.updated_at as string) < (b.updated_at as string) ? -1 : 1));
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

describe("reset all data", () => {
  const mkDevice = (server: ReturnType<typeof fakeServer>, key: string) => {
    let st: State = { ...EMPTY_STATE };
    let wiped = 0;
    const s = new Syncer(server.client as never, "u1", () => st, (n) => { st = n; }, key, () => { wiped++; st = { ...EMPTY_STATE }; });
    return { s, get: () => st, wiped: () => wiped, change: (n: State) => { const p = st; st = n; s.push(n, p); } };
  };

  it("empties the server (keeping only the AI cost record) and this device", async () => {
    const server = fakeServer();
    const phone = mkDevice(server, "reset:phone");
    phone.change({ ...phone.get(), entries: [e("w1", 1), e("w2", 2)], goals: { ...phone.get().goals, kcal: 2500 } });
    await phone.s.sync();
    server.tables.docs.set("u1|ai_usage", { user_id: "u1", key: "ai_usage", value: { calls: 3 }, updated_at: "2026-09-29T00:00:00.500Z" });
    expect(server.tables.entries.size).toBe(2);

    await phone.s.resetAll();
    expect(server.tables.entries.size).toBe(0);
    expect([...server.tables.docs.keys()].sort()).toEqual(["u1|ai_usage", "u1|reset"]);
    expect(phone.get().entries).toEqual([]);
    expect(phone.get().goals).toEqual(EMPTY_STATE.goals);
    expect(phone.s.status.pending).toBe(0);
    // It doesn't wipe itself again on its next sync.
    await phone.s.sync();
    expect(phone.wiped()).toBe(1);
  });

  it("the other device drops its stale copy AND its unsent change, so nothing comes back", async () => {
    const server = fakeServer();
    const phone = mkDevice(server, "reset2:phone"), laptop = mkDevice(server, "reset2:laptop");
    phone.change({ ...phone.get(), entries: [e("w1", 1)] });
    await phone.s.sync(); await laptop.s.sync();
    expect(laptop.get().entries.map((x) => x.id)).toEqual(["w1"]);
    // Laptop goes offline with an edit queued; meanwhile the phone resets everything.
    laptop.change({ ...laptop.get(), entries: [e("w1", 1), e("w9", 9)], goals: { ...laptop.get().goals, kcal: 3000 } });
    await phone.s.resetAll();
    // Laptop comes back.
    await laptop.s.sync();
    expect(laptop.wiped()).toBe(1);
    expect(laptop.get().entries).toEqual([]);
    expect(server.tables.entries.size).toBe(0); // the queued w9 never went up
    expect(server.tables.docs.has("u1|goals")).toBe(false);
    // And afterwards both work normally again.
    laptop.change({ ...laptop.get(), entries: [e("new", 10)] });
    await laptop.s.sync(); await phone.s.sync();
    expect(phone.get().entries.map((x) => x.id)).toEqual(["new"]);
    expect(phone.wiped()).toBe(1);
  });

  it("a device that never saw a reset and has none on the server keeps its data (the twin)", async () => {
    const server = fakeServer();
    const a = mkDevice(server, "reset3:a");
    a.change({ ...a.get(), entries: [e("k", 1)] });
    await a.s.sync(); await a.s.sync();
    expect(a.wiped()).toBe(0);
    expect(a.get().entries.map((x) => x.id)).toEqual(["k"]);
  });
});

describe("email links", () => {
  it("signs in only for a password reset; a confirmation link just says confirmed", async () => {
    const { readEmailLink } = await import("./session");
    expect(readEmailLink("#today")).toBeNull();
    expect(readEmailLink("#access_token=a&refresh_token=r&type=signup")).toEqual({ kind: "notice", text: "Email confirmed. Sign in below." });
    expect(readEmailLink("#access_token=a&refresh_token=r&type=recovery")).toEqual({ kind: "recovery", access_token: "a", refresh_token: "r" });
    expect(readEmailLink("#error=access_denied&error_description=Email+link+is+invalid+or+has+expired")).toEqual({ kind: "notice", text: "Email link is invalid or has expired" });
  });
});
