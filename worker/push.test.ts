import { describe, expect, it } from "vitest";
import { PushHub, STALE_MS, type Storage } from "./push";
import { handlePush } from "./index";

function fakeStorage() {
  const m = new Map<string, unknown>();
  let alarm: number | null = null;
  const s: Storage & { alarm: () => number | null; m: Map<string, unknown> } = {
    m, alarm: () => alarm,
    async get<T>(k: string) { return m.get(k) as T | undefined; },
    async put(k, v) { m.set(k, structuredClone(v)); },
    async delete(k) { return m.delete(k); },
    async setAlarm(at) { alarm = at; },
    async deleteAlarm() { alarm = null; },
  };
  return s;
}

const T0 = Date.UTC(2026, 9, 2, 11, 0);
const sub = (n: number) => ({ endpoint: `https://push.example/${n}`, keys: { p256dh: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4", auth: "BTBZMqHH6r4Tts7J_aSIgg" } });
const post = (path: string, body: unknown) => new Request(`https://push/${path}`, { method: "POST", body: JSON.stringify(body) });

function hub(statusFor: (endpoint: string) => number = () => 201) {
  const st = fakeStorage(), sent: { endpoint: string; message: { title: string; body: string; url: string } }[] = [];
  let now = T0;
  const h = new PushHub({ storage: st }, undefined, {
    now: () => now,
    send: (async (s: { endpoint: string }, message: never) => { sent.push({ endpoint: s.endpoint, message }); return statusFor(s.endpoint); }) as never,
  });
  return { h, st, sent, at: (t: number) => { now = t; } };
}

describe("PushHub", () => {
  it("makes its own VAPID key once and keeps it", async () => {
    const { h } = hub();
    const a = await (await h.fetch(new Request("https://push/key"))).json() as { publicKey: string };
    const b = await (await h.fetch(new Request("https://push/key"))).json() as { publicKey: string };
    expect(a.publicKey).toMatch(/^B[A-Za-z0-9_-]{86}$/); // 65-byte uncompressed P-256 point
    expect(b.publicKey).toBe(a.publicKey);
  });

  it("keeps devices (one per endpoint) and refuses junk", async () => {
    const { h } = hub();
    expect((await h.fetch(post("subscribe", { subscription: sub(1), device: "iPhone" }))).status).toBe(200);
    await h.fetch(post("subscribe", { subscription: sub(1), device: "iPhone" }));
    await h.fetch(post("subscribe", { subscription: sub(2), device: "Mac Chrome" }));
    expect((await h.fetch(post("subscribe", { subscription: { endpoint: "http://x", keys: {} } }))).status).toBe(400);
    const s = await (await h.fetch(new Request("https://push/status"))).json() as { devices: unknown[] };
    expect(s.devices).toHaveLength(2);
  });

  it("a plan replaces the last one and the alarm points at its first reminder", async () => {
    const { h, st } = hub();
    await h.fetch(post("schedule", { reminders: [{ at: T0 + 3 * 3_600_000, title: "Later", body: "", url: "/", tag: "a" }] }));
    await h.fetch(post("schedule", { reminders: [{ at: T0 + 2 * 3_600_000, title: "How now?", body: "b", url: "/#today", tag: "feel" }, { at: T0 + 6 * 3_600_000, title: "Weigh-in", body: "", url: "/#today", tag: "w" }] }));
    expect(st.alarm()).toBe(T0 + 2 * 3_600_000);
    expect((st.m.get("reminders") as unknown[]).length).toBe(2);
    await h.fetch(post("schedule", { reminders: [] }));
    expect(st.alarm()).toBeNull();
  });

  it("the alarm sends what's due to every device, then re-arms for the next", async () => {
    const { h, st, sent, at } = hub();
    await h.fetch(post("subscribe", { subscription: sub(1), device: "iPhone" }));
    await h.fetch(post("subscribe", { subscription: sub(2), device: "Mac" }));
    await h.fetch(post("schedule", { reminders: [{ at: T0 + 3_600_000, title: "How now?", body: "Tap a number.", url: "/#today", tag: "feel" }, { at: T0 + 5 * 3_600_000, title: "Weigh-in", body: "", url: "/#today", tag: "w" }] }));
    at(T0 + 3_600_000 + 2000);
    await h.alarm();
    expect(sent.map((s) => [s.endpoint, s.message.title])).toEqual([["https://push.example/1", "How now?"], ["https://push.example/2", "How now?"]]);
    expect(st.alarm()).toBe(T0 + 5 * 3_600_000);
  });

  it("several due at once are merged into one; ones 20+ minutes late are dropped, not sent late", async () => {
    const { h, sent, at } = hub();
    await h.fetch(post("subscribe", { subscription: sub(1), device: "iPhone" }));
    await h.fetch(post("schedule", { reminders: [
      { at: T0 + 60_000, title: "Old", body: "x", url: "/", tag: "o" },
      { at: T0 + 3_600_000, title: "How now?", body: "Rate.", url: "/#today", tag: "feel" },
      { at: T0 + 3_600_000 + 10_000, title: "Midday stack", body: "Theanine.", url: "/#today", tag: "supp" },
    ] }));
    at(T0 + 3_600_000 + 15_000); // the "Old" one is ~59 min late by now
    await h.alarm();
    expect(sent).toHaveLength(1);
    expect(sent[0].message.title).toBe("How now? · Midday stack");
    expect(STALE_MS).toBe(20 * 60_000);
  });

  it("a device the push service says is gone (410) is forgotten; others keep their last result", async () => {
    const { h, st } = hub((e) => (e.endsWith("/2") ? 410 : 201));
    await h.fetch(post("subscribe", { subscription: sub(1), device: "iPhone" }));
    await h.fetch(post("subscribe", { subscription: sub(2), device: "Old laptop" }));
    const r = await (await h.fetch(post("test", {}))).json() as { devices: { device: string; last: { status: number } }[] };
    expect(r.devices).toEqual([{ device: "iPhone", last: { at: T0, status: 201 } }]);
    expect((st.m.get("devices") as unknown[]).length).toBe(1);
  });
});

describe("/api/push on the Worker", () => {
  it("needs a signed-in user, and gives each account its own hub", async () => {
    const ids: string[] = [];
    const env = {
      ASSETS: { fetch: async () => new Response("") },
      PUSH: { idFromName: (n: string) => { ids.push(n); return n; }, get: () => ({ fetch: async (r: Request) => new Response(new URL(r.url).pathname) }) },
    };
    const auth = (async (u: string, init: RequestInit) => (String(u).endsWith("/auth/v1/user") && (init.headers as Record<string, string>).authorization === "Bearer good" ? new Response(JSON.stringify({ id: "user-1" })) : new Response("", { status: 401 }))) as unknown as typeof fetch;
    expect((await handlePush(new Request("https://app/api/push/key"), env, auth)).status).toBe(401);
    const ok = await handlePush(new Request("https://app/api/push/key", { headers: { authorization: "Bearer good" } }), env, auth);
    expect(await ok.text()).toBe("/key");
    expect(ids).toEqual(["user-1"]);
    expect((await handlePush(new Request("https://app/api/push/nope", { headers: { authorization: "Bearer good" } }), env, auth)).status).toBe(404);
  });
});
