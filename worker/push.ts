/**
 * Notifications, server side. One Durable Object per account ("PushHub") keeps:
 *  - the account's devices (push subscriptions) and each one's last delivery,
 *  - the next ~24 h of reminders, as planned by the app (newest plan wins),
 *  - its own VAPID key pair, made on first use — so there's no secret to set.
 * It wakes on an alarm at the next reminder's minute, sends it to every device, and sets the next
 * alarm. Reminders more than 20 minutes late (phone off, Worker asleep) are dropped, not sent late.
 */

import { newVapid, sendPush, type Subscription, type Vapid } from "./webpush";

export type Reminder = { at: number; title: string; body: string; url: string; tag: string };
export type Device = Subscription & { device: string; addedAt: number; last?: { at: number; status: number } };

/** The storage a Durable Object gives us (the subset used; tests pass a Map-backed fake). */
export type Storage = {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<boolean>;
  setAlarm(at: number): Promise<void>;
  deleteAlarm(): Promise<void>;
};

export const SUBJECT = "https://healthos.lukacsarnold9.workers.dev";
export const STALE_MS = 20 * 60_000;
const MAX_REMINDERS = 40;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export class PushHub {
  storage: Storage;
  send: typeof sendPush;
  now: () => number;
  constructor(state: { storage: Storage }, _env?: unknown, deps?: { send?: typeof sendPush; now?: () => number }) {
    this.storage = state.storage;
    this.send = deps?.send ?? sendPush;
    this.now = deps?.now ?? Date.now;
  }

  private async vapid(): Promise<Vapid> {
    let v = await this.storage.get<Vapid>("vapid");
    if (!v) { v = await newVapid(); await this.storage.put("vapid", v); }
    return v;
  }
  private devices = async () => (await this.storage.get<Device[]>("devices")) ?? [];
  private reminders = async () => (await this.storage.get<Reminder[]>("reminders")) ?? [];

  /** Point the alarm at the next reminder (or clear it). */
  private async rearm(list: Reminder[]) {
    const next = list.filter((r) => r.at > this.now() - STALE_MS).reduce((m, r) => Math.min(m, r.at), Infinity);
    if (Number.isFinite(next)) await this.storage.setAlarm(Math.max(next, this.now() + 1000));
    else await this.storage.deleteAlarm();
  }

  /** Send one message to every device; drop devices the push service says are gone. */
  private async broadcast(message: Omit<Reminder, "at">): Promise<Device[]> {
    const v = await this.vapid(), devs = await this.devices(), keep: Device[] = [];
    for (const d of devs) {
      let status = 0;
      try { status = await this.send(d, message, v, SUBJECT); } catch { status = 0; }
      if (status === 404 || status === 410) continue; // unsubscribed or expired: forget it
      keep.push({ ...d, last: { at: this.now(), status } });
    }
    await this.storage.put("devices", keep);
    return keep;
  }

  async fetch(req: Request): Promise<Response> {
    const path = new URL(req.url).pathname.replace(/^\/+/, "");
    const body = req.method === "POST" ? ((await req.json().catch(() => ({}))) as Record<string, unknown>) : {};
    if (path === "key") return json({ publicKey: (await this.vapid()).publicKey });
    if (path === "subscribe") {
      const s = body.subscription as Subscription | undefined;
      if (!s?.endpoint?.startsWith("https://") || !s.keys?.p256dh || !s.keys?.auth) return json({ error: "bad subscription" }, 400);
      const devs = (await this.devices()).filter((d) => d.endpoint !== s.endpoint);
      devs.push({ endpoint: s.endpoint, keys: s.keys, device: String(body.device ?? "device").slice(0, 60), addedAt: this.now() });
      await this.storage.put("devices", devs.slice(-8));
      return json({ ok: true, devices: devs.length });
    }
    if (path === "unsubscribe") {
      await this.storage.put("devices", (await this.devices()).filter((d) => d.endpoint !== body.endpoint));
      return json({ ok: true });
    }
    if (path === "schedule") {
      const items = (Array.isArray(body.reminders) ? body.reminders : []) as Reminder[];
      const clean = items
        .filter((r) => typeof r.at === "number" && r.at > this.now() - 60_000 && typeof r.title === "string")
        .map((r) => ({ at: r.at, title: r.title.slice(0, 80), body: String(r.body ?? "").slice(0, 200), url: String(r.url ?? "/").startsWith("/") ? String(r.url) : "/", tag: String(r.tag ?? "healthos").slice(0, 40) }))
        .sort((a, b) => a.at - b.at).slice(0, MAX_REMINDERS);
      await this.storage.put("reminders", clean);
      await this.rearm(clean);
      return json({ ok: true, next: clean[0]?.at ?? null, count: clean.length });
    }
    if (path === "test") {
      const devs = await this.broadcast({ title: "HealthOS · test", body: "Notifications work on this device.", url: "/#settings", tag: "test" });
      return json({ devices: devs.map(({ device, last }) => ({ device, last })) });
    }
    if (path === "status") {
      const devs = await this.devices(), rem = await this.reminders();
      return json({ devices: devs.map(({ device, addedAt, last, endpoint }) => ({ device, addedAt, last, endpoint })), next: rem.find((r) => r.at > this.now())?.at ?? null });
    }
    return json({ error: "not found" }, 404);
  }

  /** The alarm: send what's due (merged into one if several), drop what's stale, set the next alarm. */
  async alarm(): Promise<void> {
    const now = this.now(), list = await this.reminders();
    const due = list.filter((r) => r.at <= now + 30_000 && r.at > now - STALE_MS);
    const rest = list.filter((r) => r.at > now + 30_000);
    if (due.length === 1) await this.broadcast(due[0]);
    else if (due.length > 1) await this.broadcast({ title: due.map((d) => d.title).join(" · "), body: due.map((d) => d.body).join(" "), url: due[0].url, tag: "merged" });
    await this.storage.put("reminders", rest);
    await this.rearm(rest);
  }
}
