/** Caffeine Clock prototype page. Plain DOM + SVG; bundled into prototypes/caffeine.html by build.ts. */

import { clock, day, HALF_LIFE, inGut, lastCall, level, likeA, SLEEP_GUARD_MIN, type Day, type Drink, type Form } from "../../src/lib/caffclock/engine";

const $ = <T extends Element = HTMLElement>(s: string) => document.querySelector(s) as T;
const NS = "http://www.w3.org/2000/svg";
const TARGET = 50, WAKE = 7 * 60, FROM = 5 * 60, TO = 29 * 60;
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

type Kind = { key: string; name: string; mg: number; form: Form; sipMin?: number; withFood?: boolean; glyph: string };
const MENU: Kind[] = [
  { key: "espresso", name: "Espresso", mg: 63, form: "shot", glyph: "E" },
  { key: "double", name: "Double espresso", mg: 126, form: "shot", glyph: "D" },
  { key: "filter", name: "Filter coffee", mg: 95, form: "cup", glyph: "F" },
  { key: "latte", name: "Latte", mg: 63, form: "cup", withFood: true, glyph: "L" },
  { key: "redbull", name: "Red Bull", mg: 80, form: "can", sipMin: 20, glyph: "R" },
  { key: "monster", name: "Monster 500", mg: 160, form: "can", sipMin: 60, glyph: "M" },
];
const kind = (k: string) => MENU.find((m) => m.key === k)!;
let uid = 0;
const make = (k: string, at: number): Drink & { key: string } => { const m = kind(k); return { id: `d${uid++}`, key: k, name: m.name, at, mg: m.mg, form: m.form, sipMin: m.sipMin, withFood: m.withFood }; };

const state = {
  drinks: [make("double", 7 * 60 + 50), make("latte", 10 * 60 + 30)] as (Drink & { key: string })[],
  now: 12 * 60 + 20,
  scrub: 12 * 60 + 20,
  bed: 23 * 60,
  preview: null as string | null,
};

/* ── geometry ─────────────────────────────────────────── */
const C = 220, R0 = 108, R1 = 176, RT = 186, RL = 204;
const ang = (min: number) => ((min % 1440) / 1440) * Math.PI * 2 - Math.PI / 2;
const pt = (min: number, r: number): [number, number] => [C + r * Math.cos(ang(min)), C + r * Math.sin(ang(min))];
const f = (n: number) => n.toFixed(1);
let SCALE = 200;
const rad = (mg: number) => R0 + Math.min(1.08, mg / SCALE) * (R1 - R0);

/** Closed band between two radius functions over the curve's minutes. */
function ring(ts: number[], outer: (i: number) => number, inner: (i: number) => number) {
  const o = ts.map((t, i) => pt(t, outer(i))), n = ts.map((t, i) => pt(t, inner(i))).reverse();
  return `M${o.map(([x, y]) => `${f(x)},${f(y)}`).join("L")}L${n.map(([x, y]) => `${f(x)},${f(y)}`).join("L")}Z`;
}
const line = (ts: number[], r: (i: number) => number) => `M${ts.map((t, i) => pt(t, r(i)).map(f).join(",")).join("L")}`;
function arc(a: number, b: number, r: number) {
  const [x0, y0] = pt(a, r), [x1, y1] = pt(b, r), large = ((b - a + 1440) % 1440) > 720 ? 1 : 0;
  return `M${f(x0)},${f(y0)}A${r},${r} 0 ${large} 1 ${f(x1)},${f(y1)}`;
}
function wedge(a: number, b: number, r0: number, r1: number) {
  const [x0, y0] = pt(a, r1), [x1, y1] = pt(b, r1), [x2, y2] = pt(b, r0), [x3, y3] = pt(a, r0), large = ((b - a + 1440) % 1440) > 720 ? 1 : 0;
  return `M${f(x0)},${f(y0)}A${r1},${r1} 0 ${large} 1 ${f(x1)},${f(y1)}L${f(x2)},${f(y2)}A${r0},${r0} 0 ${large} 0 ${f(x3)},${f(y3)}Z`;
}

/* ── the dial ─────────────────────────────────────────── */
function dial(d: Day, ghost: Day | null) {
  const ts = d.curve.map((p) => p.t);
  const top = Math.max(...d.curve.map((p) => p.hi), ghost ? Math.max(...ghost.curve.map((p) => p.mg)) : 0, TARGET * 1.6);
  SCALE = Math.ceil(top / 50) * 50;

  // Stacked layers, one per drink, separated by a hairline of background.
  let cum = ts.map(() => 0), layers = "";
  state.drinks.forEach((dr, k) => {
    const next = cum.map((c, i) => c + d.curve[i].parts[k]);
    const lo = cum;
    layers += `<path d="${ring(ts, (i) => rad(next[i]), (i) => rad(lo[i]))}" class="layer"><title>${dr.name} at ${clock(dr.at)}</title></path>`;
    cum = next;
  });
  const total = (i: number) => rad(d.curve[i].mg);

  let ticks = "";
  for (let h = 0; h < 24; h++) {
    const big = h % 6 === 0, [x0, y0] = pt(h * 60, RT), [x1, y1] = pt(h * 60, RT + (big ? 9 : 5));
    ticks += `<line x1="${f(x0)}" y1="${f(y0)}" x2="${f(x1)}" y2="${f(y1)}" class="tick${big ? " big" : ""}"/>`;
    if (h % 3 === 0) { const [x, y] = pt(h * 60, RL + 6); ticks += `<text x="${f(x)}" y="${f(y)}" class="hl${big ? " big" : ""}">${String(h).padStart(2, "0")}</text>`; }
  }
  for (let q = 0; q < 96; q++) if (q % 4) { const [x0, y0] = pt(q * 15, RT), [x1, y1] = pt(q * 15, RT + 2.5); ticks += `<line x1="${f(x0)}" y1="${f(y0)}" x2="${f(x1)}" y2="${f(y1)}" class="tick fine"/>`; }

  const markers = state.drinks.map((dr) => {
    const [x, y] = pt(dr.at, R0 - 13);
    const sip = dr.sipMin ? `<path d="${arc(dr.at, dr.at + dr.sipMin, R0 - 4)}" class="sip"/>` : "";
    return `${sip}<g class="drink" transform="translate(${f(x)},${f(y)})"><circle r="9"/><text y="3.6">${kind(dr.key).glyph}</text><title>${dr.name} · ${clock(dr.at)} · ${dr.mg} mg</title></g>`;
  }).join("");

  const [nx, ny] = pt(state.scrub, R1 + 10), [nx0, ny0] = pt(state.scrub, R0 - 26);
  const [bx, by] = pt(state.bed, R1 + 10);
  const [ox0, oy0] = pt(state.now, R0 - 2), [ox1, oy1] = pt(state.now, RT - 1);
  const tgt = rad(TARGET);
  const [tx, ty] = pt(state.bed + 50, tgt + 9);
  const ghostPath = ghost ? `<path d="${line(ts, (i) => rad(ghost.curve[i].mg))}" class="ghost"/>` : "";

  return `
  <defs>
    <radialGradient id="heat" gradientUnits="userSpaceOnUse" cx="${C}" cy="${C}" r="${R1}">
      <stop offset="${(R0 / R1).toFixed(3)}" stop-color="var(--crema)"/>
      <stop offset="${((R0 + R1) / 2 / R1).toFixed(3)}" stop-color="var(--roast)"/>
      <stop offset="1" stop-color="var(--ember)"/>
    </radialGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="7"/></filter>
    <mask id="future"><rect width="440" height="440" fill="#fff"/><path d="${wedge(state.now, FROM + 1440, 0, 230)}" fill="#8f8f8f"/></mask>
    <mask id="sweep"><circle cx="${C}" cy="${C}" r="115" fill="none" stroke="#fff" stroke-width="230" pathLength="1" transform="rotate(${(FROM / 1440) * 360 - 90} ${C} ${C})" class="sweep"/></mask>
  </defs>
  <circle cx="${C}" cy="${C}" r="${R1 + 3}" class="well"/>
  <path d="${wedge(state.bed, WAKE + 1440, R0, R1 + 3)}" class="night"/>
  <path d="${wedge(state.bed, state.bed + SLEEP_GUARD_MIN, R0, R1 + 3)}" class="guard"/>
  <circle cx="${C}" cy="${C}" r="${R0}" class="base"/>
  ${[50, 100, 150, 200, 250, 300].filter((v) => v < SCALE).map((v) => `<circle cx="${C}" cy="${C}" r="${f(rad(v))}" class="grid${v === TARGET ? " target" : ""}"/>`).join("")}
  <text x="${f(tx)}" y="${f(ty)}" class="tlabel">${TARGET} mg</text>
  <g mask="url(#sweep)">
    <path d="${ring(ts, (i) => rad(d.curve[i].hi), (i) => rad(d.curve[i].lo))}" class="band"/>
    <g mask="url(#future)">
      <path d="${ring(ts, total, () => R0)}" class="glow" filter="url(#glow)"/>
      <g fill="url(#heat)">${layers}</g>
      <path d="${line(ts, total)}" class="edge"/>
    </g>
    ${ghostPath}
  </g>
  <line x1="${f(ox0)}" y1="${f(oy0)}" x2="${f(ox1)}" y2="${f(oy1)}" class="now"/>
  ${ticks}${markers}
  <g class="handle bed" data-h="bed" tabindex="0" role="slider" aria-label="Bedtime" aria-valuetext="${clock(state.bed)}" transform="translate(${f(bx)},${f(by)})"><circle r="13"/><path d="M3.5,-5.5a6.5,6.5 0 1 0 2.5,9.5a5,5 0 0 1 -2.5,-9.5z"/></g>
  <line x1="${f(nx0)}" y1="${f(ny0)}" x2="${f(nx)}" y2="${f(ny)}" class="hand"/>
  <g class="handle scrub" data-h="scrub" tabindex="0" role="slider" aria-label="Look at a time" aria-valuetext="${clock(state.scrub)}" transform="translate(${f(nx)},${f(ny)})"><circle r="9"/></g>`;
}

/* ── words ────────────────────────────────────────────── */
function center(d: Day) {
  const t = state.scrub, mg = level(state.drinks, t), gut = state.drinks.reduce((s, x) => s + inGut(x, t), 0);
  const soon = level(state.drinks, t + 10);
  const dir = mg < 1 && soon < 1 ? "nothing in you" : soon > mg + 0.5 ? `rising · peaks ${clock(d.peak.at)}` : `falling · ${likeA(level(state.drinks, t + 120))} by ${clock(t + 120)}`;
  $("#c-when").textContent = t === state.now ? `in you now · ${clock(t)}` : `in you at ${clock(t)}${t > state.now ? " · forecast" : ""}`;
  $("#c-mg").textContent = String(Math.round(mg));
  $("#c-dir").textContent = dir;
  $("#c-gut").textContent = gut >= 5 ? `+${Math.round(gut)} mg still on its way` : "";
}

function tonight(d: Day) {
  const b = d.bed, over = b.sleepMax > TARGET;
  $("#tonight").innerHTML = `
    <p class="eyebrow">Tonight · bed ${clock(b.at)}</p>
    <p class="lead"><span class="num ${over ? "hot" : "cool"}">${Math.round(b.mg)} mg</span> left at lights‑out, ${likeA(b.mg)}.</p>
    <p class="sub">${over
      ? `It stays above ${TARGET} mg until <b>${clock(firstUnder(b.at))}</b>, in your deepest sleep hours.`
      : `Under ${TARGET} mg for your first three hours of sleep.`}
      Depending on how fast your body clears it: <span class="num">${Math.round(b.lo)}–${Math.round(b.hi)} mg</span>.</p>
    <dl class="stats">
      <div><dt>Peak</dt><dd class="num">${Math.round(d.peak.mg)}<small> mg</small></dd><dd class="s">at ${clock(d.peak.at)}</dd></div>
      <div><dt>Under ${TARGET} mg</dt><dd class="num">${d.peak.mg > TARGET ? clock(firstUnder(d.peak.at)) : "all day"}</dd><dd class="s">${d.peak.mg > TARGET ? `slow body ${clock(firstUnder(d.peak.at, HALF_LIFE.hi))}` : "never above"}</dd></div>
      <div><dt>Today</dt><dd class="num">${state.drinks.reduce((s, x) => s + x.mg, 0)}<small> mg</small></dd><dd class="s">${state.drinks.length} drink${state.drinks.length === 1 ? "" : "s"}</dd></div>
    </dl>`;
}
function firstUnder(from: number, hl = HALF_LIFE.mid) { for (let t = from; t < from + 1440; t += 5) if (level(state.drinks, t, hl) <= TARGET) return t; return from; }

function menu() {
  $("#menu").innerHTML = MENU.map((m) => {
    const lc = lastCall(state.drinks, { name: m.name, mg: m.mg, form: m.form, sipMin: m.sipMin, withFood: m.withFood }, state.bed, TARGET, state.now);
    const left = typeof lc === "number" ? lc - state.now : 0;
    const when = lc === "never" ? `<span class="no">too late today</span>` : lc === "any" ? `any time` : `until <b class="num">${clock(lc)}</b>${left <= 30 ? ` <span class="soon">${left} min left</span>` : ""}`;
    const on = state.preview === m.key;
    return `<button type="button" class="drinkbtn${on ? " on" : ""}${lc === "never" ? " late" : ""}" data-k="${m.key}" aria-pressed="${on}">
      <span class="g">${m.glyph}</span><span class="n">${m.name}</span><span class="mg num">${m.mg} mg${m.sipMin ? ` · sipped ${m.sipMin}′` : ""}</span><span class="lc">${when}</span>
      ${on ? `<span class="add">Add at ${clock(state.scrub)}</span>` : ""}</button>`;
  }).join("");
}

function log() {
  const ds = [...state.drinks].sort((a, b) => a.at - b.at);
  $("#log").innerHTML = ds.length ? ds.map((d) => `<li><span class="num t">${clock(d.at)}</span><span class="n">${d.name}${d.sipMin ? ` <i>over ${d.sipMin} min</i>` : ""}${d.withFood ? ` <i>with food</i>` : ""}</span><span class="num mg">${d.mg} mg</span><button type="button" data-rm="${d.id}" aria-label="Remove ${d.name}">×</button></li>`).join("")
    : `<li class="empty">No caffeine today. Tap a drink above to add one at the hand's time.</li>`;
}

/* ── render loop ──────────────────────────────────────── */
let first = true;
function render() {
  const d = day(state.drinks, state.bed, state.now, FROM, TO);
  const pv = state.preview ? [...state.drinks, make(state.preview, state.scrub)] : null;
  const ghost = pv ? day(pv, state.bed, state.now, FROM, TO) : null;
  const svg = $("#dial") as unknown as SVGSVGElement;
  svg.innerHTML = dial(d, ghost);
  if (first && !reduce) { svg.classList.add("intro"); setTimeout(() => svg.classList.remove("intro"), 1400); }
  first = false;
  center(d); tonight(ghost ?? d); menu(); log();
  $("#preview-note").textContent = ghost ? `Dashed line: with ${/^[aeiou]/i.test(kind(state.preview!).name) ? "an" : "a"} ${kind(state.preview!).name.replace(/^(?!Red Bull|Monster)./, (c) => c.toLowerCase())} at ${clock(state.scrub)}. Bed numbers above include it.` : "";
}

/* ── interaction ──────────────────────────────────────── */
function minuteAt(ev: PointerEvent) {
  const svg = $("#dial") as unknown as SVGSVGElement, r = svg.getBoundingClientRect();
  const x = ((ev.clientX - r.left) / r.width) * 440 - C, y = ((ev.clientY - r.top) / r.height) * 440 - C;
  let m = (((Math.atan2(y, x) + Math.PI / 2) / (Math.PI * 2)) * 1440 + 1440) % 1440;
  if (m < FROM) m += 1440;
  return { m: Math.round(m / 5) * 5, dist: Math.hypot(x, y) };
}
function boot() {
  const svg = $("#dial") as unknown as SVGSVGElement;
  let drag: "scrub" | "bed" | null = null;
  svg.addEventListener("pointerdown", (ev) => {
    const { m, dist } = minuteAt(ev);
    if (dist < 60) return;
    const h = (ev.target as Element).closest("[data-h]")?.getAttribute("data-h");
    drag = h === "bed" ? "bed" : "scrub";
    svg.setPointerCapture(ev.pointerId);
    if (drag === "scrub") { state.scrub = m; render(); }
  });
  svg.addEventListener("pointermove", (ev) => {
    if (!drag) return;
    const { m } = minuteAt(ev);
    if (drag === "bed") state.bed = Math.min(Math.max(m, 20 * 60), 27 * 60); else state.scrub = m;
    render();
  });
  const end = () => { if (drag === "bed") menu(); drag = null; };
  svg.addEventListener("pointerup", end); svg.addEventListener("pointercancel", end);
  svg.addEventListener("keydown", (ev) => {
    const h = (ev.target as Element).getAttribute("data-h") as "scrub" | "bed" | null;
    if (!h || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(ev.key)) return;
    ev.preventDefault();
    const step = ev.key === "ArrowRight" || ev.key === "ArrowUp" ? 5 : -5;
    if (h === "bed") state.bed = Math.min(Math.max(state.bed + step, 20 * 60), 27 * 60); else state.scrub = Math.min(Math.max(state.scrub + step, FROM), TO);
    render();
    ($(`[data-h="${h}"]`) as unknown as SVGGElement).focus();
  });
  $("#menu").addEventListener("click", (ev) => {
    const b = (ev.target as Element).closest<HTMLButtonElement>("[data-k]");
    if (!b) return;
    const k = b.dataset.k!;
    if ((ev.target as Element).closest(".add")) { state.drinks.push(make(k, state.scrub)); state.preview = null; }
    else state.preview = state.preview === k ? null : k;
    render();
  });
  $("#log").addEventListener("click", (ev) => {
    const id = (ev.target as Element).closest<HTMLButtonElement>("[data-rm]")?.dataset.rm;
    if (!id) return;
    state.drinks = state.drinks.filter((d) => d.id !== id); render();
  });
  $("#to-now").addEventListener("click", () => { state.scrub = state.now; render(); });
  $("#hl").textContent = `${HALF_LIFE.lo / 60}–${HALF_LIFE.hi / 60} h`;
  render();
}
boot();
