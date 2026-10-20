/**
 * Things you notice about yourself (PLAN 135; owner, 20 Oct: "a small text box where i can write things like I went
 * downstairs to do something, something else distracted me, came back up and realized i didnt do what i wanted. This
 * happens often. So basically mental and physical notices i see and realize. The app can make an understanding of this
 * and notice it for itself, for research purposes and to ask me about that, dive deep into it and see why that happens.
 * not like being my doctor but similar perhaps, and just informal").
 *
 * Each notice goes to the AI with what that day held up to that moment — last night's rating, caffeine so far, the last
 * check-in before it — so it can look for what they have in common and ask about it. Descriptive only: what was there,
 * never what caused it. Pure.
 */

import type { Entry } from "./types";
import { clock, dayLabel, localDay } from "./time";

export const NOTICE_DAYS = 30;

/** One line per notice of the last 30 days, newest last, each with that day up to that moment. */
export function noticeLines(entries: Entry[], now: number, days = NOTICE_DAYS): string[] {
  const from = now - days * 86_400_000;
  return entries.filter((e): e is Extract<Entry, { kind: "notice" }> => e.kind === "notice" && e.at >= from && e.at <= now).sort((a, b) => a.at - b.at).map((n) => {
    const day = localDay(n.at), before = entries.filter((e) => localDay(e.at) === day && e.at <= n.at);
    const caf = before.reduce((a, e) => a + (e.kind === "drink" ? e.caffeineMg : 0), 0);
    const sleep = before.find((e): e is Extract<Entry, { kind: "sleep" }> => e.kind === "sleep" && e.rating != null);
    const feel = [...before].reverse().find((e): e is Extract<Entry, { kind: "feel" }> => e.kind === "feel" && e.at < n.at);
    const rated = feel ? (["mood", "energy", "focus", "stress"] as const).filter((k) => feel[k] != null).map((k) => `${k} ${feel[k]}`).join(", ") : "";
    const with_ = [sleep ? `last night rated ${sleep.rating}/10` : "", `${caf} mg caffeine so far`, rated ? `last check-in ${clock(feel!.at)}: ${rated}` : ""].filter(Boolean).join("; ");
    return `${dayLabel(n.at)} ${clock(n.at)}: "${n.text}" (${with_})`;
  });
}
