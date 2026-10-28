/**
 * Today: one ask at a time (owner, 28 Oct, review part 1: "one at a time", picked A on the canvas). Everything Today asks —
 * the stack when it's due, the morning read, a quick question, yesterday, cigarettes, the weigh-in, the two-week
 * check-in — comes in one card, in that order: the first that has something to ask is shown, the rest wait. A cycle you
 * step through both ways (owner, 28 Oct: "i should be able to cycle through it - rn i said skip to a couple items and they
 * disappeared"): Skip moves on and the skipped one comes round again, ‹ goes back; only a read's "Done" puts it away, and
 * "Done today: morning read ›" brings it back. "2 of 5": where you are among what's still open.
 * Each ask is its own component and says for itself whether it has anything (it renders nothing when it hasn't): the
 * card reads which ones rendered, so no ask's rules are copied here.
 */

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

export type Ask = { key: string; name: string; node: ReactNode; /** a read: "Done" instead of "Skip" */ read?: boolean };

/** `away`: reads marked Done (a skip used to land here too; those are ignored now and come back). `cur`: the ask on show. */
type Day = { day: string; seen: string[]; away: string[]; cur?: string };
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
  const isRead = (k: string) => asks.some((a) => a.key === k && a.read);
  const left = present.filter((k) => !(isRead(k) && st.away.includes(k)));
  // the ask on show: the one you left it on; once that's answered, the one after it in Today's order
  const order = asks.map((a) => a.key), after = st.cur ? order.slice(order.indexOf(st.cur) + 1) : [];
  const cur = st.cur && left.includes(st.cur) ? st.cur : (after.find((k) => left.includes(k)) ?? left[0]);
  const i = Math.max(0, left.indexOf(cur)), many = left.length > 1;
  const ask = asks.find((a) => a.key === cur), next = many ? asks.find((a) => a.key === left[(i + 1) % left.length]) : undefined;
  const put = (n: Day) => { setState(n); save(n); };
  const step = (d: 1 | -1) => put({ ...st, cur: left[(i + d + left.length) % left.length] });
  const done = (k: string) => put({ ...st, away: [...st.away, k], cur: many ? left[(i + 1) % left.length] : undefined, seen: st.seen.includes(k) ? st.seen : [...st.seen, k] });
  const back = (k: string) => put({ ...st, away: st.away.filter((x) => x !== k), cur: k });
  const reads = asks.filter((a) => a.read && st.away.includes(a.key) && present.includes(a.key));
  return (
    <section className="card fy" aria-label="For you" data-n={left.length} hidden={!left.length && !reads.length}>
      {cur && <div className="fy-top">
        <span className="fy-k">For you · {i + 1} of {left.length}</span>
        <span className="fy-dots" aria-hidden="true">{left.slice(0, 9).map((k, n) => <i key={k} data-on={n === i || undefined} />)}</span>
      </div>}
      <div className="fy-items" ref={box}>
        {asks.map((a) => <div key={a.key} className="fy-item" data-key={a.key} data-current={a.key === cur || undefined}>{a.node}</div>)}
      </div>
      {cur && ask && <div className="fy-foot">
        {many ? <button type="button" className="linkish fy-back" aria-label="Back to the one before" onClick={() => step(-1)}>‹ Back</button> : <span />}
        <span className="fy-next">{next ? `next: ${next.name}` : "the only one"}</span>
        {ask.read ? <button type="button" className="linkish fy-skip" onClick={() => done(cur)}>Done</button>
          : many ? <button type="button" className="linkish fy-skip" onClick={() => step(1)}>Skip ›</button> : <span />}
      </div>}
      {reads.length > 0 && <p className="fy-reads">Done today: {reads.map((a, i) => <span key={a.key}>{i ? " · " : ""}<button type="button" className="linkish" onClick={() => back(a.key)}>{a.name} ›</button></span>)}</p>}
    </section>
  );
}
