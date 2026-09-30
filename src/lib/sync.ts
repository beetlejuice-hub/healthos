/**
 * Phone ↔ laptop sync through Supabase. Device-first: the app never waits on the network.
 *
 *  - Every local change becomes a queued **op** (upsert an entry, delete an entry, replace a doc).
 *    The queue is saved with the state, so a change made offline goes up when you're back online.
 *  - **Pull** asks the server for rows changed since the last pull (server timestamps, never the
 *    phone's clock) and merges them in. Anything with a pending local op wins — it's newer.
 *  - Deletes are soft (`deleted = true`) so the other device learns about them too.
 *
 * `planOps` and `mergePull` are pure and tested; `Syncer` is the thin part that talks to Supabase.
 */

import type { Entry } from "./types";
import type { State } from "./store";

export const DOC_KEYS = ["foods", "drinks", "supplements", "templates", "workouts", "goals", "settings", "profile"] as const;
export type DocKey = (typeof DOC_KEYS)[number];

export type Op =
  | { t: "entry"; id: string; entry: Entry }
  | { t: "delete"; id: string }
  | { t: "doc"; key: DocKey };

/** What changed between two states, as ops. Unchanged things are compared by reference. */
export function planOps(prev: State, next: State): Op[] {
  const ops: Op[] = [];
  if (prev.entries !== next.entries) {
    const before = new Map(prev.entries.map((e) => [e.id, e]));
    const after = new Set<string>();
    for (const e of next.entries) {
      after.add(e.id);
      if (before.get(e.id) !== e) ops.push({ t: "entry", id: e.id, entry: e });
    }
    for (const id of before.keys()) if (!after.has(id)) ops.push({ t: "delete", id });
  }
  for (const key of DOC_KEYS) if (prev[key] !== next[key]) ops.push({ t: "doc", key });
  return ops;
}

/** Add ops to a queue, keeping only the latest op per entry id / doc key. */
export function enqueue(queue: Op[], ops: Op[]): Op[] {
  const keyOf = (o: Op) => (o.t === "doc" ? `doc:${o.key}` : `e:${o.id}`);
  const map = new Map(queue.map((o) => [keyOf(o), o]));
  for (const o of ops) { map.delete(keyOf(o)); map.set(keyOf(o), o); }
  return [...map.values()];
}

export type EntryRow = { id: string; kind: string; at: string; data: Entry; deleted: boolean; updated_at: string };
export type DocRow = { key: string; value: unknown; updated_at: string };

/** Fold pulled rows into local state. Rows for things with a pending local op are skipped. */
export function mergePull(state: State, entries: EntryRow[], docs: DocRow[], pending: Op[]): State {
  const pendingEntry = new Set(pending.filter((o) => o.t !== "doc").map((o) => (o as { id: string }).id));
  const pendingDoc = new Set(pending.filter((o): o is Extract<Op, { t: "doc" }> => o.t === "doc").map((o) => o.key));
  let next = state;
  if (entries.length) {
    const map = new Map(state.entries.map((e) => [e.id, e]));
    let changed = false;
    for (const r of entries) {
      if (pendingEntry.has(r.id)) continue;
      if (r.deleted) { if (map.delete(r.id)) changed = true; }
      else { map.set(r.id, { ...r.data, id: r.id } as Entry); changed = true; }
    }
    if (changed) next = { ...next, entries: [...map.values()].sort((a, b) => a.at - b.at) };
  }
  for (const d of docs) {
    if (!(DOC_KEYS as readonly string[]).includes(d.key) || pendingDoc.has(d.key as DocKey)) continue;
    const key = d.key as DocKey;
    next = { ...next, [key]: key === "goals" || key === "settings" || key === "profile" ? { ...(next[key] as object), ...(d.value as object) } : d.value } as State;
  }
  return next;
}

/** Rows to send for a batch of ops. Docs read their value from the current state at send time. */
export function rowsFor(ops: Op[], state: State, userId: string) {
  const entries = ops.flatMap((o) => {
    if (o.t === "entry") return [{ user_id: userId, id: o.id, kind: o.entry.kind, at: new Date(o.entry.at).toISOString(), data: o.entry, deleted: false }];
    if (o.t === "delete") return [{ user_id: userId, id: o.id, kind: "deleted", at: new Date(0).toISOString(), data: {}, deleted: true }];
    return [];
  });
  const docs = ops.filter((o): o is Extract<Op, { t: "doc" }> => o.t === "doc").map((o) => ({ user_id: userId, key: o.key, value: state[o.key] }));
  return { entries, docs };
}

/* ------------------------------------------------------------------ the network part */

type Client = typeof import("./supabase").supabase;
export type SyncStatus = { state: "idle" | "syncing" | "offline" | "error"; pending: number; lastSync: number | null; message?: string };

export class Syncer {
  private queue: Op[];
  private cursor: string;
  private busy = false;
  private again = false;
  private listeners = new Set<(s: SyncStatus) => void>();
  status: SyncStatus;

  private client: Client;
  private userId: string;
  private getState: () => State;
  private apply: (s: State) => void;
  private storageKey: string;

  constructor(client: Client, userId: string, getState: () => State, apply: (s: State) => void, storageKey: string) {
    this.client = client; this.userId = userId; this.getState = getState; this.apply = apply; this.storageKey = storageKey;
    const saved = readJson<{ queue: Op[]; cursor: string; lastSync: number | null }>(storageKey);
    this.queue = saved?.queue ?? [];
    this.cursor = saved?.cursor ?? "1970-01-01T00:00:00Z";
    this.status = { state: "idle", pending: this.queue.length, lastSync: saved?.lastSync ?? null };
  }

  onStatus(f: (s: SyncStatus) => void) { this.listeners.add(f); f(this.status); return () => { this.listeners.delete(f); }; }
  private set(s: Partial<SyncStatus>) {
    this.status = { ...this.status, ...s, pending: this.queue.length };
    this.listeners.forEach((l) => l(this.status));
    writeJson(this.storageKey, { queue: this.queue, cursor: this.cursor, lastSync: this.status.lastSync });
  }

  /** Called by the store on every change. */
  push(next: State, prev: State) {
    const ops = planOps(prev, next);
    if (!ops.length) return;
    this.queue = enqueue(this.queue, ops);
    this.set({});
    this.schedule();
  }

  /** Forget the queue and pull everything again next time — after a wipe. */
  reset() { this.queue = []; this.cursor = "1970-01-01T00:00:00Z"; this.set({}); }

  /** Queue everything local as if new — the first sign-in on a device that already has data. */
  adoptLocal(state: State) {
    this.queue = enqueue(this.queue, [...state.entries.map((e): Op => ({ t: "entry", id: e.id, entry: e })), ...DOC_KEYS.map((key): Op => ({ t: "doc", key }))]);
    this.set({});
  }

  private timer: ReturnType<typeof setTimeout> | null = null;
  schedule(ms = 800) { if (this.timer) clearTimeout(this.timer); this.timer = setTimeout(() => void this.sync(), ms); }

  /** Send the queue, then pull what changed. Safe to call any time; overlapping calls coalesce. */
  async sync(): Promise<void> {
    if (this.busy) { this.again = true; return; }
    this.busy = true;
    this.set({ state: "syncing" });
    try {
      await this.flush();
      await this.pull();
      this.set({ state: "idle", lastSync: Date.now(), message: undefined });
    } catch (e) {
      const offline = typeof navigator !== "undefined" && !navigator.onLine;
      this.set({ state: offline ? "offline" : "error", message: (e as Error).message });
    } finally {
      this.busy = false;
      if (this.again) { this.again = false; this.schedule(200); }
    }
  }

  private async flush() {
    while (this.queue.length) {
      const batch = this.queue.slice(0, 400);
      const { entries, docs } = rowsFor(batch, this.getState(), this.userId);
      if (entries.length) { const { error } = await this.client.from("entries").upsert(entries, { onConflict: "user_id,id" }); if (error) throw new Error(error.message); }
      if (docs.length) { const { error } = await this.client.from("docs").upsert(docs, { onConflict: "user_id,key" }); if (error) throw new Error(error.message); }
      // Drop only what was sent; anything queued meanwhile for the same id stays (it's a newer op object).
      const sent = new Set(batch);
      this.queue = this.queue.filter((o) => !sent.has(o));
      this.set({});
    }
  }

  private async pull() {
    const rows: EntryRow[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await this.client.from("entries").select("id,kind,at,data,deleted,updated_at").gt("updated_at", this.cursor).order("updated_at", { ascending: true }).range(from, from + 999);
      if (error) throw new Error(error.message);
      rows.push(...(data as EntryRow[]));
      if (!data || data.length < 1000) break;
    }
    const { data: docs, error } = await this.client.from("docs").select("key,value,updated_at").gt("updated_at", this.cursor);
    if (error) throw new Error(error.message);
    const all = [...rows.map((r) => r.updated_at), ...((docs ?? []) as DocRow[]).map((d) => d.updated_at)];
    const merged = mergePull(this.getState(), rows, (docs ?? []) as DocRow[], this.queue);
    if (merged !== this.getState()) this.apply(merged);
    if (all.length) this.cursor = all.sort().at(-1)!;
  }
}

function readJson<T>(key: string): T | null { try { const r = localStorage.getItem(key); return r ? (JSON.parse(r) as T) : null; } catch { return null; } }
function writeJson(key: string, v: unknown) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage full or blocked */ } }
