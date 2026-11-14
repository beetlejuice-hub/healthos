/**
 * The lock-screen widget, the app's side (item 10, 14 Nov): its key, and the snapshot left on the server while the app is
 * open (lib/widget) — sent only once a widget key exists, when what it says changed, else every 30 minutes.
 */

import { supabase } from "./supabase";
import type { WidgetSnap } from "./widget";

async function api<T>(op: string, body?: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const r = await fetch(`/api/widget/${op}`, { method: "POST", headers: { "content-type": "application/json", ...(data.session ? { authorization: `Bearer ${data.session.access_token}` } : {}) }, body: JSON.stringify(body ?? {}) });
  const j = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(j.error ?? `server answered ${r.status}`);
  return j;
}

/** A new key (the old widget's stops working) and the URL the script asks. */
export const newWidgetKey = () => api<{ key: string; url: string }>("key");

/** Unchanged, it's sent again this often, so the widget's "app opened … ago" stays true. */
const AGAIN_MS = 30 * 60_000;
let lastBody = "", lastAt = 0;
/** Leave the snapshot on the server when what it says changed (its "made at" aside), or every 30 minutes. Offline: next time. */
export async function sendWidget(s: WidgetSnap, now = Date.now()): Promise<void> {
  const body = JSON.stringify({ ...s, at: 0 });
  if (body === lastBody && now - lastAt < AGAIN_MS) return;
  try { await api("snap", s); lastBody = body; lastAt = now; } catch { /* offline: next time */ }
}
