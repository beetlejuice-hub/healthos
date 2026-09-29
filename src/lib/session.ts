/**
 * Signed-in account → its own save slot → sync. One place so every screen can read who's signed
 * in and how sync is doing without prop-drilling.
 */

import { useEffect, useState, useSyncExternalStore } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, isTester } from "./supabase";
import { applyFromServer, getState, openStore, setRemote, storageKey } from "./store";
import { Syncer, type SyncStatus } from "./sync";

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
  syncer = new Syncer(supabase, userId, getState, applyFromServer, `${storageKey()}:sync`);
  syncer.onStatus((s) => { status = s; subs.forEach((l) => l()); });
  if (adopted) syncer.adoptLocal(getState());
  setRemote(syncer);
  void syncer.sync();
}

function stop() {
  setRemote(null);
  syncer = null;
}

export type Auth = { session: Session | null; ready: boolean; recovering: boolean; tester: boolean };

export function useAuth(): Auth & { doneRecovering: () => void } {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    let live = true;
    supabase.auth.getSession().then(({ data }) => {
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

  return { session, ready, recovering, tester: isTester(session?.user.email), doneRecovering: () => setRecovering(false) };
}

export async function signOut() {
  await syncer?.sync().catch(() => {});
  await supabase.auth.signOut();
  location.hash = "today";
  location.reload();
}
