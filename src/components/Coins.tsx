/**
 * Coin-flip experiments (PLAN 177, body lab 1; owner, 27 Oct: "like this"). On Today while one runs: today's coin, what
 * it says, and the one tap that keeps it honest (coffee is read from your log); yesterday asked if it wasn't answered;
 * the days so far, never tomorrow's coin; the result sealed till the end. On Insights → Body lab: start one, end one,
 * and the result — the app's test, numbers from lib/coin.
 */

import { useMemo } from "react";
import { useBand } from "../lib/band-client";
import { COIN, coinDays, coinOn, coinResult, coinToday, didOn, endOf, followEntry, newCoin, OUTCOME, presets, running, type Coin, type CoinResult, type Side } from "../lib/coin";
import { RESULT_WORDS } from "../lib/ai/experiment";
import { go } from "../lib/nav";
import { nights } from "../lib/sleep";
import { act, newId, offerUndo, useStore } from "../lib/store";
import { addDays, atMinute, dayLabel } from "../lib/time";
import type { Entry } from "../lib/types";

const SURE = { clear: "clear", likely: "likely", "not clear": "could still be chance", "too few": "too few days" } as const;
const dateWords = (day: string) => dayLabel(atMinute(day, 12 * 60)).replace(",", "");
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const setCoin = (id: string, f: (c: Coin) => Coin) => act.setAi((a) => ({ coins: (a.coins ?? []).map((c) => (c.id === id ? f(c) : c)) }));

/** Tap "followed" / "didn't" for a day: a supplement goes in the stack's log (it's the truth there), screens as your answer. */
function answer(c: Coin, day: string, side: Side) {
  const e = followEntry(c, day, side);
  if (e) { const x = act.addEntry(e); offerUndo([x.id], `${c.name}: ${side === "heads" ? "took it" : "skipped it"}`); return; }
  setCoin(c.id, (y) => ({ ...y, did: { ...y.did, [day]: side } }));
}

export function CoinCard({ now }: { now: number }) {
  const coins = useStore((s) => s.ai.coins), entries = useStore((s) => s.entries);
  // the coin's day runs to 04:00: at 00:30 it's still tonight's coin
  const today = coinToday(now);
  const c = (coins ?? []).find((x) => running(x, today));
  const done = (coins ?? []).find((x) => !running(x, today) && !x.seen && (x.ended ?? endOf(x)) <= today && (x.ended ?? endOf(x)) >= addDays(today, -7));
  if (c) return <Running c={c} today={today} entries={entries} now={now} />;
  if (done) return <Done c={done} today={today} />;
  return null;
}

function Running({ c, today, entries, now }: { c: Coin; today: string; entries: Entry[]; now: number }) {
  const side = coinOn(c, today)!, days = coinDays(c), i = days.findIndex((d) => d.day === today);
  const yday = addDays(today, -1), ySide = yday >= c.start ? coinOn(c, yday) : null;
  // yesterday unanswered: screens (no answer), or a supplement the coin said to take with nothing ticked
  const yAsk = ySide && ((c.kind === "screens" && !c.did?.[yday]) || (c.kind === "supp" && !entries.some((e) => e.kind === "supp" && e.suppId === c.suppId && coinToday(e.at) === yday)));
  const did = didOn(c, today, entries), todayAnswered = c.kind === "screens" ? !!c.did?.[today] : c.kind === "supp" ? entries.some((e) => e.kind === "supp" && e.suppId === c.suppId && coinToday(e.at) === today) : false;
  const say = side === "heads" ? c.heads : c.tails;
  return (
    <section className="card coin" role="region" aria-label="Today's coin" data-side={side}>
      <div className="coin-top">
        <svg width="56" height="56" viewBox="0 0 56 56" role="img" aria-label={`Coin: ${side}`} className="coin-face">
          <circle cx="28" cy="28" r="25" className="cf-o" /><circle cx="28" cy="28" r="19" className="cf-i" />
          <text x="28" y="36" textAnchor="middle">{side === "heads" ? "H" : "T"}</text>
        </svg>
        <div>
          <span className="k">Today's coin · day {i + 1} of {c.days}</span>
          <b className="coin-say">{side === "heads" ? "Heads" : "Tails"} — {lower(say)}</b>
        </div>
      </div>
      {/* the why, on the first two days; after that the two sides are enough */}
      <p className="coin-q">{i < 2 ? `${c.question} ` : ""}Heads: {lower(c.heads)} · tails: {lower(c.tails)}.{i < 2 ? " The coin decides, not you — so how the day went can't sway the answer." : ""}</p>
      {c.kind === "caffeine" ? (
        <p className="coin-log" data-did={did.side}>{did.side === "other" ? "Coffee after 16:00 today — this day won't count." : side === "heads" ? (did.side === "heads" ? (new Date(now).getHours() >= 13 ? "No coffee after 13:00 so far ✓" : "Read from your coffee log — nothing to tick.") : "Coffee after 13:00 logged — this day won't count.") : did.side === "tails" ? "Your 13:00–16:00 coffee is logged ✓" : "Log the coffee as usual when you have it, between 13:00 and 16:00."}</p>
      ) : todayAnswered ? (
        <p className="coin-log" data-did={did.side}>{did.side === side ? "Followed ✓" : "Didn't follow — this day won't count."} <button type="button" className="linkish" onClick={() => c.kind === "screens" ? setCoin(c.id, (y) => { const d = { ...y.did }; delete d[today]; return { ...y, did: d }; }) : go("log")}>change</button></p>
      ) : (
        <div className="cu-btns">
          {c.kind === "supp" ? <>
            <button type="button" className="pill-btn pri" onClick={() => answer(c, today, side)}>{side === "heads" ? "Took it" : "Skipped it"}</button>
            <button type="button" className="pill-btn" onClick={() => answer(c, today, side === "heads" ? "tails" : "heads")}>{side === "heads" ? "Didn't" : "Took it anyway"}</button>
          </> : <>
            <button type="button" className="pill-btn pri" onClick={() => answer(c, today, side)}>Followed the coin</button>
            <button type="button" className="pill-btn" onClick={() => answer(c, today, side === "heads" ? "tails" : "heads")}>Didn't</button>
          </>}
        </div>
      )}
      {yAsk && <div className="coin-y"><span>Yesterday · {ySide}: {lower(ySide === "heads" ? c.heads : c.tails)}?</span>
        <span className="cu-btns">
          <button type="button" className="pill-btn" onClick={() => answer(c, yday, ySide!)}>{c.kind === "supp" ? (ySide === "heads" ? "Took it" : "Skipped it") : "Yes"}</button>
          <button type="button" className="pill-btn" onClick={() => answer(c, yday, ySide === "heads" ? "tails" : "heads")}>{c.kind === "supp" ? (ySide === "heads" ? "Didn't" : "Took it") : "No"}</button>
        </span></div>}
      <div className="coin-days" role="img" aria-label={`Days so far: ${days.slice(0, i).map((d) => d.side).join(", ") || "none"}; today ${side}; ${c.days - i - 1} to go`}>
        {days.map((d, k) => {
          const past = k < i, kept = past ? didOn(c, d.day, entries).side === d.side : true;
          return <i key={d.day} className={k === i ? `today ${d.side}` : past ? `${d.side}${kept ? "" : " off"}` : "future"} title={past ? `${dateWords(d.day)}: ${d.side}${kept ? "" : " — not followed"}` : k === i ? `today: ${d.side}` : ""}>{k <= i ? (d.side === "heads" ? "H" : "T") : ""}</i>;
        })}
      </div>
      <p className="coin-seal"><b>Result sealed until {dateWords(endOf(c))}.</b> Peeking early would nudge you, so it stays shut.</p>
    </section>
  );
}

function Done({ c, today }: { c: Coin; today: string }) {
  const r = useCoinResult(c, today);
  const open = () => { setCoin(c.id, (y) => ({ ...y, seen: Date.now() })); go("insights", "lab"); };
  return (
    <section className="card coin" role="region" aria-label="Coin-flip result">
      <span className="k">Coin-flip · done</span>
      <b className="coin-say">{c.name}: {r?.verdict ? RESULT_WORDS[r.verdict] : "not enough days to tell"}</b>
      {r?.rows[0] && r.rows[0].diff != null && <p className="coin-q">{OUTCOME[r.rows[0].id].name}: {fmt(r.rows[0].heads!)} on heads days vs {fmt(r.rows[0].tails!)} on tails ({SURE[r.rows[0].sure]}).</p>}
      <button type="button" className="pill-btn" onClick={open}>See the result</button>
    </section>
  );
}

const fmt = (v: number) => (Math.abs(v) >= 20 ? String(Math.round(v)) : v.toFixed(1));
function useCoinResult(c: Coin | undefined, today: string): CoinResult | null {
  const band = useBand().data, entries = useStore((s) => s.entries);
  const ns = useMemo(() => (band ? nights(band.sleep, band.hr, band.rhr, band.hrv) : []), [band]);
  return useMemo(() => (c ? coinResult(c, ns, entries, today) : null), [c, ns, entries, today]);
}

/** Insights → Body lab: start one (one at a time), end it, the results. */
export function CoinLab({ now }: { now: number }) {
  const coins = useStore((s) => s.ai.coins) ?? [], supplements = useStore((s) => s.supplements);
  const today = coinToday(now), live = coins.find((c) => running(c, today));
  const ps = presets(supplements);
  const start = (p: (typeof ps)[number]) => act.setAi((a) => ({ coins: [...(a.coins ?? []), newCoin(p, newId(), today)] }));
  return (
    <section className="sl-p bl-card" aria-label="Coin-flip experiments" data-card="coins" id="coins">
      <span className="cmp-k">Coin-flip experiments</span>
      <h3>The coin picks each day, so how the day went can't decide the answer.</h3>
      {live ? <p className="bl-need" data-running={live.id}>{live.name}: day {coinDays(live).findIndex((d) => d.day === today) + 1} of {live.days} · result sealed until {dateWords(endOf(live))} · <button type="button" className="linkish" onClick={() => setCoin(live.id, (y) => ({ ...y, ended: today }))}>end early</button></p>
        : <div className="coin-start">
          {ps.map((p) => <button key={p.name} type="button" className="ibtn" onClick={() => start(p)}><b>{p.name}</b><span>{p.heads} vs {lower(p.tails)} · {COIN.days} days</span></button>)}
          <p className="bl-foot">Daily coins are for things that act the same night. Supplements that build up over weeks can't be tested a day at a time, so they aren't offered here.</p>
        </div>}
      {coins.filter((c) => c !== live).slice().reverse().map((c) => <Result key={c.id} c={c} today={today} />)}
    </section>
  );
}

function Result({ c, today }: { c: Coin; today: string }) {
  const r = useCoinResult(c, today);
  if (!r) return null;
  return (
    <div className="coin-res" data-coin={c.id} data-verdict={r.verdict ?? ""}>
      <p className="coin-res-h"><b>{c.name}</b> · {dateWords(c.start)} – {dateWords(addDays(c.ended && c.ended < endOf(c) ? c.ended : endOf(c), -1))}: <em>{r.verdict ? RESULT_WORDS[r.verdict] : c.ended && c.ended < endOf(c) ? "ended early — too few days to tell" : "not enough days to tell"}</em></p>
      {r.rows.length > 0 && <div className="bl-tab" role="table" aria-label={`${c.name}: heads days against tails days`}>
        <span role="row" className="hd"><span role="columnheader" /><span role="columnheader">heads</span><span role="columnheader">tails</span></span>
        {r.rows.map((x, k) => <span role="row" key={x.id} data-row={x.id} data-sure={x.sure}><span role="cell" className="nm">{OUTCOME[x.id].name}, {OUTCOME[x.id].unit.replace(/^\//, "out of ")}{k === 0 ? " (decides)" : ""}<em>{SURE[x.sure]}</em></span><b role="cell">{x.heads != null ? `${fmt(x.heads)}` : "–"}</b><span role="cell" className="v">{x.tails != null ? fmt(x.tails) : "–"}</span></span>)}
      </div>}
      <p className="bl-foot">heads: {lower(c.heads)} · tails: {lower(c.tails)} · {r.counted} days counted{r.broken ? ` · ${r.broken} not followed, left out` : ""}{r.assumed ? ` · ${r.assumed} not answered, counted as followed` : ""} · chance checked by re-dealing the coins {COIN.perms.toLocaleString("en-GB")} times <button type="button" className="linkish" onClick={() => act.setAi((a) => ({ coins: (a.coins ?? []).filter((y) => y.id !== c.id) }))}>remove</button></p>
    </div>
  );
}
