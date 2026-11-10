/**
 * The game page, off Today's week card (PLAN 204; owner, 10 Nov, on the wilder canvas: "I fucking love the idea of all of
 * these … keep it professional too. keep the datas. keep the smart engine … easy the language, kepp it playful but
 * informal"). Your player card rated against the big studies, this week's boss, the race against your ghosts, the season,
 * the stake you put on the week and the treat you only get on gym days — then how it all works, with the studies.
 * Numbers from lib/play and lib/card (via components/useGame); this file only draws and saves your two picks.
 */

import { useState } from "react";
import { MOVES, type Card } from "../lib/card";
import { BOSSES, PLAY, standing, type Ghosts } from "../lib/play";
import { act, useStore } from "../lib/store";
import { addDays } from "../lib/time";
import { useGame } from "../components/useGame";

const STAKES = ["100 burpees on Sunday", "€10 to a cause you'd rather not fund", "No coffee on Monday"];
const short = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

function PlayerCard({ card, was, title, level }: { card: Card; was: Card; title: string | null; level: number }) {
  const moved = card.ovr != null && was.ovr != null ? card.ovr - was.ovr : null;
  return (
    <section className="gm-card" aria-label="Your player card" data-ovr={card.ovr ?? ""} data-tier={card.tier ?? ""}>
      <div className="gm-ovr">
        <div><b>{card.ovr ?? "—"}</b><span>{card.ovr != null ? `Overall · ${card.tier}` : "Overall · needs 3 stats"}</span></div>
        <div className="gm-ovr-r">
          {card.next && <span className="gm-tag">{card.next.name} at {card.next.at}</span>}
          {moved != null && <small className={moved > 0 ? "up" : moved < 0 ? "down" : undefined}>{moved > 0 ? `+${moved}` : moved < 0 ? `−${-moved}` : "same as"} 4 weeks ago</small>}
        </div>
      </div>
      <b className="gm-name">You <span>· {title ?? `level ${level}`}</span></b>
      <div className="gm-stats">
        {card.stats.map((s) => (
          <div key={s.key} data-stat={s.key} className={s.rating == null ? "none" : card.weakest?.key === s.key ? "low" : undefined}>
            <b>{s.rating ?? "—"}</b><span><em>{s.key}</em><small>{s.says}</small></span>
          </div>
        ))}
      </div>
      {card.weakest && MOVES[card.weakest.key] && <p className="gm-note">Weakest: <b>{card.weakest.word}</b> — {MOVES[card.weakest.key]}.</p>}
      <p className="gm-foot">Out of 99: where you'd stand against people in big studies — 67 is right at the average. Endurance is VO2 max against people your age; strength and discipline are you against you.</p>
    </section>
  );
}

/** The race: points kept by the end of each day, you against your ghosts. */
function Race({ g }: { g: Ghosts }) {
  const W = 340, H = 150, x = (i: number) => 22 + (i * (W - 60)) / 6, y = (v: number) => 12 + ((PLAY.start - v) / PLAY.start) * (H - 36);
  const line = (v: number[]) => v.map((p, i) => `${x(i)},${y(p)}`).join(" ");
  const i = g.you.length - 1;
  const say = g.vsLast == null ? "No last week to race yet — next week you'll have a ghost." : g.vsLast > 0 ? `${g.vsLast} ahead of last week's you` : g.vsLast < 0 ? `${-g.vsLast} behind last week's you` : "Level with last week's you";
  return (
    <section className="card gm-race" aria-label="The race">
      <h3>The race <span>points kept, day by day</span></h3>
      <b className="gm-big">{say}</b>
      {g.vsBest != null && g.bestFrom && <span className="gm-sub">{g.vsBest > 0 ? `${g.vsBest} ahead of` : g.vsBest < 0 ? `${-g.vsBest} behind` : "level with"} your best week (from {short(g.bestFrom)}, {g.bestPoints} kept)</span>}
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`You ${g.you[i] ?? 0} so far${g.last ? `, last week ${g.last[i]}` : ""}${g.best ? `, your best week ${g.best[i]}` : ""}`}>
        <line x1={x(0)} x2={x(6)} y1={y(PLAY.keep)} y2={y(PLAY.keep)} className="gm-keep" />
        <text x={x(6) + 4} y={y(PLAY.keep) + 4} className="gm-ax">50</text>
        {g.best && <polyline points={line(g.best)} className="gm-l best"><title>Your best week</title></polyline>}
        {g.last && <polyline points={line(g.last)} className="gm-l last"><title>Last week</title></polyline>}
        <polyline points={line(g.you)} className="gm-l you" />
        {i >= 0 && <circle cx={x(i)} cy={y(g.you[i])} r="5" className="gm-dot"><title>You: {g.you[i]}</title></circle>}
        {["M", "T", "W", "T", "F", "S", "S"].map((d, k) => <text key={k} x={x(k)} y={H - 4} className={`gm-ax${k === i ? " on" : ""}`} textAnchor="middle">{d}</text>)}
      </svg>
      <div className="gm-legend"><span><i className="you" />You</span>{g.last && <span><i className="last" />Last week</span>}{g.best && <span><i className="best" />Best week</span>}</div>
      <p className="gm-foot">A real rival — a friend racing their own goals — needs accounts that can see each other. Not yet.</p>
    </section>
  );
}

export function GameScreen() {
  const [now] = useState(() => Date.now());
  const { game, card, was } = useGame(now);
  const stakes = useStore((s) => s.settings.stakes), treat = useStore((s) => s.settings.treat);
  const [own, setOwn] = useState(""), [pick, setPick] = useState<string | null>(null), [treatText, setTreat] = useState(treat ?? "");
  if (!game) return (
    <div className="calm gm">
      <div className="head"><span>The game</span><a href="#today">Done</a></div>
      <div className="card"><p className="note">The game starts once the app has a few weeks of you to set goals from — log, wear the band, train, and it'll be here.</p></div>
    </div>
  );
  const { now: w, boss, season, level, titles } = game, mine = stakes?.[w.from];
  const bossGoal = boss ? w.goals.find((g) => g.id === boss.id) : null, bossCost = boss ? w.costs.find((c) => c.id === boss.id) : null;
  const lockStake = (what: string) => { if (what.trim()) act.setSettings({ stakes: { ...stakes, [w.from]: { what: what.trim() } } }); };
  return (
    <div className="calm gm">
      <div className="head"><span>The game</span><a href="#today">Done</a></div>

      <PlayerCard card={card} was={was} title={titles[0] ?? null} level={level.level} />

      {boss && (
        <section className="card gm-boss" aria-label="This week's boss" data-boss={boss.id} data-state={boss.state}>
          <h3>This week's boss <span>picked from your weakest goal last week</span></h3>
          <b className="gm-big">{boss.name}</b>
          <span className="gm-sub">Feeds on {boss.feeds}. {boss.state === "beaten" ? `Beaten — “${boss.title}” goes on your card.` : boss.state === "escaped" ? "It got away this week. Monday it's back." : `${bossGoal?.title} hits it${bossCost ? ` · ${standing(bossGoal!, bossCost).say}` : ""}.`}</span>
          <div className="gm-hp"><span>HP</span><span className="gm-hpbar" aria-hidden="true"><i style={{ width: `${boss.hp}%` }} /></span><b>{boss.hp}</b></div>
          {boss.next && <p className="gm-foot">Next up, once this one's down: {BOSSES[boss.next].name}.</p>}
        </section>
      )}

      <Race g={game.ghosts} />

      <section className="card gm-season" aria-label="The season" data-season={season.n} data-tier={season.tier}>
        <h3>Season {season.n} · {season.name} <span>{short(season.from)} – {short(season.to)}</span></h3>
        <span className="gm-sub">Week {season.week} of {PLAY.seasonWeeks}. The twist: {season.twist}. Next season changes the rules.</span>
        <div className="gm-tiers" aria-hidden="true">{Array.from({ length: PLAY.tiers }, (_, k) => <i key={k} className={k < season.tier ? "on" : undefined} />)}</div>
        <div className="gm-row"><span>Tier <b>{season.tier}</b> of {PLAY.tiers} · {season.xp} XP</span>{season.toNext != null && <span>{season.toNext} to the next</span>}</div>
        {season.nextReward && <p className="gm-note">Tier {season.nextReward.tier}: the title <b>“{season.nextReward.title}”</b>.</p>}
        {season.won.length > 0 && <p className="gm-foot">Won this season: {season.won.map((t) => `“${t}”`).join(", ")}.</p>}
      </section>

      <section className="card gm-stake" aria-label="Your stake">
        <h3>Put something on it <span>checked Sunday</span></h3>
        {mine?.what
          ? <><b className="gm-big">Under 50 → {mine.what}</b><span className="gm-sub">Locked in for this week. You've got {w.points} now.</span></>
          : <>
            <span className="gm-sub">Pick what you'll do if the week ends under 50. Once it's set, it's set.</span>
            <div className="gm-chips">{STAKES.map((s) => <button key={s} type="button" className="gm-pick" aria-pressed={pick === s} onClick={() => setPick(s)}>{s}</button>)}</div>
            <div className="gm-own"><input aria-label="Your own stake" placeholder="Or your own…" value={own} onChange={(e) => { setOwn(e.target.value); setPick(null); }} maxLength={80} />
              <button type="button" className="kbtn" disabled={!(pick || own.trim())} onClick={() => lockStake(pick ?? own)}>Lock it in</button></div>
          </>}
        <p className="gm-foot">People who put money on their goal did about twice as well as those who didn't (Halpern 2015).</p>
      </section>

      <section className="card gm-treat" aria-label="Only on gym days">
        <h3>Only on gym days <span>shown on Today when you've trained</span></h3>
        <span className="gm-sub">One thing you love that you only get after a session — a show, a podcast, a meal.</span>
        <div className="gm-own"><input aria-label="Your gym-day treat" placeholder="e.g. the next episode of your show" value={treatText} onChange={(e) => setTreat(e.target.value)} maxLength={80} />
          <button type="button" className="kbtn" disabled={treatText.trim() === (treat ?? "")} onClick={() => act.setSettings({ treat: treatText.trim() || undefined })}>Save</button></div>
        <p className="gm-foot">People who could only listen to their audiobook at the gym went 51 % more often (Milkman 2014).</p>
      </section>

      <details className="card gm-how">
        <summary>How it works</summary>
        <ul>
          <li><b>Your week:</b> you start with 70. Each goal has a few spare days; a miss past them costs 10, so does a drink over or a session that can't fit any more. Keep 50 by Sunday and you go up a level; under 50, down one. Losing points works better than earning them: 53 % of goal days against 32 % (BE FIT, Patel 2017).</li>
          <li><b>The goals</b> come from your own last 4 weeks, a notch past them — never a number from nowhere.</li>
          <li><b>The race:</b> you against last week's you and your best week. Competition beat support and teamwork, and kept working after the game stopped (STEP UP, Patel 2019).</li>
          <li><b>The boss</b> is your weakest goal from last week, with a name. A story pulls people out: Pokémon Go players walked about 1,500 more steps a day (Althoff 2016).</li>
          <li><b>Seasons</b> last 6 weeks and change the twist, starting on a fresh start (Dai 2014) — games wear off when they stop changing (Mazeas 2022).</li>
          <li><b>The card</b> rates you against big studies: VO2 max against people your age (HUNT), resting heart rate (92,457 Fitbit wearers), sleep (about 120,000), steps (717,527 people).</li>
        </ul>
        <p className="gm-foot">Week of {short(w.from)} – {short(addDays(w.from, 6))} · level {level.level} (best {level.best}).</p>
      </details>
    </div>
  );
}
