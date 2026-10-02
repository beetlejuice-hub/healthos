/**
 * Notifications, the phone's side: turn them on (permission, service worker, subscription), and keep
 * the server's reminder plan in step with what's logged (lib/push/plan.ts → /api/push/schedule).
 */

import { supabase } from "../supabase";
import { getState, subscribe as onStore } from "../store";
import { DEFAULT_NOTIFY, plan } from "./plan";

const ON_KEY = "healthos.push.on", SENT_KEY = "healthos.push.sent";

async function auth(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  return data.session ? { authorization: `Bearer ${data.session.access_token}` } : {};
}
async function api<T>(op: string, body?: unknown): Promise<T> {
  const r = await fetch(`/api/push/${op}`, { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json", ...(await auth()) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const j = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(j.error ?? `server answered ${r.status}`);
  return j;
}

const b64uToBytes = (s: string) => { const p = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4); const b = atob(p); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };

export type Support = "ok" | "unsupported" | "ios-home-screen" | "blocked";

/** Can this device get notifications? iPhone: only from the Home Screen app (iOS 16.4+). */
export function support(): Support {
  if (typeof window === "undefined") return "unsupported";
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone = matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (ios && !standalone) return "ios-home-screen";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  return "ok";
}

export function deviceName(ua = navigator.userAgent): string {
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "browser";
  return `${/Mac OS X/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : "Computer"} ${browser}`;
}

export const isOn = () => { try { return localStorage.getItem(ON_KEY) === "1" && Notification.permission === "granted"; } catch { return false; } };

/** Ask, register, subscribe, tell the server. Must run from a tap (browsers require it). */
export async function turnOn(): Promise<void> {
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error(perm === "denied" ? "Notifications are blocked for HealthOS in this browser's settings." : "Notifications weren't allowed.");
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const { publicKey } = await api<{ publicKey: string }>("key");
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(publicKey) });
  await api("subscribe", { subscription: sub.toJSON(), device: deviceName() });
  try { localStorage.setItem(ON_KEY, "1"); localStorage.removeItem(SENT_KEY); } catch { /* blocked storage */ }
  await syncPlan(true);
}

export async function turnOff(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  const sub = await reg?.pushManager.getSubscription();
  if (sub) { await api("unsubscribe", { endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe().catch(() => {}); }
  try { localStorage.removeItem(ON_KEY); localStorage.removeItem(SENT_KEY); } catch { /* blocked storage */ }
}

export type DeviceStatus = { device: string; addedAt?: number; last?: { at: number; status: number }; endpoint?: string };
export const sendTest = () => api<{ devices: DeviceStatus[] }>("test", {});
export const status = () => api<{ devices: DeviceStatus[]; next: number | null }>("status");

/** Send the current plan if it changed (or `force`). Only from a device with notifications on. */
export async function syncPlan(force = false): Promise<void> {
  if (!isOn()) return;
  const s = getState();
  const reminders = plan({ now: Date.now(), entries: s.entries, supplements: s.supplements, bedMinute: s.settings.bedMinute, prefs: s.settings.notify ?? DEFAULT_NOTIFY });
  const body = JSON.stringify(reminders);
  let last: string | null = null;
  try { last = localStorage.getItem(SENT_KEY); } catch { /* blocked storage */ }
  if (!force && body === last) return;
  await api("schedule", { reminders });
  try { localStorage.setItem(SENT_KEY, body); } catch { /* blocked storage */ }
}

let started = false;
/** Keep the plan in step: after changes (a few seconds later), when the app comes back, and every 30 min. */
export function startPlanner() {
  if (started || typeof window === "undefined") return;
  started = true;
  let t: ReturnType<typeof setTimeout> | null = null;
  const soon = () => { if (t) clearTimeout(t); t = setTimeout(() => void syncPlan().catch(() => {}), 3000); };
  onStore(soon);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") soon(); });
  setInterval(soon, 30 * 60_000);
  soon();
}
