/**
 * The app's side of the AI: send a request to the Worker with your session, keep the latest usage
 * (calls today, cost) for Settings, and build the context the AI is told — on demand, at call time.
 */

import { useSyncExternalStore } from "react";
import { supabase } from "../supabase";
import { getState, type State } from "../store";
import { dailyFacts } from "../insights";
import { notice } from "../findings";
import { scout } from "../scout";
import { bodyDays, weightTrend } from "../tdee";
import { addDays, localDay } from "../time";
import { buildContext } from "./context";
import type { AiAnswer, AiRequest, Task, UsageDoc } from "./tasks";

export type AiStatus = { on: boolean | null; usage: UsageDoc | null; cap: number; busy: number };
let status: AiStatus = { on: null, usage: null, cap: 50, busy: 0 };
const subs = new Set<() => void>();
const set = (p: Partial<AiStatus>) => { status = { ...status, ...p }; subs.forEach((f) => f()); };
export const useAiStatus = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => status);

const tz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return "Europe/Budapest"; } };
async function auth(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  return data.session ? { authorization: `Bearer ${data.session.access_token}` } : {};
}

export async function refreshAiStatus() {
  try {
    const r = await fetch(`/api/ai/usage?tz=${encodeURIComponent(tz())}`, { headers: await auth() });
    if (!r.ok) return set({ on: false });
    const b = (await r.json()) as { usage: UsageDoc; cap: number; on: boolean };
    set({ on: b.on, usage: b.usage, cap: b.cap });
  } catch { set({ on: false }); }
}

export type AiResult<T> = { ok: true; answer: T; costUsd: number } | { ok: false; error: string; message: string };

export async function askAi<T extends Task>(req: Extract<AiRequest, { task: T }>): Promise<AiResult<AiAnswer<T>>> {
  set({ busy: status.busy + 1 });
  try {
    const r = await fetch(`/api/ai?tz=${encodeURIComponent(tz())}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(await auth()) },
      body: JSON.stringify({ ...req, models: getState().ai.models }),
    });
    const b = (await r.json().catch(() => ({}))) as { answer?: AiAnswer<T>; usage?: UsageDoc; costUsd?: number; error?: string; message?: string };
    if (b.usage) set({ usage: b.usage });
    if (r.status === 503) set({ on: false });
    if (!r.ok || !b.answer) return { ok: false, error: b.error ?? String(r.status), message: b.message ?? b.error ?? "The AI couldn't answer right now." };
    set({ on: true });
    return { ok: true, answer: b.answer, costUsd: b.costUsd ?? 0 };
  } catch {
    return { ok: false, error: "network", message: "Couldn't reach the AI — are you online?" };
  } finally {
    set({ busy: Math.max(0, status.busy - 1) });
  }
}

/** The text the AI is told about you right now (also shown in Settings → AI → What the AI sees). */
export function contextNow(state: State = getState(), now = Date.now()): string {
  const today = localDay(now), from = addDays(today, -90), to = addDays(today, -1);
  const days = dailyFacts(state.entries, state.workouts, state.settings, from, to);
  const report = notice(state.entries, state.goals, now, state.settings.bodyKg, { workouts: state.workouts, supplements: state.supplements, settings: state.settings });
  const patterns = scout(days, state.supplements, (id) => !!state.scout[id]?.dismissed);
  const t = weightTrend(bodyDays(state.entries, addDays(today, -27), today));
  return buildContext({ state, now, days, findings: report.found, patterns, weight: t ? { kg: t.nowKg, perWeek: t.perDay * 7 } : null });
}

/** Downscale a photo to ≤1024 px JPEG before sending: cheaper, faster, and plenty to see a plate. */
export async function shrinkImage(file: File, max = 1024): Promise<{ mediaType: "image/jpeg"; data: string }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; });
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return { mediaType: "image/jpeg", data: c.toDataURL("image/jpeg", 0.8).split(",")[1] };
  } finally { URL.revokeObjectURL(url); }
}
