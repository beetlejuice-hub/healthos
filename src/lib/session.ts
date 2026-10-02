/**
 * Signed-in account → its own save slot → sync. One place so every screen can read who's signed
 * in and how sync is doing without prop-drilling.
 */

import { useEffect, useState, useSyncExternalStore } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, isTester } from "./supabase";
import { applyFromServer, getState, openStore, resetLocal, setRemote, storageKey } from "./store";
import { Syncer, type SyncStatus } from "./sync";
import { startPlanner } from "./push/client";

let syncer: Syncer | null = null;
let status: SyncStatus = { state: "idle", pending: 0, lastSync: null };
const subs = new Set<() => void>();

export const currentSyncer = () => syncer;
export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore((l) => { subs.add(l); return () => { subs.delete(l); }; }, () => status);
}

function start(userId: string) {
  if (syncer) return;
  const adopted = openStore(userId);
  syncer = new Syncer(supabase, userId, getState, applyFromServer, `${storageKey()}:sync`, resetLocal);
  syncer.onStatus((s) => { status = s; subs.forEach((l) => l()); });
  if (adopted) syncer.adoptLocal(getState());
  setRemote(syncer);
  void syncer.sync();
  startPlanner(); // keeps the reminder plan in step (does nothing until notifications are on here)
}

function stop() {
  setRemote(null);
  syncer = null;
}

export type Auth = { session: Session | null; ready: boolean; recovering: boolean; tester: boolean; notice: string | null };

/**
 * What an email link carried in the URL fragment, read once and then wiped from the address bar.
 * Returns the tokens only for a password reset.
 */
export function readEmailLink(hash: string): { kind: "recovery"; access_token: string; refresh_token: string } | { kind: "notice"; text: string } | null {
  if (!/access_token=|error_description=/.test(hash)) return null;
  const p = new URLSearchParams(hash.replace(/^#/, ""));
  if (p.get("error_description")) return { kind: "notice", text: p.get("error_description")!.replace(/\+/g, " ") };
  if (p.get("type") === "recovery" && p.get("access_token") && p.get("refresh_token")) {
    return { kind: "recovery", access_token: p.get("access_token")!, refresh_token: p.get("refresh_token")! };
  }
  return { kind: "notice", text: "Email confirmed. Sign in below." };
}

export function useAuth(): Auth & { doneRecovering: () => void } {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const link = readEmailLink(location.hash);
    if (link) history.replaceState(null, "", location.pathname + "#today");
    const boot = link?.kind === "recovery"
      ? supabase.auth.setSession({ access_token: link.access_token, refresh_token: link.refresh_token }).then(() => { if (live) setRecovering(true); })
      : Promise.resolve();
    if (link?.kind === "notice") setNotice(link.text);
    void boot.then(() => supabase.auth.getSession()).then(({ data }) => {
      if (!live) return;
      if (data.session) start(data.session.user.id);
      setSession(data.session); setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      if (s) start(s.user.id); else stop();
      setSession(s);
    });
    // Sync whenever the app comes back into view or the network returns, and once a minute.
    const kick = () => { if (document.visibilityState === "visible") void syncer?.sync(); };
    window.addEventListener("online", kick);
    document.addEventListener("visibilitychange", kick);
    const t = setInterval(kick, 60_000);
    return () => { live = false; sub.subscription.unsubscribe(); window.removeEventListener("online", kick); document.removeEventListener("visibilitychange", kick); clearInterval(t); };
  }, []);

  return { session, ready, recovering, notice, tester: isTester(session?.user.email), doneRecovering: () => setRecovering(false) };
}

export async function signOut() {
  await syncer?.sync().catch(() => {});
  // Only this device. The default ("global") would also sign the account out on your other devices.
  await supabase.auth.signOut({ scope: "local" });
  location.hash = "today";
  location.reload();
}
