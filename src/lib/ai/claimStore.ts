/** The day's read claimed on the server (lib/ai/claim says why). Apart from claim.ts so its tests need no database. */

import { supabase } from "../supabase";
import { deviceName, mayWrite, type Claim } from "./claim";

export function deviceId(): string {
  try {
    let id = localStorage.getItem("healthos.device");
    if (!id) { id = Math.random().toString(36).slice(2, 10); localStorage.setItem("healthos.device", id); }
    return id;
  } catch { return "unknown"; }
}
export const thisDevice = () => deviceName(typeof navigator === "undefined" ? "" : navigator.userAgent);

/**
 * Claim `task` for `day` — true: write it; false: another device is writing it. Offline or a refused write: true — a read
 * twice is better than none.
 */
export async function claimRead(task: "digest" | "night", day: string): Promise<boolean> {
  try {
    const { data: s } = await supabase.auth.getSession();
    const uid = s.session?.user.id;
    if (!uid) return true;
    const key = `claim:${task}:${day}`, me = deviceId(), now = Date.now(), mine: Claim = { device: me, at: now, name: thisDevice() };
    // one round trip in the usual case: nobody has claimed today's yet
    const { error } = await supabase.from("docs").insert([{ user_id: uid, key, value: mine }]);
    if (!error) return true;
    if (error.code !== "23505") return true;
    // claimed already: ours (a retry), another device's (wait for its read), or one so old its writing failed (take it)
    const got = await supabase.from("docs").select("value").eq("key", key).limit(1);
    const had = (got.data?.[0]?.value ?? null) as Claim | null;
    if (!mayWrite(had, me, now)) return false;
    if (had && had.device !== me) await supabase.from("docs").update({ value: mine }).eq("key", key);
    return true;
  } catch { return true; }
}
