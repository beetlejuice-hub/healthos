/**
 * Today: one ask at a time (owner, 28 Oct, review part 1: "one at a time", picked A on the canvas). Everything Today asks —
 * the stack when it's due, the morning read, a quick question, yesterday, cigarettes, the weigh-in, the two-week
 * check-in — comes in one card, in that order: the first that has something to ask is shown, the rest wait. "Skip" puts
 * one away for today; a read has "Done" instead. "1 of 6": what's been answered or put away today, and what's left.
 * Each ask is its own component and says for itself whether it has anything (it renders nothing when it hasn't): the
 * card reads which ones rendered, so no ask's rules are copied here.
 */

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

export type Ask = { key: string; name: string; node: ReactNode; /** a read: "Done" instead of "Skip" */ read?: boolean };

type Day = { day: string; seen: string[]; away: string[] };
const KEY = "healthos.foryou";
const load = (day: string): Day => {
  try { const d = JSON.parse(localStorage.getItem(KEY) ?? "null") as Day | null; if (d?.day === day) return d; } catch { /* blocked storage: today only, in memory */ }
  return { day, seen: [], away: [] };
};
const save = (d: Day) => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* blocked storage */ } };

export function ForYou({ asks, day }: { asks: Ask[]; day: string }) {
  const [state, setState] = useState<Day>(() => load(day));
  const st = state.day === day ? state : { day, seen: [], away: [] };
  const box = useRef<HTMLDivElement>(null), dayRef = useRef(day);
  useLayoutEffect(() => { dayRef.current = day; }, [day]);
  // which asks have something right now (their component rendered), read from the page — re-read whenever any of them
  // changes on its own (answering a question re-renders just that question); everything ever here today is "seen", so
  // what's gone since was answered
  const [present, setPresent] = useState<string[]>([]);
  useLayoutEffect(() => {
    const el = box.current; if (!el) return;
    const read = () => {
      const ks = [...el.querySelectorAll<HTMLElement>(":scope > .fy-item")].filter((x) => x.childElementCount > 0).map((x) => x.dataset.key!);
      setPresent((p) => (p.join() === ks.join() ? p : ks));
      setState((prev) => {
        const base = prev.day === dayRef.current ? prev : { day: dayRef.current, seen: [], away: [] };
        const add = ks.filter((k) => !base.seen.includes(k));
        if (!add.length) return base === prev ? prev : base;
        const n = { ...base, seen: [...base.seen, ...add] }; save(n); return n;
      });
    };
    read();
    const mo = new MutationObserver(read); mo.observe(el, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);
  const left = present.filter((k) => !st.away.includes(k));
  const done = st.seen.filter((k) => !left.includes(k)).length, total = done + left.length;
  const cur = left[0], ask = asks.find((a) => a.key === cur), next = asks.find((a) => a.key === left[1]);
  const away = (k: string) => { const n = { ...st, away: [...st.away, k], seen: st.seen.includes(k) ? st.seen : [...st.seen, k] }; setState(n); save(n); };
  const back = (k: string) => { const n = { ...st, away: st.away.filter((x) => x !== k) }; setState(n); save(n); };
  const reads = asks.filter((a) => a.read && st.away.includes(a.key) && present.includes(a.key));
  return (
    <section className="card fy" aria-label="For you" data-n={left.length} hidden={!left.length && !reads.length}>
      {cur && <div className="fy-top">
        <span className="fy-k">For you · {done + 1} of {total}</span>
        <span className="fy-dots" aria-hidden="true">{Array.from({ length: Math.min(total, 9) }, (_, i) => <i key={i} data-on={i === done || undefined} data-done={i < done || undefined} />)}</span>
      </div>}
      <div className="fy-items" ref={box}>
        {asks.map((a) => <div key={a.key} className="fy-item" data-key={a.key} data-current={a.key === cur || undefined}>{a.node}</div>)}
      </div>
      {cur && ask && <div className="fy-foot">
        <button type="button" className="linkish" onClick={() => away(cur)}>{ask.read ? "Done" : "Skip"}</button>
        <span>{next ? `next: ${next.name}` : "last one"}</span>
      </div>}
      {reads.length > 0 && <p className="fy-reads">Done today: {reads.map((a, i) => <span key={a.key}>{i ? " · " : ""}<button type="button" className="linkish" onClick={() => back(a.key)}>{a.name} ›</button></span>)}</p>}
    </section>
  );
}
