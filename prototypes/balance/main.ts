/**
 * The Balance prototype page. Plain DOM + SVG, no framework. Bundled into prototypes/balance.html by
 * build.ts, which also runs the bench race and bakes its results in.
 */

import { bodyDays, realBurn, type Burn } from "../../src/lib/tdee";
import { addDays, localDay } from "../../src/lib/time";
import type { Entry } from "../../src/lib/types";
import { balance, intakeFor, plan, type Balance } from "../../src/lib/balance/engine";
import { daysFor } from "../../src/lib/balance/race";
import { SCENARIOS, type ScenarioId } from "../../src/lib/balance/world";

type RaceRow = { id: string; label: string; app: { answered: number; mae: number; covered: number; n: number }; bal: { answered: number; mae: number; covered: number; n: number } };
declare const RACE: { rows: RaceRow[]; ages: { ago: number; app: RaceRow["app"]; bal: RaceRow["bal"] }[]; seeds: number; built: string };

const $ = <T extends HTMLElement>(s: string) => document.querySelector(s) as T;
const f0 = (v: number) => Math.round(v).toLocaleString("en-GB");
const r10 = (v: number) => f0(Math.round(v / 10) * 10);
const kg1 = (v: number) => v.toFixed(1);
const sgn = (v: number, d = 2) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(d)}`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "June", "July", "Aug", "Sept", "Oct", "Nov", "Dec"];
const dlabel = (day: string) => { const [, m, d] = day.split("-").map(Number); return `${d} ${MONTHS[m - 1]}`; };
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

type View = {
  title: string; blurb: string;
  days: ReturnType<typeof daysFor>["days"];
  bal: Balance | null; app: Burn | null; appFrom: number;
  truth: { burn: number[]; kg: number[] } | null;
  today: string;
};

let state: { id: ScenarioId | "mine"; seed: number; mine: Entry[] | null } = { id: "weekends", seed: 4, mine: null };

function scenarioView(id: ScenarioId, seed: number): View {
  const { days, truth } = daysFor(id, seed);
  const span = Math.min(28, days.length);
  return {
    title: SCENARIOS[id].label, blurb: SCENARIOS[id].blurb, days, bal: balance(days),
    app: realBurn(days.slice(-span)), appFrom: days.length - span, truth, today: days[days.length - 1].day,
  };
}

function mineView(entries: Entry[]): View {
  const today = localDay(Date.now());
  const ats = entries.filter((e) => e.kind === "food" || e.kind === "weight").map((e) => e.at);
  const first = ats.length ? localDay(Math.min(...ats)) : today;
  const from = first < addDays(today, -365) ? addDays(today, -365) : first;
  const days = bodyDays(entries, from, today);
  days[days.length - 1] = { ...days[days.length - 1], kcal: null };
  const span = Math.min(28, days.length);
  return {
    title: "Your export", blurb: `${days.filter((d) => d.kcal != null).length} logged days and ${days.filter((d) => d.kg != null).length} weigh-ins since ${dlabel(from)}. Nothing leaves this page.`,
    days, bal: balance(days), app: realBurn(days.slice(-span)), appFrom: days.length - span, truth: null, today,
  };
}

/* ───────────── the ruler: the burn and its range, drawn to scale ───────────── */

function ruler(v: View) {
  const b = v.bal!, t = v.truth?.burn[v.truth.burn.length - 1];
  const vals = [b.lo, b.hi, ...(v.app ? [v.app.lo, v.app.hi] : []), ...(t != null ? [t] : [])];
  const lo = Math.floor((Math.min(...vals) - 150) / 100) * 100, hi = Math.ceil((Math.max(...vals) + 150) / 100) * 100;
  const W = 640, x = (k: number) => 16 + ((k - lo) / (hi - lo)) * (W - 32);
  let ticks = "";
  for (let k = lo; k <= hi; k += 50) {
    const major = k % 200 === 0;
    ticks += `<line x1="${x(k)}" x2="${x(k)}" y1="58" y2="${major ? 70 : 64}" class="tick${major ? " major" : ""}"/>`;
    if (major) ticks += `<text x="${x(k)}" y="86" class="tl">${f0(k)}</text>`;
  }
  const appRow = v.app
    ? `<rect x="${x(v.app.lo)}" y="100" width="${x(v.app.hi) - x(v.app.lo)}" height="10" class="app-band"/><line x1="${x(v.app.kcal)}" x2="${x(v.app.kcal)}" y1="96" y2="114" class="app-mark"/>`
    : `<text x="${W / 2}" y="110" class="tl muted">current engine: no answer yet</text>`;
  const truth = t != null ? `<line x1="${x(t)}" x2="${x(t)}" y1="6" y2="118" class="truth"/><text x="${x(t)}" y="132" class="tl truth-t">truth ${f0(t)}</text>` : "";
  return `<svg viewBox="0 0 ${W} 140" class="ruler" role="img" aria-label="Burn ${r10(b.burn)} kcal a day, 90% range ${r10(b.lo)} to ${r10(b.hi)}">
    <rect x="${x(b.lo)}" y="22" width="${x(b.hi) - x(b.lo)}" height="26" rx="2" class="bal-band"/>
    <line x1="${x(b.burn)}" x2="${x(b.burn)}" y1="14" y2="56" class="bal-mark"/>
    <line x1="16" x2="${W - 16}" y1="58" y2="58" class="axis"/>${ticks}${appRow}${truth}
  </svg>`;
}

/* ───────────── charts ───────────── */

type Pt = [number, number];
const path = (pts: Pt[]) => pts.map(([a, b], i) => `${i ? "L" : "M"}${a.toFixed(1)},${b.toFixed(1)}`).join("");
const area = (top: Pt[], bot: Pt[]) => `${path(top)}L${[...bot].reverse().map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join("L")}Z`;

function frame(n: number, lo: number, hi: number, H: number) {
  const W = 640, L = 46, R = 12, T = 12, B = 26;
  const x = (i: number) => L + (n <= 1 ? 0 : (i / (n - 1)) * (W - L - R));
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  return { W, H, L, R, T, B, x, y };
}

function niceStep(span: number, target: number) {
  const raw = span / target, p = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw)!;
}

function grid(f: ReturnType<typeof frame>, lo: number, hi: number, days: string[], fmt: (v: number) => string, ticks = 4) {
  const st = niceStep(hi - lo, ticks);
  let g = "";
  for (let v = Math.ceil(lo / st) * st; v <= hi + 1e-9; v += st) g += `<line x1="${f.L}" x2="${f.W - f.R}" y1="${f.y(v)}" y2="${f.y(v)}" class="grid"/><text x="${f.L - 6}" y="${f.y(v) + 4}" class="yl">${fmt(v)}</text>`;
  const every = days.length > 60 ? 14 : days.length > 20 ? 7 : 2;
  days.forEach((d, i) => { if ((days.length - 1 - i) % every === 0) g += `<text x="${f.x(i)}" y="${f.H - 8}" class="xl">${dlabel(d)}</text>`; });
  return g;
}

function weightChart(v: View) {
  const b = v.bal!, n = v.days.length;
  const ok = b.days.filter((d) => d.scale != null && d.outlier !== "typo").map((d) => d.scale!);
  const vals = [...ok, ...b.days.flatMap((d) => [d.kg - 1.645 * d.kgSd, d.kg + 1.645 * d.kgSd]), ...(v.truth?.kg ?? [])];
  const lo = Math.min(...vals) - 0.2, hi = Math.max(...vals) + 0.2;
  const f = frame(n, lo, hi, 230);
  const top = b.days.map((d, i): Pt => [f.x(i), f.y(d.kg + 1.645 * d.kgSd)]), bot = b.days.map((d, i): Pt => [f.x(i), f.y(d.kg - 1.645 * d.kgSd)]);
  let marks = "";
  b.days.forEach((d, i) => {
    if (d.scale == null) return;
    if (d.outlier === "typo") marks += `<g class="typo"><path d="M${f.x(i) - 4},${f.H - f.B - 8}l8,8M${f.x(i) + 4},${f.H - f.B - 8}l-8,8"/><title>${dlabel(d.day)}: ${kg1(d.scale)} kg, set aside</title></g>`;
    else marks += `<circle cx="${f.x(i)}" cy="${f.y(d.scale)}" r="2.6" class="dot${d.outlier ? " soft" : ""}"><title>${dlabel(d.day)}: ${kg1(d.scale)} kg</title></circle>`;
  });
  const truth = v.truth ? `<path d="${path(v.truth.kg.map((k, i): Pt => [f.x(i), f.y(k)]))}" class="truth"/>` : "";
  const app = v.app ? `<path d="${path(v.app.trend.fit.map(([i, k]): Pt => [f.x(i + v.appFrom), f.y(k)]))}" class="app-line"/>` : "";
  return `<svg viewBox="0 0 ${f.W} ${f.H}" class="chart" role="img" aria-label="Weight: scale readings and real weight">
    ${grid(f, lo, hi, v.days.map((d) => d.day), (k) => k.toFixed(k % 1 ? 1 : 0))}
    <path d="${area(top, bot)}" class="bal-area"/>${truth}${app}${marks}
    <path d="${path(b.days.map((d, i): Pt => [f.x(i), f.y(d.kg)]))}" class="bal-line"/>
  </svg>`;
}

function burnChart(v: View) {
  const b = v.bal!, n = v.days.length;
  const show = b.days.map((d, i) => ({ ...d, i })).filter((d) => d.i >= Math.min(6, n - 1));
  const vals = [...show.flatMap((d) => [d.burn - 1.645 * d.burnSd, d.burn + 1.645 * d.burnSd]), ...(v.truth?.burn ?? []), ...(v.app ? [v.app.lo, v.app.hi] : [])];
  const lo = Math.max(0, Math.min(...vals) - 60), hi = Math.max(...vals) + 60;
  const f = frame(n, lo, hi, 210);
  const top = show.map((d): Pt => [f.x(d.i), f.y(d.burn + 1.645 * d.burnSd)]), bot = show.map((d): Pt => [f.x(d.i), f.y(d.burn - 1.645 * d.burnSd)]);
  const truth = v.truth ? `<path d="${path(v.truth.burn.map((k, i): Pt => [f.x(i), f.y(k)]))}" class="truth"/>` : "";
  const app = v.app ? `<rect x="${f.x(v.appFrom)}" y="${f.y(v.app.hi)}" width="${f.x(n - 1) - f.x(v.appFrom)}" height="${f.y(v.app.lo) - f.y(v.app.hi)}" class="app-band"/><line x1="${f.x(v.appFrom)}" x2="${f.x(n - 1)}" y1="${f.y(v.app.kcal)}" y2="${f.y(v.app.kcal)}" class="app-line"/>` : "";
  // Food strip: what each day's intake was based on.
  const sy = f.H - f.B + 2;
  const strip = b.days.slice(0, -1).map((d, i) => `<rect x="${f.x(i) - 1.6}" y="${sy}" width="3.2" height="5" class="food ${d.kind}"/>`).join("");
  return `<svg viewBox="0 0 ${f.W} ${f.H + 8}" class="chart" role="img" aria-label="Burn per day with its 90% range">
    ${grid({ ...f, H: f.H + 8 }, lo, hi, v.days.map((d) => d.day), (k) => f0(k))}
    ${app}<path d="${area(top, bot)}" class="bal-area"/>${truth}
    <path d="${path(show.map((d): Pt => [f.x(d.i), f.y(d.burn)]))}" class="bal-line"/>${strip}
  </svg>`;
}

/* ───────────── words ───────────── */

function sentences(v: View): string[] {
  const b = v.bal!, out: string[] = [];
  const last = b.days[b.days.length - 1];
  if (last.scale != null && last.outlier !== "typo" && Math.abs(b.water) >= 0.2)
    out.push(`Real weight today <b>${kg1(b.kg)} kg</b>. This morning's ${kg1(last.scale)} has <b>${sgn(b.water, 1)} kg</b> of water ${b.water > 0 ? "on" : "off"} it, so ignore the scale for a day.`);
  else out.push(`Real weight today <b>${kg1(b.kg)} kg</b> (±${(1.645 * b.kgSd).toFixed(1)}).`);
  if (b.step) out.push(`Your burn stepped <b>${b.step.kcal < 0 ? "down" : "up"} about ${r10(Math.abs(b.step.kcal))} kcal</b> around ${dlabel(b.step.day)} (${Math.round(b.step.prob * 100)}% sure). The days before that are left out of today's number.`);
  else if (b.change && b.change.clear) out.push(`Your burn has moved <b>${sgn(b.change.kcal, 0)} kcal</b> since ${dlabel(b.change.from)}.`);
  else if (b.days.length >= 35) out.push(`No sign your burn has changed in the last ${b.days.length} days.`);
  if (b.unlogged) {
    const lo = b.unlogged.kcal - 1.645 * b.unlogged.sd, hi = b.unlogged.kcal + 1.645 * b.unlogged.sd;
    out.push(lo > b.usual
      ? `The ${b.unlogged.n} days you didn't fully log look like about <b>${r10(b.unlogged.kcal)} kcal</b> (90%: ${r10(lo)}–${r10(hi)}), more than the ${r10(b.usual)} on days you do. Your weight shows it.`
      : `The ${b.unlogged.n} days you didn't fully log look like about ${r10(b.unlogged.kcal)} kcal (90%: ${r10(Math.max(0, lo))}–${r10(hi)}). Can't tell yet if they're bigger than your logged days (${r10(b.usual)}).`);
  }
  if (b.dropped || b.softened) out.push(`${b.dropped ? `${b.dropped} weigh-in${b.dropped > 1 ? "s" : ""} set aside as a typo or clothes` : ""}${b.dropped && b.softened ? "; " : ""}${b.softened ? `${b.softened} odd one${b.softened > 1 ? "s" : ""} trusted less` : ""}.`);
  if (b.daysToTight) {
    const when = (d: number) => (d === Infinity ? "not within 4 months" : `by ${dlabel(addDays(v.today, d))}`);
    out.push(b.daysToTight.everyDay < b.daysToTight.asNow - 3
      ? `Log food every day and the range shrinks to ±100 <b>${when(b.daysToTight.everyDay)}</b>. At your current rate, ${when(b.daysToTight.asNow)}.`
      : `Keep this up and the range shrinks to ±100 <b>${when(b.daysToTight.asNow)}</b>.`);
  } else out.push("The range is already within ±100 kcal.");
  const L = b.learned;
  out.push(`Learned from your scale: water swings about ±${L.waterKg.toFixed(1)} kg and ${L.settleDays < 1 ? "is gone by the next morning" : `takes ~${Math.round(L.settleDays)} day${Math.round(L.settleDays) > 1 ? "s" : ""} to halve`}.`);
  return out;
}

/* ───────────── page ───────────── */

function render() {
  const v = state.id === "mine" ? mineView(state.mine!) : scenarioView(state.id, state.seed);
  document.querySelectorAll<HTMLButtonElement>(".chips button").forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.id === state.id)));
  $("#blurb").innerHTML = `${esc(v.blurb)}${v.truth ? ` <span class="muted">Fake person #${state.seed}.</span>` : ""}`;
  $("#another").hidden = state.id === "mine";
  const out = $("#out");
  if (!v.bal) {
    out.innerHTML = `<section class="readout"><p class="eyebrow">Real burn</p><p class="big muted">Not yet</p><p>Balance needs 3 logged days and 3 weigh-ins spread over a week.</p></section>`;
    return;
  }
  const b = v.bal, t = v.truth?.burn[v.truth.burn.length - 1];
  const err = (k: number) => (t == null ? "" : `<span class="err">${Math.abs(k - t) < 1 ? "spot on" : `${f0(Math.abs(k - t))} off`}</span>`);
  const inside = (lo: number, hi: number) => (t == null ? "" : t >= lo && t <= hi ? `<span class="pill ok">truth inside</span>` : `<span class="pill bad">truth outside</span>`);
  out.innerHTML = `
    <section class="readout">
      <p class="eyebrow">Real burn · ${dlabel(v.today)}</p>
      <p class="big"><span class="num">${r10(b.burn)}</span><span class="unit">kcal / day</span></p>
      <p class="range">90% range <b class="num">${r10(b.lo)}–${r10(b.hi)}</b> ${inside(b.lo, b.hi)} ${err(b.burn)}</p>
      ${ruler(v)}
      <dl class="vs">
        <div><dt><i class="sw bal"></i>Balance</dt><dd class="num">${r10(b.burn)} <small>${r10(b.lo)}–${r10(b.hi)}</small></dd></div>
        <div><dt><i class="sw app"></i>Current engine</dt><dd class="num">${v.app ? `${r10(v.app.kcal)} <small>${r10(v.app.lo)}–${r10(v.app.hi)}</small> ${inside(v.app.lo, v.app.hi)} ${err(v.app.kcal)}` : `<span class="muted">needs 14 food days, 8 weigh-ins</span>`}</dd></div>
        ${t != null ? `<div><dt><i class="sw truth"></i>Truth</dt><dd class="num">${f0(t)}</dd></div>` : ""}
      </dl>
    </section>
    <section class="words"><h2>What it sees</h2><ul>${sentences(v).map((s) => `<li>${s}</li>`).join("")}</ul></section>
    <section class="panel"><h2>Weight</h2><p class="cap"><i class="sw dotk"></i>scale · <i class="sw bal"></i>real weight, 90% band${v.app ? ` · <i class="sw app"></i>current engine's line` : ""}${v.truth ? ` · <i class="sw truth"></i>truth` : ""}</p><div class="scroll">${weightChart(v)}</div></section>
    <section class="panel"><h2>Burn, day by day</h2><p class="cap"><i class="sw bal"></i>Balance, 90% band${v.app ? ` · <i class="sw app"></i>current engine (one number for its 28 days)` : ""}${v.truth ? ` · <i class="sw truth"></i>truth` : ""} · strip: <i class="sw f-logged"></i>logged <i class="sw f-partial"></i>partly <i class="sw f-unlogged"></i>not logged</p><div class="scroll">${burnChart(v)}</div></section>
    <section class="panel plan">
      <h2>If you eat…</h2>
      <label for="intake" class="num" id="intake-l"></label>
      <input type="range" id="intake" min="1500" max="4200" step="50" value="${Math.round(b.usual / 50) * 50}">
      <p id="plan-out"></p>
    </section>`;
  const slider = $("#intake") as HTMLInputElement as unknown as HTMLInputElement;
  const upd = () => {
    const k = Number(slider.value), p = plan(b, k);
    $("#intake-l").textContent = `${f0(k)} kcal a day`;
    const word = Math.abs(p.kgPerWeek) < 0.05 ? "Holds you steady:" : p.kgPerWeek < 0 ? "You lose" : "You gain";
    $("#plan-out").innerHTML = `${word} <b class="num">${sgn(p.kgPerWeek)} kg a week</b> <span class="muted num">(90%: ${sgn(p.lo)} to ${sgn(p.hi)})</span>. In four weeks: <b class="num">${kg1(b.kg + p.kgPerWeek * 4)} kg</b>. For −0.5 kg a week, eat about <b class="num">${r10(intakeFor(b, -0.5))}</b>.`;
  };
  slider.addEventListener("input", upd); upd();
}

function raceTable() {
  const cell = (s: RaceRow["app"]) => s.answered === 0 ? `<td class="muted">no answer</td><td></td>` :
    `<td class="num">${f0(s.mae)}${s.answered < s.n ? ` <small class="muted">(${s.answered}/${s.n} answered)</small>` : ""}</td><td class="num ${s.covered < 0.8 ? "warn" : ""}">${Math.round(s.covered * 100)}%</td>`;
  const win = (r: RaceRow) => (r.app.answered === 0 || r.bal.mae < r.app.mae - 10 ? "bal" : r.app.mae < r.bal.mae - 10 ? "app" : "tie");
  $("#race").innerHTML = `
    <table><thead><tr><th>Fake person</th><th colspan="2">Current engine<br><small>kcal off · truth in 90%</small></th><th colspan="2">Balance<br><small>kcal off · truth in 90%</small></th></tr></thead>
    <tbody>${RACE.rows.map((r) => `<tr class="${win(r)}"><th>${r.label}</th>${cell(r.app)}${cell(r.bal)}</tr>`).join("")}
    <tr class="sub"><th colspan="5">A burn that drops 300 kcal, by how long ago</th></tr>
    ${RACE.ages.map((a) => { const r = { ...a, id: "", label: `${a.ago} days ago` }; return `<tr class="${win(r)}"><th>${r.label}</th>${cell(a.app)}${cell(a.bal)}</tr>`; }).join("")}
    </tbody></table>
    <p class="cap">${RACE.seeds} fake people per row, average miss in kcal/day. A 90% range should hold the truth about 90% of the time; much less means the app is overconfident. Built ${RACE.built}.</p>`;
}

function boot() {
  const chips = $(".chips");
  chips.innerHTML = (Object.keys(SCENARIOS) as ScenarioId[]).map((id) => `<button type="button" data-id="${id}">${SCENARIOS[id].label}</button>`).join("") + `<button type="button" data-id="mine" id="mine-chip" hidden>Your export</button>`;
  chips.addEventListener("click", (e) => {
    const id = (e.target as HTMLElement).closest("button")?.dataset.id;
    if (!id) return;
    state = { ...state, id: id as ScenarioId | "mine" };
    render();
  });
  $("#another").addEventListener("click", () => { state.seed = (state.seed % 60) + 1; render(); });
  const file = $("#file") as HTMLInputElement;
  file.addEventListener("change", async () => {
    const f = file.files?.[0];
    if (!f) return;
    try {
      const json = JSON.parse(await f.text());
      const entries: Entry[] = Array.isArray(json) ? json : json.entries;
      if (!Array.isArray(entries)) throw new Error("no entries");
      state = { ...state, id: "mine", mine: entries };
      $("#mine-chip").hidden = false;
      $("#file-msg").textContent = "";
      render();
    } catch {
      $("#file-msg").textContent = "That file isn't a HealthOS export. In the app: Settings → Export, then pick the .json it saves.";
    }
  });
  raceTable();
  render();
}

boot();
