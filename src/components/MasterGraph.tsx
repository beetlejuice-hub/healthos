import { useEffect, useMemo, useRef, useState } from "react";
import type { Lanes } from "../lib/insights";
import { buckets, valueAt, type Point } from "../lib/series";
import { atMinute, clock, dayLabel, localDay, DAY, HOUR, MIN } from "../lib/time";
import type { Supplement } from "../lib/types";
import type { GlanceDay } from "../lib/glance";
import { FEELINGS, feelRuns, feelText, latestCheck, nearestCheck, type Check } from "../lib/feelgraph";
import { CAF_SLEEP } from "../lib/caffeine-sleep";
import type { BandData } from "../lib/band-client";
import { lastNight, type SleepSession } from "../lib/band";
import { coffeeWindows, everydayRange, minuteMap, usualAt, usualByHour, usualReady, workoutWindows, USUAL_MIN_DAYS } from "../lib/hrusual";

/**
 * One timeline for everything (owner: "one master graph that has everything on it and things can
 * be ticked on and off"). Thin stacked lanes share the time axis; any line lane can be drawn on
 * top of the first one with its own axis ("caffeine on heart rate"). Drag or swipe to go back in
 * time; ⌘/Ctrl + wheel zooms. Canvas, because a year of data is too many SVG nodes.
 */

/**
 * Panes (owner, 8 Oct, canvas A): each metric its own full-width pane, its name and its value at the crosshair
 * inside it. "feel": the feelings as four rows, each its own 1–10 (the ribbon was "hard to read"). "chips":
 * sleep ratings. "events": coffee, meals, drinks, supplements and workouts on one clock (canvas B's rail).
 * "wearable": not connected yet (a placeholder). "hr": the band's heart rate per minute. "hyp": its sleep stages.
 */
type Kind = "series" | "daily" | "events" | "wearable" | "feel" | "chips" | "hr" | "hyp";
type Lane = { id: string; name: string; unit: string; color: string; h: number; kind: Kind; pts?: Point[]; lo?: number; hi?: number; area?: boolean; overlay?: boolean };

/** A colour token; Insights tokens live on the screen, so read them there. */
const cssVar = (v: string) => getComputedStyle(document.querySelector(".app") ?? document.documentElement).getPropertyValue(v).trim() || "#888";
/** Panes run the full width: names and values sit inside each pane's header strip, not in a label column. */
const RIGHT = 46, TOP = 24, GAP = 6, HDR = 20, LEFT = 10;
/** Sleep stages, top to bottom like Fitbit's own chart: awake, REM, light, deep — deeper is darker. */
const STAGES = ["awake", "rem", "light", "deep"] as const;
const STAGE_ALPHA: Record<string, number> = { awake: .3, rem: .55, light: .7, deep: 1, asleep: .7, restless: .4 };
const STAGE_ROW: Record<string, number> = { awake: 0, restless: 0, rem: 1, light: 2, asleep: 2, deep: 3 };
/** Below your usual: a cool blue, paired with the heart-rate red above it (canvas A, owner's pick 8 Oct). */
const COOL = "#5f9be0";
/** "+6" / "−3" — whole bpm with a real minus sign. */
const sgnInt = (v: number) => { const r = Math.round(v); return r === 0 ? "±0" : `${r > 0 ? "+" : "−"}${Math.abs(r)}`; };
const stageAt = (sleep: SleepSession[], t: number) => {
  const s = sleep.find((x) => x.start <= t && x.end >= t);
  if (!s) return null;
  return s.stages.find((x) => x.start <= t && x.end > t)?.type ?? (s.stages.length ? "awake" : "asleep");
};
const hm = (min: number) => `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, "0")}`;

/** "Show on graph" from a scout pattern: these lanes, on top of each other, these days highlighted. */
export type GraphFocus = { key: string; lanes: string[]; days: string[] };

export function MasterGraph({ data, supplements, focus, days, band, onView }: { data: Lanes; supplements: Supplement[]; focus?: GraphFocus | null; /** Per-day numbers for the readout's "the day" and "last night" (lib/glance). */ days?: GlanceDay[]; /** The Fitbit's minutes and nights (lib/band-client); null = not connected. */ band?: BandData | null; /** The view now starts at t (to load older band weeks). */ onView?: (t0: number) => void }) {
  const C = useMemo(() => ({ panel: cssVar("--i-panel"), up: cssVar("--g-now"), down: cssVar("--g-down"), line2: cssVar("--i-line-2"), ok: cssVar("--ok"), caf: cssVar("--caf"), alc: cssVar("--alc"), kcal: cssVar("--kcal"), gym: cssVar("--gym"), supp: cssVar("--supp"), wt: cssVar("--wt"), mood: cssVar("--mood"), hr: cssVar("--hr"), line: cssVar("--i-line"), ink: cssVar("--i-ink"), ink2: cssVar("--i-ink-2"), dim: cssVar("--i-dim") }), []);
  const [w, setW] = useState(900);
  const narrow = w < 640;
  /** Full screen (owner, 8 Oct: "make sure i can view it in big"): lanes taller, heart rate about half the screen. */
  const [big, setBig] = useState(false);
  const [vh, setVh] = useState(() => (typeof window === "undefined" ? 800 : window.innerHeight));
  /**
   * The heart-rate scale. "fit" (default) fits whatever is on screen, like TradingView's auto scale (owner, 8 Oct:
   * "if we are between 60-80 bpm … it looks volatile, but if i zoom out and have a 160 bpm, now that is the new
   * peak"); "log" also squeezes the high end, so a workout in view doesn't flatten the resting range.
   */
  const [scale, setScale] = useState<"fit" | "log">("fit");
  /**
   * The heart-rate lane's numbers (lib/hrusual): your usual for each quarter hour from the days before today,
   * the 2 h after each coffee and each workout's window, a scale zoomed to your everyday range (workouts run off
   * the top), and how far apart readings may be and still be joined — 2.5× their usual spacing, at least 5 min,
   * so a band that sends every 15 minutes still draws a line.
   */
  const heart = useMemo(() => {
    if (!band?.hr.length) return null;
    const usual = usualByHour(band.hr, data.workouts, localDay(data.to));
    const mins = minuteMap(band.hr), range = everydayRange(band.hr, data.workouts);
    const lo = range ? Math.max(30, Math.floor((range[0] - 4) / 5) * 5) : 40;
    const hi = range ? Math.max(lo + 30, Math.ceil((range[1] + 6) / 5) * 5) : 120;
    const gaps = band.hr.slice(1).map((m, i) => m[0] - band.hr[i][0]).filter((g) => g > 0 && g <= 30 * MIN).sort((a, b) => a - b);
    const join = Math.max(5 * MIN, 2.5 * (gaps[Math.floor(gaps.length / 2)] ?? MIN));
    const names = new Map(data.workouts.map((x) => [x.start, x.name]));
    return {
      usual: usualReady(usual) ? usual : null, days: usual.days, lo, hi, join,
      coffees: coffeeWindows(data.doses, mins, usual),
      gyms: workoutWindows(data.workouts, band.hr, usual).map((g) => ({ ...g, name: names.get(g.start) ?? "Workout" })),
    };
  }, [band, data]);
  const lanes: Lane[] = useMemo(() => {
    const range = (pts: Point[], pad: number, floor?: [number, number]): [number, number] => {
      if (!pts.length) return floor ?? [0, 1];
      const v = pts.map((p) => p[1]); return [Math.floor(Math.min(...v) - pad), Math.ceil(Math.max(...v) + pad)];
    };
    const cafHi = Math.max(200, Math.ceil(Math.max(0, ...data.caffeine.map((p) => p[1])) / 50) * 50);
    const alcHi = Math.max(20, Math.ceil(Math.max(0, ...data.alcohol.map((p) => p[1])) / 10) * 10);
    const [wLo, wHi] = range(data.weight, 0.5, [70, 90]);
    // The line is a 5-minute running mean (minute-to-minute noise reads as fuzz); pointing reads the minute itself.
    const hrPts: Point[] = [];
    const src = band?.hr ?? [];
    for (let i = 0, lo = 0, hi = 0, sum = 0; i < src.length; i++) {
      while (hi < src.length && src[hi][0] <= src[i][0] + 2 * MIN) sum += src[hi++][1];
      while (src[lo][0] < src[i][0] - 2 * MIN) sum -= src[lo++][1];
      hrPts.push([src[i][0], sum / (hi - lo)]);
    }
    const list: Lane[] = [
      { id: "feel", name: "Feelings", unit: "1–10", color: C.mood, h: 4 * 30, kind: "feel", pts: data.mood, lo: 1, hi: 10 },
      { id: "slept", name: "Sleep rating", unit: "/10", color: C.ok, h: 22, kind: "chips", pts: data.sleep, lo: 1, hi: 10 },
      band?.hr.length
        ? { id: "hr", name: "Heart rate", unit: "bpm", color: C.hr, h: big ? Math.max(240, Math.round(vh * 0.42)) : narrow ? 116 : 140, kind: "hr", pts: hrPts, lo: heart?.lo, hi: heart?.hi, overlay: true }
        : { id: "hr", name: "Heart rate", unit: "bpm", color: C.hr, h: 4, kind: "wearable" },
      band?.sleep.length
        ? { id: "sleep", name: "Sleep stages", unit: "band", color: C.mood, h: 44, kind: "hyp" }
        : { id: "sleep", name: "Sleep stages", unit: "", color: C.hr, h: 4, kind: "wearable" },
      { id: "caf", name: "Caffeine in body", unit: "mg", color: C.caf, h: 64, kind: "series", pts: data.caffeine, lo: 0, hi: cafHi, area: true, overlay: true },
      { id: "alc", name: "Alcohol in body", unit: "g", color: C.alc, h: 40, kind: "series", pts: data.alcohol, lo: 0, hi: alcHi, area: true, overlay: true },
      { id: "events", name: "Events", unit: "", color: C.ink2, h: 56, kind: "events" },
      { id: "wt", name: "Weight", unit: "kg", color: C.wt, h: 36, kind: "daily", pts: data.weight, lo: wLo, hi: wHi, overlay: true },
      { id: "kcal", name: "Calories per day", unit: "kcal", color: C.kcal, h: 36, kind: "daily", pts: data.kcalDay, lo: 0, hi: Math.max(3000, Math.ceil(Math.max(0, ...data.kcalDay.map((p) => p[1])) / 500) * 500), overlay: true },
    ];
    return list.map((l) => (big && l.kind !== "hr" ? { ...l, h: Math.round(l.h * 1.5) } : l));
  }, [data, C, band, heart, narrow, big, vh]);

  // Full screen: no page scroll underneath, Esc closes, lanes follow the window's height.
  useEffect(() => {
    if (!big) return;
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setBig(false); };
    const size = () => setVh(window.innerHeight);
    size(); window.addEventListener("keydown", key); window.addEventListener("resize", size);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", key); window.removeEventListener("resize", size); };
  }, [big]);

  const [on, setOn] = useState<Record<string, boolean>>({ hr: true, sleep: true, caf: true, alc: true, events: true, wt: true, feel: true, slept: true, kcal: false });
  const [over, setOver] = useState<Record<string, boolean>>({ energy: false });
  const [view, setView] = useState({ t1: data.to + 90 * MIN, span: 3 * DAY });
  const [hover, setHover] = useState<number | null>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; t1: number } | null>(null);
  // The lane list is long; on a phone it starts folded so the readout sits right under the chart.
  const [lanesOpen, setLanesOpen] = useState(() => typeof window === "undefined" || window.innerWidth > 700);

  // A pattern asked to be shown: only its lanes, the second drawn over the first where it can be,
  // and the view widened to cover the days that show it.
  useEffect(() => {
    if (!focus) return;
    // A pattern names old lanes too: the four feelings are one pane now, meals/workouts/stack are Events.
    const ALIAS: Record<string, string> = { mood: "feel", energy: "feel", focus: "feel", stress: "feel", meals: "events", gym: "events", supps: "events" };
    const want = new Set(focus.lanes.map((id) => ALIAS[id] ?? id));
    setOn(Object.fromEntries(lanes.map((l) => [l.id, want.has(l.id)])));
    const series = focus.lanes.find((id) => lanes.find((l) => l.id === id)?.kind === "series");
    setOver(series ? Object.fromEntries([...want].filter((id) => id !== series && lanes.find((l) => l.id === id)?.overlay).map((id) => [id, true])) : {});
    const firstDay = focus.days.length ? atMinute([...focus.days].sort()[0], 0) : data.to - 14 * DAY;
    setView(clampView(data.to + 90 * MIN, Math.max(7 * DAY, data.to - firstDay + 2 * DAY)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.key]);

  const minT = data.from, maxT = data.to + 90 * MIN;
  // On a phone, three days of heart rate is a blur (owner, 8 Oct: "not too visible, especially on phone"):
  // once the band's data is in, open on one day — once, so a view you chose stays.
  const dayOnce = useRef(false);
  useEffect(() => {
    if (!heart || dayOnce.current || !narrow || focus) return;
    dayOnce.current = true;
    setView(clampView(data.to + 90 * MIN, DAY));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heart, narrow]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { onView?.(view.t1 - view.span); }, [view.t1, view.span]);
  const clampView = (t1: number, span: number) => {
    const s = Math.max(3 * HOUR, Math.min(span, maxT - minT + 3 * HOUR));
    return { span: s, t1: Math.max(minT + s, Math.min(maxT, t1)) };
  };

  useEffect(() => {
    const el = cv.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el); return () => ro.disconnect();
  }, []);

  const visible = lanes.filter((l) => l.kind === "wearable" || on[l.id]);
  const host = visible.find((l) => l.kind === "series");
  const drawn = visible.filter((l) => !(over[l.id] && host && l.id !== host.id));
  const overlays = host ? visible.filter((l) => over[l.id] && l.id !== host.id) : [];
  // The How you felt lane's position is what pointing (and the tests) read.
  // Each pane: a header strip (name, value at the crosshair), then its plot; `y` is the plot's top.
  let y = TOP; const layout = drawn.map((l) => { const r = { l, y: y + HDR }; y += HDR + l.h + GAP; return r; });
  const H = y + 4;
  const feelLanes = layout.filter((r) => r.l.kind === "feel");
  const feelRow = feelLanes[0];
  const [hoverY, setHoverY] = useState<number | null>(null);
  // The check-in under the finger or cursor (within ~14 px), when pointing inside the Feelings lane.
  const pwNow = Math.max(10, w - LEFT - RIGHT);
  const overFeel = hoverY != null ? feelLanes.find((r) => hoverY >= r.y - 4 && hoverY <= r.y + r.l.h + 4) : undefined;
  const hovered: Check | null = hover != null && overFeel && view.span <= 7 * DAY
    ? nearestCheck(data.checks.filter((c) => c.mood != null), hover, (14 / pwNow) * view.span) : null;

    // Each line lane's scale fits what's on screen (heart rate, weight, calories; caffeine and alcohol from 0).
  const fitted = useMemo(() => {
    const t0 = view.t1 - view.span;
    const inView = (pts: Point[], pad = 0) => pts.filter((p) => p[0] >= t0 - pad && p[0] <= view.t1 + pad).map((p) => p[1]);
    const fitOf = (l: Lane): [number, number] => {
      const lo0 = l.lo ?? 0, hi0 = l.hi ?? 1;
      if (l.kind === "hr") {
        const v = inView(l.pts ?? []);
        if (heart?.usual) for (let k = 0; k <= 48; k++) { const u = usualAt(heart.usual, t0 + (k / 48) * view.span); if (u) v.push(u.lo, u.hi); }
        if (!v.length) return [lo0, hi0];
        const mn = Math.min(...v), mx = Math.max(...v), pad = Math.max(2, (mx - mn) * 0.08);
        let lo = Math.max(30, Math.floor((mn - pad) / 5) * 5), hi = Math.ceil((mx + pad) / 5) * 5;
        if (hi - lo < 15) { const c = (lo + hi) / 2; lo = Math.floor((c - 7.5) / 5) * 5; hi = lo + 15; }
        return [lo, hi];
      }
      if (l.kind === "daily") {
        const v = inView(l.pts ?? [], 3 * DAY); if (!v.length) return [lo0, hi0];
        if (l.id === "kcal") return [0, Math.max(1000, Math.ceil((Math.max(...v) * 1.1) / 500) * 500)];
        let lo = Math.floor((Math.min(...v) - 0.4) * 2) / 2, hi = Math.ceil((Math.max(...v) + 0.4) * 2) / 2;
        if (hi - lo < 1.5) { const c = (lo + hi) / 2; lo = Math.floor((c - 0.75) * 2) / 2; hi = lo + 1.5; }
        return [lo, hi];
      }
      if (l.kind === "series") {
        const v = inView(l.pts ?? []), top = Math.max(0, ...v), unit = l.id === "caf" ? 50 : 5;
        return [0, Math.max(l.id === "caf" ? 100 : 10, Math.ceil((top * 1.1) / unit) * unit)];
      }
      return [lo0, hi0];
    };
    return new Map(lanes.map((l) => [l.id, fitOf(l)]));
  }, [lanes, view, heart]);
  /** What a pane's header says at time t: its value (bold) and a line of context. */
  const paneText = (l: Lane, t: number): { v: string; sub: string } => {
    const fmt0 = (n: number) => Math.round(n).toLocaleString("en-GB");
    if (l.kind === "wearable") return { v: "", sub: l.id === "hr" || l.id === "sleep" ? "connect your band in Settings" : "connect a wearable" };
    if (l.kind === "hr") {
      const v = valueAt((band?.hr ?? []) as unknown as Point[], t);
      if (!v || !heart || t - v[0] >= heart.join) return { v: "—", sub: "band off" };
      const u = usualAt(heart.usual, t);
      return { v: `${Math.round(v[1])} bpm`, sub: u ? `${sgnInt(v[1] - u.mid)} vs usual ${Math.round(u.mid)}` : `learning your usual · ${Math.min(heart.days, USUAL_MIN_DAYS)} of ${USUAL_MIN_DAYS} days` };
    }
    if (l.kind === "hyp") {
      const st = band ? stageAt(band.sleep, t) : null, n = band ? lastNight(band.sleep.filter((x) => x.end <= t + 12 * HOUR), t + 12 * HOUR) : null;
      return { v: st ?? "awake", sub: n?.asleepMin != null ? `night ${clock(n.start)}–${clock(n.end)} · ${hm(n.asleepMin)} asleep` : "" };
    }
    if (l.id === "caf") return { v: `${fmt0(valueAt(data.caffeine, t)?.[1] ?? 0)} mg`, sub: "in your body" };
    if (l.id === "alc") { const v = valueAt(data.alcohol, t)?.[1] ?? 0; return { v: `${v >= 0.05 ? v.toFixed(1) : "0"} g`, sub: "in your body" }; }
    if (l.id === "wt") { const v = valueAt(l.pts ?? [], t); return v && t - v[0] < 3 * DAY ? { v: `${v[1].toFixed(1)} kg`, sub: dayLabel(v[0]) } : { v: "—", sub: "" }; }
    if (l.id === "kcal") { const v = valueAt(l.pts ?? [], t); return v && t - v[0] < DAY ? { v: `${fmt0(v[1])} kcal`, sub: dayLabel(v[0]) } : { v: "—", sub: "" }; }
    if (l.id === "slept") { const v = valueAt(l.pts ?? [], t); return v && t - v[0] < DAY ? { v: `${v[1]}/10`, sub: "your morning rating" } : { v: "—", sub: "" }; }
    if (l.kind === "feel") {
      const c = hovered ?? latestCheck(data.checks, t);
      if (!c || t - c.at >= 6 * HOUR) return { v: "", sub: "no check-in in the 6 hours before" };
      const parts = FEELINGS.flatMap(([k, name]) => (c[k] != null ? [`${name.toLowerCase()} ${c[k]}`] : []));
      return { v: parts.join(" · "), sub: `check-in ${clock(c.at)}${c.note ? ` · “${c.note}”` : ""}` };
    }
    if (l.kind === "events") {
      const d = localDay(t), on = (x: number) => localDay(x) === d;
      const cups = data.doses.filter((x) => x.mg > 0 && on(x.at)).length, meals = data.meals.filter((x) => on(x.at)), drinks = data.drinks.filter((x) => on(x.at)).length;
      const kcal = meals.reduce((a, m) => a + m.kcal, 0), gym = data.workouts.filter((x) => on(x.start)).map((x) => x.name);
      const bits = [cups ? `${cups} coffee` : "", meals.length ? `${meals.length} meals · ${fmt0(kcal)} kcal` : "", drinks ? `${drinks} ${drinks === 1 ? "drink" : "drinks"}` : "", gym.length ? gym.join(", ") : ""].filter(Boolean);
      return { v: "", sub: bits.length ? `${dayLabel(t)} · ${bits.join(" · ")}` : `${dayLabel(t)} · nothing logged` };
    }
    return { v: "", sub: "" };
  };

  useEffect(() => {
    const el = cv.current; if (!el) return;
    const dpr = window.devicePixelRatio || 1;
    el.width = Math.round(w * dpr); el.height = Math.round(H * dpr); el.style.height = `${H}px`;
    const ctx = el.getContext("2d")!; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, H);
    const t0 = view.t1 - view.span, pw = Math.max(10, w - LEFT - RIGHT);
    const X = (t: number) => LEFT + ((t - t0) / view.span) * pw;
    ctx.font = "10px IBM Plex Mono, monospace"; ctx.textBaseline = "middle";
    // Each pane on its own panel; the page shows between them.
    ctx.fillStyle = C.panel; for (const r of layout) ctx.fillRect(0, r.y - HDR, w, HDR + r.l.h + 2);

    // time grid
    const steps = [HOUR, 3 * HOUR, 6 * HOUR, 12 * HOUR, DAY, 2 * DAY, 7 * DAY, 14 * DAY, 28 * DAY];
    const st = steps.find((s) => s >= view.span / (pw / 90)) ?? 28 * DAY;
    const tz = new Date(t0).getTimezoneOffset() * MIN;
    for (let t = Math.ceil((t0 - tz) / st) * st + tz; t <= view.t1; t += st) {
      const x = X(t); ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + .5, TOP - 4); ctx.lineTo(x + .5, H - 4); ctx.stroke();
      ctx.fillStyle = C.dim; ctx.textAlign = "center";
      const midnight = new Date(t).getHours() === 0 && new Date(t).getMinutes() === 0;
      ctx.fillText(st >= DAY || midnight ? dayLabel(t) : clock(t), x, 10);
    }

    // Days a pattern rests on, shaded behind every lane.
    if (focus) for (const d of focus.days) { const a = X(atMinute(d, 0)), b = X(atMinute(d, 24 * 60)); if (b < LEFT || a > w - RIGHT) continue; ctx.fillStyle = C.ink; ctx.globalAlpha = .07; ctx.fillRect(Math.max(LEFT, a), TOP - 4, Math.min(w - RIGHT, b) - Math.max(LEFT, a), H - TOP); ctx.globalAlpha = 1; }

    // Nights (23:00–07:00) faintly shaded, so the gaps between check-ins read as sleep, not missing data.
    for (let d = new Date(t0 - DAY).setHours(23, 0, 0, 0); d < view.t1; d += DAY) {
      const a = Math.max(LEFT, X(d)), b = Math.min(w - RIGHT, X(d + 8 * HOUR));
      if (b > a && view.span <= 21 * DAY) { ctx.fillStyle = C.ink; ctx.globalAlpha = .035; ctx.fillRect(a, TOP - 4, b - a, H - TOP); ctx.globalAlpha = 1; }
    }

    const yOf = (top: number, h: number, lo: number, hi: number, v: number) => top + h - ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo || 1)) * h;
    const lim = (l: Lane): [number, number] => fitted.get(l.id) ?? [l.lo ?? 0, l.hi ?? 1];
    const drawSeries = (l: Lane, top: number, h: number, asOverlay: boolean) => {
      const [lo, hi] = lim(l), pts = l.pts ?? [];
      if (l.kind === "hr") {
        // Heart rate drawn over another lane ("on top"): the plain line with its own scale.
        const Y = (v: number) => yOf(top, h, lo, hi, v), join = heart?.join ?? 5 * MIN;
        const avg = buckets(pts, t0, view.t1, Math.floor(pw));
        ctx.strokeStyle = l.color; ctx.lineWidth = 1.75; if (asOverlay) ctx.setLineDash([5, 3]);
        ctx.beginPath(); let prev: { t1: number } | null = null;
        avg.forEach((k, i) => { if (!k) return; const x = LEFT + i + .5, yy = Y(k.mean); if (prev && k.t0 - prev.t1 <= join) ctx.lineTo(x, yy); else ctx.moveTo(x, yy); prev = k; });
        ctx.stroke(); ctx.setLineDash([]);
      } else if (l.kind === "series") {
        // Alcohol is drawn only while there's some in you — a flat line at zero all month is just noise.
        const b = buckets(pts, t0, view.t1, Math.floor(pw)).map((k) => (k && l.id === "alc" && k.max <= 0.05 ? null : k));
        const Y = (v: number) => yOf(top, h, lo, hi, v);
        if (l.area && !asOverlay) {
          ctx.fillStyle = l.color; ctx.globalAlpha = .16; ctx.beginPath(); let started = false, lastX = LEFT;
          b.forEach((k, i) => { if (!k) return; const x = LEFT + i; if (!started) { ctx.moveTo(x, Y(0)); started = true; } ctx.lineTo(x, Y(k.mean)); lastX = x; });
          if (started) { ctx.lineTo(lastX, Y(0)); ctx.closePath(); ctx.fill(); } ctx.globalAlpha = 1;
        }
        ctx.strokeStyle = l.color; ctx.lineWidth = asOverlay ? 1.75 : 1.25; if (asOverlay) ctx.setLineDash([5, 3]);
        ctx.beginPath(); let pen = false;
        b.forEach((k, i) => { if (!k) { pen = false; return; } const x = LEFT + i, yy = Y(k.mean); if (pen) ctx.lineTo(x, yy); else ctx.moveTo(x, yy); pen = true; });
        ctx.stroke(); ctx.setLineDash([]);
      } else {
        const inView = pts.filter((p) => p[0] >= t0 - 3 * DAY && p[0] <= view.t1 + 3 * DAY);
        const Y = (v: number) => yOf(top, h, lo, hi, v);
        ctx.strokeStyle = l.color; ctx.lineWidth = asOverlay ? 1.75 : 1.25; if (asOverlay) ctx.setLineDash([5, 3]);
        ctx.beginPath(); inView.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1])))); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = l.color; inView.forEach((p) => { ctx.beginPath(); ctx.arc(X(p[0]), Y(p[1]), view.span < 20 * DAY ? 2.5 : 1.3, 0, 7); ctx.fill(); });
        if (view.span < 8 * DAY) { ctx.textAlign = "left"; inView.forEach((p) => ctx.fillText(String(Math.round(p[1] * 10) / 10), X(p[0]) + 5, Y(p[1]) - 6)); }
      }
    };

    /** A + B (owner's pick, 8 Oct): heart rate against your usual for the hour, and a labelled window after each coffee and workout. */
    const drawHr = (l: Lane, top: number, h: number) => {
      if (!heart) return;
      const { usual } = heart, [lo, hi] = lim(l);
      const Y = scale === "log"
        ? (v: number) => top + 3 + (h - 14) * (1 - (Math.log(Math.max(lo, Math.min(hi, v))) - Math.log(lo)) / (Math.log(hi) - Math.log(lo) || 1))
        : (v: number) => yOf(top + 3, h - 14, lo, hi, v);
      ctx.font = "9px IBM Plex Mono, monospace"; ctx.textAlign = "left";
      const step = hi - lo <= 25 ? 5 : hi - lo <= 70 ? 10 : 20;
      for (let v = Math.ceil((lo + 1) / step) * step; v < hi; v += step) {
        const yy = Math.round(Y(v)) + .5; ctx.strokeStyle = C.line; ctx.setLineDash([1, 4]); ctx.beginPath(); ctx.moveTo(LEFT, yy); ctx.lineTo(w - RIGHT, yy); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = C.dim; ctx.fillText(String(v), LEFT + 3, yy - 5);
      }
      // B: the 2 h after each coffee, each workout and its way back down — behind everything.
      for (const c of heart.coffees) {
        if (c.end < t0 || c.at > view.t1) continue;
        const a = X(c.at), b = X(c.end); ctx.fillStyle = C.caf; ctx.globalAlpha = .1; ctx.fillRect(a, top, b - a, h); ctx.globalAlpha = .8; ctx.fillRect(a - .75, top, 1.5, h); ctx.globalAlpha = 1;
      }
      for (const g of heart.gyms) {
        if ((g.backAt ?? g.end) < t0 || g.start > view.t1) continue;
        const a = X(g.start), b = X(g.end); ctx.fillStyle = C.gym; ctx.globalAlpha = .14; ctx.fillRect(a, top, b - a, h);
        if (g.backAt) { ctx.globalAlpha = .06; ctx.fillRect(b, top, X(g.backAt) - b, h); }
        ctx.globalAlpha = .8; ctx.fillRect(a - .75, top, 1.5, h); ctx.globalAlpha = 1;
      }
      // A: your usual for each quarter hour, as a band with its middle dashed.
      if (usual) {
        let up: [number, number][] = [], dn: [number, number][] = [], mid: [number, number][] = [];
        const flush = () => {
          if (up.length > 1) {
            ctx.fillStyle = C.ink2; ctx.globalAlpha = .14; ctx.beginPath(); up.forEach(([x, yy], i) => (i ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy))); [...dn].reverse().forEach(([x, yy]) => ctx.lineTo(x, yy)); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
            ctx.strokeStyle = C.dim; ctx.setLineDash([2, 4]); ctx.beginPath(); mid.forEach(([x, yy], i) => (i ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy))); ctx.stroke(); ctx.setLineDash([]);
          }
          up = []; dn = []; mid = [];
        };
        for (let x = 0; x <= pw; x += 2) {
          const u = usualAt(usual, t0 + (x / pw) * view.span);
          if (!u) { flush(); continue; }
          up.push([LEFT + x, Y(u.hi)]); dn.push([LEFT + x, Y(u.lo)]); mid.push([LEFT + x, Y(u.mid)]);
        }
        flush();
      }
      // The line: grey inside your usual, red above it, blue below, the gap to the band filled. No usual yet: red.
      const bk = buckets(l.pts ?? [], t0, view.t1, Math.floor(pw));
      const lines = { n: new Path2D(), w: new Path2D(), c: new Path2D(), r: new Path2D() }, fills = { w: new Path2D(), c: new Path2D() };
      const pts: { x: number; y: number; t1: number; v: number; joined: boolean }[] = [];
      bk.forEach((k, i) => {
        if (!k) return;
        const cur = { x: LEFT + i + .5, y: Y(k.mean), t1: k.t1, v: k.mean, joined: false }, prev = pts.at(-1);
        if (prev && k.t0 - prev.t1 <= heart.join) {
          const u = usual ? usualAt(usual, (k.t0 + k.t1) / 2) : null, m = (prev.v + cur.v) / 2;
          const kind = !u ? "r" : m > u.hi ? "w" : m < u.lo ? "c" : "n";
          lines[kind].moveTo(prev.x, prev.y); lines[kind].lineTo(cur.x, cur.y);
          if (u && (kind === "w" || kind === "c")) { const e = Y(kind === "w" ? u.hi : u.lo), f = fills[kind]; f.moveTo(prev.x, prev.y); f.lineTo(cur.x, cur.y); f.lineTo(cur.x, e); f.lineTo(prev.x, e); f.closePath(); }
          prev.joined = true; cur.joined = true;
        }
        pts.push(cur);
      });
      ctx.globalAlpha = .22; ctx.fillStyle = C.hr; ctx.fill(fills.w); ctx.fillStyle = COOL; ctx.fill(fills.c); ctx.globalAlpha = 1;
      ctx.lineWidth = narrow ? 2.25 : 2; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ([["n", C.ink2], ["w", C.hr], ["c", COOL], ["r", C.hr]] as const).forEach(([k, col]) => { ctx.strokeStyle = col; ctx.stroke(lines[k]); });
      ctx.lineWidth = 1; ctx.lineCap = "butt"; ctx.lineJoin = "miter";
      // A reading with no neighbour close enough is still shown, as a dot.
      ctx.fillStyle = usual ? C.ink2 : C.hr; for (const p of pts) if (!p.joined) { ctx.beginPath(); ctx.arc(p.x, p.y, 2.2, 0, 7); ctx.fill(); }
      // Markers along the bottom: coffee dots, workout bars.
      for (const g of heart.gyms) if (g.end >= t0 && g.start <= view.t1) { ctx.fillStyle = C.gym; ctx.fillRect(X(g.start), top + h - 7, Math.max(3, X(g.end) - X(g.start)), 4); }
      for (const d of data.doses) if (d.at >= t0 && d.at <= view.t1 && d.mg > 0) { ctx.fillStyle = C.panel; ctx.beginPath(); ctx.arc(X(d.at), top + h - 5, 5, 0, 7); ctx.fill(); ctx.fillStyle = C.caf; ctx.beginPath(); ctx.arc(X(d.at), top + h - 5, 3.5, 0, 7); ctx.fill(); }
      // B's labels at the top of each window: in full when there's room (two days or less), else just the number.
      const evs = [
        ...heart.coffees.map((c) => ({ at: c.at, color: C.caf, title: `Coffee ${clock(c.at)}${c.count > 1 ? ` · ${c.count} cups` : ""}`, sub: c.delta == null ? "" : `${sgnInt(c.delta)} bpm vs ${c.vs === "usual" ? "usual" : "before"}`, short: c.delta == null ? "" : sgnInt(c.delta) })),
        ...heart.gyms.map((g) => ({ at: g.start, color: C.gym, title: g.name, sub: [g.peak != null ? `peak ${g.peak}` : "", g.backMin != null ? `back in ${g.backMin} min` : ""].filter(Boolean).join(" · "), short: g.peak != null ? `↑${g.peak}` : "" })),
      ].filter((e) => e.at <= view.t1 && e.at >= t0 - 2 * HOUR).sort((a, b) => a.at - b.at);
      let right = -Infinity;
      evs.forEach((e, i) => {
        const x = Math.max(LEFT + 3, X(e.at) + 4);
        if (x > w - RIGHT - 10 || x < right + 6) return;
        const next = Math.min(w - RIGHT, ...evs.slice(i + 1).map((n) => X(n.at)).filter((nx) => nx > x));
        ctx.font = "600 10.5px IBM Plex Sans, sans-serif"; const tw = ctx.measureText(e.title).width;
        ctx.font = "10.5px IBM Plex Sans, sans-serif"; const sw = e.sub ? ctx.measureText(e.sub).width : 0;
        const full = Math.max(tw, sw);
        ctx.textAlign = "left";
        if (view.span <= 2 * DAY && x + full + 4 <= next) {
          ctx.fillStyle = C.panel; ctx.globalAlpha = .8; ctx.fillRect(x - 2, top + 2, full + 4, e.sub ? 26 : 14); ctx.globalAlpha = 1;
          ctx.font = "600 10.5px IBM Plex Sans, sans-serif"; ctx.fillStyle = e.color; ctx.fillText(e.title, x, top + 9);
          if (e.sub) { ctx.font = "10.5px IBM Plex Sans, sans-serif"; ctx.fillStyle = C.ink; ctx.fillText(e.sub, x, top + 21); }
          right = x + full;
        } else if (e.short) {
          ctx.font = "600 10px IBM Plex Mono, monospace"; const ww = ctx.measureText(e.short).width;
          if (x + ww > w - RIGHT) return;
          ctx.fillStyle = C.panel; ctx.globalAlpha = .8; ctx.fillRect(x - 2, top + 3, ww + 4, 13); ctx.globalAlpha = 1;
          ctx.fillStyle = e.color; ctx.fillText(e.short, x, top + 9); right = x + ww;
        }
      });
      if (!usual) {
        ctx.font = "9.5px IBM Plex Mono, monospace"; ctx.textAlign = "right"; ctx.fillStyle = C.dim;
        ctx.fillText(`learning your usual · ${Math.min(heart.days, USUAL_MIN_DAYS)} of ${USUAL_MIN_DAYS} days`, w - RIGHT - 4, top + h - 16);
      }
      ctx.font = "10px IBM Plex Mono, monospace";
    };

    layout.forEach(({ l, y: top }) => {
      // The header strip: NAME · value at the crosshair (or now) · a line of context.
      const hy = top - HDR + 10, pt = paneText(l, hover ?? data.to);
      ctx.textAlign = "left"; ctx.font = "500 10px IBM Plex Mono, monospace"; ctx.fillStyle = l.kind === "wearable" ? C.dim : C.ink2;
      const name = l.name.toUpperCase(); ctx.fillText(name, LEFT + 2, hy); let hx = LEFT + 2 + ctx.measureText(name).width + 10;
      if (pt.v) { ctx.font = "600 12.5px IBM Plex Sans, sans-serif"; ctx.fillStyle = C.ink; ctx.fillText(pt.v, hx, hy); hx += ctx.measureText(pt.v).width + 8; }
      if (pt.sub) { ctx.font = "11.5px IBM Plex Sans, sans-serif"; ctx.fillStyle = C.ink2; ctx.fillText(pt.sub, hx, hy); }
      ctx.font = "10px IBM Plex Mono, monospace";
      ctx.strokeStyle = C.line; ctx.beginPath(); ctx.moveTo(LEFT, top + l.h + .5); ctx.lineTo(w - RIGHT, top + l.h + .5); ctx.stroke();
      ctx.save(); ctx.beginPath(); ctx.rect(LEFT, top - 2, pw, l.h + 4); ctx.clip();
      if (l.kind === "hr") drawHr(l, top, l.h);
      else if (l.kind === "series" || l.kind === "daily") drawSeries(l, top, l.h, false);
      else if (l.kind === "hyp") {
        // Fitbit-style: four rows (awake at the top, deep at the bottom); a night without stages is one block.
        const rh = (l.h - 4) / 4;
        for (const n of band?.sleep ?? []) {
          if (n.end < t0 || n.start > view.t1) continue;
          const parts = n.stages.length ? n.stages : [{ type: "asleep", start: n.start, end: n.end }];
          for (const st of parts) {
            const x0 = X(st.start), x1 = X(st.end); if (x1 < LEFT || x0 > w - RIGHT) continue;
            ctx.fillStyle = l.color; ctx.globalAlpha = STAGE_ALPHA[st.type] ?? .6;
            ctx.fillRect(x0, top + 2 + (STAGE_ROW[st.type] ?? 2) * rh, Math.max(1, x1 - x0), rh);
          }
          ctx.globalAlpha = 1;
          if (n.nap) { ctx.fillStyle = C.dim; ctx.textAlign = "left"; ctx.font = "9px IBM Plex Mono, monospace"; ctx.fillText("nap", X(n.start), top + 2); ctx.font = "10px IBM Plex Mono, monospace"; }
        }
      }
      else if (l.kind === "feel") {
        // Four rows, each its own 1–10 (owner, 8 Oct: the ribbon was "hard to read"). Up to a week: every
        // check-in, joined within a day; longer: each day's average. A note gets a ring.
        const rh = (l.h - 4) / 4, close = view.span <= 7 * DAY;
        FEELINGS.forEach(([k, , col], ri) => {
          const r0 = top + 2 + ri * rh, Y = (v: number) => r0 + rh - 5 - ((v - 1) / 9) * (rh - 10);
          ctx.strokeStyle = C.line; ctx.setLineDash([1, 4]); ctx.beginPath(); ctx.moveTo(LEFT, Y(5.5) + .5); ctx.lineTo(w - RIGHT, Y(5.5) + .5); ctx.stroke(); ctx.setLineDash([]);
          if (ri) { ctx.strokeStyle = C.line; ctx.beginPath(); ctx.moveTo(LEFT, r0 + .5); ctx.lineTo(w - RIGHT, r0 + .5); ctx.stroke(); }
          ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1.75; if (k === "focus") ctx.setLineDash([4, 3]);
          if (close) {
            for (const run of feelRuns(data.checks, k)) {
              if (run[run.length - 1][0] < t0 - HOUR || run[0][0] > view.t1 + HOUR) continue;
              ctx.beginPath(); run.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1])))); ctx.stroke();
              ctx.setLineDash([]); run.forEach((p) => { ctx.beginPath(); ctx.arc(X(p[0]), Y(p[1]), 3.2, 0, 7); ctx.fill(); }); if (k === "focus") ctx.setLineDash([4, 3]);
              if (view.span <= 3 * DAY) { ctx.font = "500 10px IBM Plex Mono, monospace"; ctx.textAlign = "left"; run.forEach((p) => ctx.fillText(String(p[1]), X(p[0]) + 5, Y(p[1]) - 7)); }
            }
          } else {
            const byDay = new Map<string, number[]>();
            for (const c of data.checks) { const v = c[k]; if (v != null && c.at >= t0 - DAY && c.at <= view.t1 + DAY) { const d = localDay(c.at); byDay.set(d, [...(byDay.get(d) ?? []), v]); } }
            const pts = [...byDay.entries()].sort().map(([d, vs]) => [atMinute(d, 720), vs.reduce((a, b) => a + b, 0) / vs.length] as [number, number]);
            ctx.beginPath(); pts.forEach((p, i) => (i && p[0] - pts[i - 1][0] <= 1.5 * DAY ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1])))); ctx.stroke();
            ctx.setLineDash([]); pts.forEach((p) => { ctx.beginPath(); ctx.arc(X(p[0]), Y(p[1]), view.span <= 30 * DAY ? 2.4 : 1.5, 0, 7); ctx.fill(); });
          }
          ctx.setLineDash([]); ctx.lineWidth = 1;
        });
        if (close) for (const c of data.checks) if (c.note && c.mood != null && c.at >= t0 && c.at <= view.t1) { const Y0 = top + 2 + rh - 5 - ((c.mood - 1) / 9) * (rh - 10); ctx.strokeStyle = C.ink; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(X(c.at), Y0, 7, 0, 7); ctx.stroke(); ctx.lineWidth = 1; }
        if (hovered) { const x = X(hovered.at); ctx.strokeStyle = C.ink; ctx.globalAlpha = .6; ctx.lineWidth = 1.5; ctx.strokeRect(x - 7, top + 1, 14, l.h - 2); ctx.globalAlpha = 1; ctx.lineWidth = 1; }
        ctx.font = "10px IBM Plex Mono, monospace";
      }
      else if (l.kind === "events") {
        // Canvas B's rail: intake on top (meals as bars by kcal, coffee dots, drinks as diamonds), then
        // activity and the stack (workouts as blocks, supplements as ticks).
        const rh = (l.h - 4) / 2, r1 = top + 2, r2 = r1 + rh, near = view.span <= 2 * DAY;
        ctx.strokeStyle = C.line; ctx.beginPath(); ctx.moveTo(LEFT, r2 + .5); ctx.lineTo(w - RIGHT, r2 + .5); ctx.stroke();
        for (const m of data.meals) { if (m.at < t0 || m.at > view.t1) continue; const x = X(m.at), bh = Math.min(rh - 4, (m.kcal / 1100) * (rh - 4)), bw = view.span <= 3 * DAY ? 4 : 2; ctx.fillStyle = C.kcal; ctx.fillRect(x - bw / 2, r2 - 2 - bh, bw, bh); if (near) { ctx.fillStyle = C.ink2; ctx.font = "9.5px IBM Plex Mono, monospace"; ctx.fillText(String(Math.round(m.kcal)), x + 4, r2 - 2 - bh + 5); } }
        for (const d of data.drinks) { if (d.at < t0 || d.at > view.t1) continue; const x = X(d.at), yy = r1 + 7; ctx.fillStyle = C.alc; ctx.beginPath(); ctx.moveTo(x, yy - 5); ctx.lineTo(x + 5, yy); ctx.lineTo(x, yy + 5); ctx.lineTo(x - 5, yy); ctx.closePath(); ctx.fill(); }
        for (const d of data.doses) { if (d.mg <= 0 || d.at < t0 || d.at > view.t1) continue; const x = X(d.at), yy = r1 + 7; ctx.fillStyle = C.panel; ctx.beginPath(); ctx.arc(x, yy, 5, 0, 7); ctx.fill(); ctx.fillStyle = C.caf; ctx.beginPath(); ctx.arc(x, yy, 3.6, 0, 7); ctx.fill(); if (near) { ctx.font = "9.5px IBM Plex Mono, monospace"; ctx.fillText(`${Math.round(d.mg)}`, x + 6, yy - 6); } }
        for (const b of data.workouts) { if (b.end < t0 || b.start > view.t1) continue; const x0 = X(b.start), x1 = X(b.end); ctx.fillStyle = C.gym; ctx.fillRect(x0, r2 + 6, Math.max(3, x1 - x0), rh - 12); if (x1 - x0 > 40 || near) { ctx.fillStyle = x1 - x0 > 40 ? "#1a1a12" : C.gym; ctx.font = "500 10px IBM Plex Sans, sans-serif"; ctx.fillText(b.name, x1 - x0 > 40 ? x0 + 4 : x1 + 4, r2 + rh / 2); } }
        for (const sp of data.supps) { if (sp.at < t0 || sp.at > view.t1) continue; ctx.fillStyle = C.supp; ctx.fillRect(X(sp.at) - 1, r2 + 3, 2, 7); }
        ctx.font = "10px IBM Plex Mono, monospace";
      }
      else if (l.kind === "chips") (l.pts ?? []).forEach(([at, v]) => {
        if (at < t0 - HOUR || at > view.t1) return;
        const x = X(at), cw = view.span <= 7 * DAY ? 22 : 6;
        ctx.fillStyle = l.color; ctx.globalAlpha = .25 + .75 * ((v - 1) / 9); ctx.fillRect(x - cw / 2, top + 2, cw, l.h - 4); ctx.globalAlpha = 1;
        if (cw > 10) { ctx.fillStyle = v >= 7 ? "#10181a" : C.ink; ctx.textAlign = "center"; ctx.fillText(String(v), x, top + l.h / 2); }
      });
      if (l.id === "caf") [CAF_SLEEP.lowBelowMg, CAF_SLEEP.higherFromMg].forEach((v) => { const top_ = lim(l)[1]; if (v > top_) return; const yy = yOf(top, l.h, 0, top_, v); ctx.strokeStyle = C.caf; ctx.globalAlpha = .45; ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.moveTo(LEFT, yy); ctx.lineTo(w - RIGHT, yy); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1; ctx.fillStyle = C.caf; ctx.textAlign = "right"; ctx.font = "9px IBM Plex Mono, monospace"; ctx.fillText(`${v}`, w - RIGHT - 3, yy - 6); ctx.font = "10px IBM Plex Mono, monospace"; });
      if (host && l.id === host.id) overlays.forEach((o) => drawSeries(o, top, l.h, true));
      ctx.restore();
      // Row names in the right margin, outside the pane's clip.
      if (l.kind === "feel") FEELINGS.forEach(([, name, col], ri) => { const rh = (l.h - 4) / 4; ctx.font = "500 10px IBM Plex Sans, sans-serif"; ctx.fillStyle = col; ctx.textAlign = "left"; ctx.fillText(name, w - RIGHT + 5, top + 2 + ri * rh + rh / 2); });
      if (l.kind === "events") { const rh = (l.h - 4) / 2; ctx.font = "9px IBM Plex Mono, monospace"; ctx.fillStyle = C.dim; ctx.textAlign = "left"; ctx.fillText("intake", w - RIGHT + 5, top + 2 + rh / 2); ctx.fillText("active", w - RIGHT + 5, top + 2 + rh * 1.5); }
      ctx.font = "10px IBM Plex Mono, monospace";
      // Sleep stage names in the right margin, where other lanes put their "on top" axis.
      if (l.kind === "hyp") { ctx.fillStyle = C.dim; ctx.font = "8.5px IBM Plex Mono, monospace"; ctx.textAlign = "left"; STAGES.forEach((n, i) => ctx.fillText(n === "rem" ? "REM" : n, w - RIGHT + 5, top + 2 + (i + .5) * (l.h - 4) / 4)); ctx.font = "10px IBM Plex Mono, monospace"; }
      // Axis values sit just inside the plot so they never collide with the lane's name.
      if (l.lo != null && l.hi != null && l.kind !== "feel" && l.kind !== "hr" && l.kind !== "chips") { const [lo, hi] = lim(l); ctx.textAlign = "left"; ctx.fillStyle = C.dim; ctx.font = "9px IBM Plex Mono, monospace"; ctx.fillText(String(hi), LEFT + 3, top + 5); ctx.fillText(String(lo), LEFT + 3, top + l.h - 4); ctx.font = "10px IBM Plex Mono, monospace"; }
      if (host && l.id === host.id) overlays.forEach((o, k) => { const [lo, hi] = lim(o); ctx.textAlign = "left"; ctx.fillStyle = o.color; ctx.fillText(o.kind === "feel" ? "10" : `${hi}${o.unit}`, w - RIGHT + 5, top + 4 + k * 12); ctx.fillText(o.kind === "feel" ? "1" : String(lo), w - RIGHT + 5, top + l.h - 3 - k * 12); });
    });
    // now + crosshair
    const nx = X(data.to); if (nx >= LEFT && nx <= w - RIGHT) { ctx.strokeStyle = C.ink2; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(nx + .5, TOP - 6); ctx.lineTo(nx + .5, H - 4); ctx.stroke(); ctx.setLineDash([]); }
    if (hover != null) { const hx = X(hover); ctx.strokeStyle = C.ink; ctx.globalAlpha = .45; ctx.beginPath(); ctx.moveTo(hx + .5, TOP - 6); ctx.lineTo(hx + .5, H - 4); ctx.stroke(); ctx.globalAlpha = 1; }
    // The crosshair's time, as a chip on the time axis.
    if (hover != null) {
      const hx = X(hover), txt = `${dayLabel(hover).slice(0, 3)} ${clock(hover)}`;
      ctx.font = "500 10.5px IBM Plex Mono, monospace"; const tw = ctx.measureText(txt).width + 10, cx = Math.max(LEFT + tw / 2, Math.min(w - RIGHT - tw / 2, hx));
      ctx.fillStyle = C.ink; ctx.fillRect(cx - tw / 2, 2, tw, 16); ctx.fillStyle = C.panel; ctx.textAlign = "center"; ctx.fillText(txt, cx, 10); ctx.font = "10px IBM Plex Mono, monospace";
    }
  });

  const tAt = (clientX: number) => { const r = cv.current!.getBoundingClientRect(), pw = r.width - LEFT - RIGHT, x = clientX - r.left; return x >= LEFT && x <= r.width - RIGHT ? view.t1 - view.span + ((x - LEFT) / pw) * view.span : null; };
  const onWheel = (e: WheelEvent) => {
    const r = cv.current!.getBoundingClientRect(), pw = r.width - LEFT - RIGHT;
    if (e.ctrlKey || e.metaKey) { e.preventDefault(); const at = tAt(e.clientX) ?? view.t1 - view.span / 2; const span = view.span * Math.exp(e.deltaY * .002); const frac = (view.t1 - at) / view.span; setView(clampView(at + frac * span, span)); }
    else if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) { e.preventDefault(); setView(clampView(view.t1 + (e.deltaX / pw) * view.span, view.span)); }
  };
  useEffect(() => { const el = cv.current; if (!el) return; el.addEventListener("wheel", onWheel, { passive: false }); return () => el.removeEventListener("wheel", onWheel); });

  const t = hover ?? data.to;
  const dayOf = days?.find((d) => d.day === localDay(t));
  const f1 = (v: number | null | undefined) => (v == null ? "–" : v.toFixed(1));
  const takenThatDay = data.supps.filter((x) => localDay(x.at) === localDay(t)).map((x) => supplements.find((s) => s.id === x.suppId)?.name.split(" ")[0] ?? "?");
  const dayRows: [string, string][] = dayOf ? [
    ["Feelings, avg", dayOf.mood != null || dayOf.energy != null ? `${f1(dayOf.mood)} · ${f1(dayOf.energy)} · ${f1(dayOf.stress)}` : "no check-ins"],
    ["kcal · protein", dayOf.kcal != null ? `${Math.round(dayOf.kcal).toLocaleString("en-GB")} · ${Math.round(dayOf.protein ?? 0)} g` : "not logged"],
    ["Caffeine at bedtime", dayOf.cafBed != null ? `${Math.round(dayOf.cafBed)} mg` : "–"],
    ...(dayOf.drinks ? [["Drinks", `${dayOf.drinks.toFixed(1)}`] as [string, string]] : []),
    ["Training", dayOf.trained ? (data.workouts.find((b) => localDay(b.start) === dayOf.day)?.name ?? "yes") : "rest day"],
    ["Supplements", takenThatDay.length ? [...new Set(takenThatDay)].join(" · ") : "none ticked"],
  ] : [];
  // The band's night before the day you're pointing at: the main sleep that ended that day.
  const bandNight = band ? lastNight(band.sleep.filter((n) => localDay(n.end) === localDay(t)), atMinute(localDay(t), 24 * 60)) : null;
  const nightRows: [string, string][] = [
    ...(bandNight ? [["Band", `${clock(bandNight.start)}–${clock(bandNight.end)}${bandNight.asleepMin != null ? ` · ${hm(bandNight.asleepMin)} asleep` : ""}`] as [string, string]] : []),
    ...(bandNight && bandNight.stageMin.deep != null ? [["Deep · REM", `${Math.round(bandNight.stageMin.deep)} · ${Math.round(bandNight.stageMin.rem ?? 0)} min`] as [string, string]] : []),
    ...(band?.rhr[localDay(t)] != null ? [["Resting HR", `${band.rhr[localDay(t)]} bpm`] as [string, string]] : []),
    ...(dayOf?.sleep != null ? [["Slept, your rating", `${dayOf.sleep}/10`] as [string, string]] : []),
  ];
  const rows: [string, string][] = [
    ["Caffeine", `${Math.round(valueAt(data.caffeine, t)?.[1] ?? 0)} mg`],
    ["Alcohol", `${(valueAt(data.alcohol, t)?.[1] ?? 0).toFixed(1)} g`],
    ["Last meal", (() => { const m = [...data.meals].reverse().find((x) => x.at <= t && x.at > t - 6 * HOUR); return m ? `${clock(m.at)} · ${Math.round(m.kcal)} kcal` : "—"; })()],
    ["Workout", (() => {
      const g = heart?.gyms.find((x) => t >= x.start && t <= (x.backAt ?? x.end));
      if (g) return [g.name, t > g.end ? "recovering" : "", g.peak != null ? `peak ${g.peak}` : "", g.avg != null ? `avg ${Math.round(g.avg)}` : "", g.backMin != null ? `back in ${g.backMin} min` : ""].filter(Boolean).join(" · ");
      return data.workouts.find((b) => b.start <= t && b.end >= t)?.name ?? "—";
    })()],
    ["Weight", (() => { const v = valueAt(data.weight, t); return v ? `${v[1]} kg` : "—"; })()],
    ["Feelings", (() => { const c = hovered ?? latestCheck(data.checks, t); return c ? `${clock(c.at)} · ${feelText(c)}` : "—"; })()],
    ...(() => { const c = hovered ?? latestCheck(data.checks, t); return [...(c?.doing?.length ? [["Up to", c.doing.join(", ")] as [string, string]] : []), ...(c?.note ? [["Note", `“${c.note}”`] as [string, string]] : [])]; })(),
    ["Heart rate", !band?.hr.length || !heart ? "no wearable" : (() => {
      const v = valueAt((band.hr as unknown as Point[]), t);
      if (!v || t - v[0] >= heart.join) return "—";
      const u = usualAt(heart.usual, t);
      return `${v[1]} bpm${u ? ` · ${sgnInt(v[1] - u.mid)} vs usual ${Math.round(u.mid)}` : ""}`;
    })()],
    ...(() => {
      if (!heart) return [];
      const c = heart.coffees.find((x) => t >= x.at && t <= x.end);
      if (c) return [["After coffee", `${clock(c.at)}${c.delta != null ? ` · ${sgnInt(c.delta)} bpm vs ${c.vs === "usual" ? "usual" : "the half hour before"}` : " · band off"}${c.peakAt ? ` · peak ${clock(c.peakAt)}` : ""}`] as [string, string]];
      return [];
    })(),
    ...(band?.sleep.length && stageAt(band.sleep, t) ? [["Sleep", stageAt(band.sleep, t)!] as [string, string]] : []),
  ];
  // The overview: the whole history, small, with the window you're looking at. Drag it, or tap to jump.
  const ov = useRef<HTMLCanvasElement>(null);
  const ovDrag = useRef<{ dx: number } | null>(null);
  const OVH = 48;
  const ovX = (t: number) => LEFT + ((t - minT) / Math.max(1, maxT - minT)) * Math.max(10, w - LEFT - RIGHT);
  const ovT = (x: number) => minT + ((x - LEFT) / Math.max(10, w - LEFT - RIGHT)) * (maxT - minT);
  useEffect(() => {
    const el = ov.current; if (!el) return;
    const dpr = window.devicePixelRatio || 1;
    el.width = Math.round(w * dpr); el.height = Math.round(OVH * dpr); el.style.height = `${OVH}px`;
    const ctx = el.getContext("2d")!; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, OVH);
    const pw = Math.max(10, w - LEFT - RIGHT), top = 6, h = OVH - 20;
    ctx.fillStyle = C.line; ctx.globalAlpha = .5; ctx.fillRect(LEFT, top, pw, h); ctx.globalAlpha = 1;
    const b = buckets(data.caffeine, minT, maxT, Math.floor(pw)), hi = Math.max(100, ...b.map((k) => k?.max ?? 0));
    ctx.fillStyle = C.caf; ctx.globalAlpha = .55;
    b.forEach((k, i) => { if (!k || k.max <= 0) return; const bh = (k.max / hi) * h; ctx.fillRect(LEFT + i, top + h - bh, 1, bh); });
    ctx.globalAlpha = 1;
    for (const c of data.checks) if (c.mood != null) { ctx.fillStyle = C.mood; ctx.fillRect(ovX(c.at) - .5, top + h - 2 - ((c.mood - 1) / 9) * (h - 4), 1.6, 2); }
    const a = ovX(view.t1 - view.span), z = ovX(view.t1);
    ctx.fillStyle = C.ink; ctx.globalAlpha = .1; ctx.fillRect(a, top - 3, Math.max(3, z - a), h + 6); ctx.globalAlpha = 1;
    ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.strokeRect(a + .5, top - 2.5, Math.max(3, z - a) - 1, h + 5); ctx.lineWidth = 1;
    ctx.font = "9.5px IBM Plex Mono, monospace"; ctx.fillStyle = C.dim; ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left"; ctx.fillText(dayLabel(minT), LEFT, OVH - 1); ctx.textAlign = "right"; ctx.fillText(dayLabel(data.to), w - RIGHT, OVH - 1);
    ctx.textAlign = "right"; ctx.fillText("all", LEFT - 6, top + h / 2 + 3);
  });
  const ovMove = (clientX: number, start: boolean) => {
    const r = ov.current!.getBoundingClientRect(), x = clientX - r.left, a = ovX(view.t1 - view.span), z = ovX(view.t1);
    if (start) ovDrag.current = { dx: x >= a && x <= z ? x - (a + z) / 2 : 0 };
    const mid = ovT(x - (ovDrag.current?.dx ?? 0));
    setView(clampView(mid + view.span / 2, view.span));
  };
  const presets: [string, number][] = [["1D", DAY], ["3D", 3 * DAY], ["7D", 7 * DAY], ["30D", 30 * DAY], ["90D", 90 * DAY], ["All", maxT - minT]];

  return (
    <section className={`master${big ? " big" : ""}`} id="ins-timeline" data-sec="timeline" aria-label="Master graph" data-scale={scale}>
      <div className="mg-main">
        <div className="mg-bar">
          <h2 className="mg-title">Everything, on one timeline</h2>
          <div className="iseg" role="group" aria-label="Time range">
            {presets.map(([n, s]) => <button key={n} type="button" aria-pressed={Math.abs(view.span - s) < MIN} onClick={() => setView(clampView(maxT, s))}>{n}</button>)}
          </div>
          <button type="button" className="ibtn" aria-label="Zoom in" onClick={() => setView(clampView(view.t1 - view.span * .19, view.span / 1.6))}>＋</button>
          <button type="button" className="ibtn" aria-label="Zoom out" onClick={() => setView(clampView(view.t1 + view.span * .3, view.span * 1.6))}>－</button>
          <span className="range-lbl">{dayLabel(view.t1 - view.span)} {clock(view.t1 - view.span)} → {dayLabel(view.t1)} {clock(view.t1)}</span>
          <button type="button" className="ibtn" onClick={() => setView(clampView(maxT, view.span))}>Now</button>
          {heart && <div className="iseg" role="group" aria-label="Heart-rate scale">
            <button type="button" aria-pressed={scale === "fit"} onClick={() => setScale("fit")} title="Fit the scale to what's on screen">Fit</button>
            <button type="button" aria-pressed={scale === "log"} onClick={() => setScale("log")} title="Log scale: high values squeezed, so a workout doesn't flatten the rest">Log</button>
          </div>}
          <button type="button" className="ibtn mg-big" aria-pressed={big} onClick={() => setBig(!big)}>{big ? "✕ Close" : "⤢ Full screen"}</button>
        </div>
        <canvas ref={cv} className="mg-canvas" aria-label="Master graph of every tracked metric over time"
          data-lanes={layout.map((r) => r.l.id).join(",")} data-plot={`${LEFT},${RIGHT}`} data-view={`${Math.round(view.t1 - view.span)},${Math.round(view.t1)}`} data-feel={feelRow ? `${feelRow.y},${feelRow.l.h}` : ""}
          data-hr={heart ? `${heart.usual ? "usual" : "learning"},${heart.coffees.filter((c) => c.end >= view.t1 - view.span && c.at <= view.t1).length},${heart.gyms.filter((g) => g.end >= view.t1 - view.span && g.start <= view.t1).length},${layout.find((r) => r.l.kind === "hr")?.y ?? ""},${layout.find((r) => r.l.kind === "hr")?.l.h ?? ""},${(fitted.get("hr") ?? []).join("-")}` : ""}
          onPointerDown={(e) => { drag.current = { x: e.clientX, t1: view.t1 }; e.currentTarget.setPointerCapture(e.pointerId); setHover(tAt(e.clientX)); setHoverY(e.clientY - e.currentTarget.getBoundingClientRect().top); }}
          onPointerMove={(e) => { if (drag.current && Math.abs(e.clientX - drag.current.x) > 4) { const pw = e.currentTarget.getBoundingClientRect().width - LEFT - RIGHT; setView(clampView(drag.current.t1 - ((e.clientX - drag.current.x) / pw) * view.span, view.span)); } setHover(tAt(e.clientX)); setHoverY(e.clientY - e.currentTarget.getBoundingClientRect().top); }}
          onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onPointerLeave={() => { if (!drag.current) setHover(null); }} />
        <canvas ref={ov} className="mg-overview" role="slider" aria-label="Whole history: drag the window or tap to jump" aria-valuemin={minT} aria-valuemax={maxT} aria-valuenow={Math.round(view.t1)}
          data-window={`${Math.round(view.t1 - view.span)},${Math.round(view.t1)}`}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); ovMove(e.clientX, true); }}
          onPointerMove={(e) => { if (ovDrag.current) ovMove(e.clientX, false); }}
          onPointerUp={() => { ovDrag.current = null; }} onPointerCancel={() => { ovDrag.current = null; }} />
        <div className="mg-bar mg-key"><span className="hint-i"><b>Feelings</b> · each its own row, 1–10 · {view.span <= 7 * DAY ? "dots are check-ins, joined within a day · ring = a note" : "each day’s average · zoom to a week or less for each check-in"} · <b>Events</b> <i className="sw" style={{ background: C.caf, borderRadius: 9 }} />coffee <i className="sw" style={{ background: C.kcal }} />meal <i className="sw" style={{ background: C.alc, transform: "rotate(45deg) scale(.8)" }} />drink <i className="sw ln" style={{ background: C.supp }} />supplement <i className="sw" style={{ background: C.gym }} />workout</span></div>
        <div className="mg-bar"><span className="hint-i">Point anywhere to read every pane at that moment · drag the chart or the overview to move · ⌘/Ctrl + wheel to zoom · tick panes on and off; "on top" draws a line over {host?.name.toLowerCase() ?? "the first pane"} with its own axis.</span></div>
      </div>
      <aside className="mg-side">
        <div className="legend">
          <button type="button" className="lanes-t" aria-expanded={lanesOpen} onClick={() => setLanesOpen(!lanesOpen)}><span className="k">Lanes</span><span className="dimt">{lanes.filter((l) => l.kind !== "wearable" && on[l.id]).length} on {lanesOpen ? "▴" : "▾"}</span></button>
          {lanesOpen && lanes.map((l) => (
            <div className="lg" key={l.id}>
              <input type="checkbox" id={`lg-${l.id}`} checked={l.kind === "wearable" ? false : !!on[l.id]} disabled={l.kind === "wearable"} onChange={(e) => setOn({ ...on, [l.id]: e.target.checked })} />
              <i style={{ background: l.color, opacity: l.kind === "wearable" ? .35 : 1 }} />
              <label htmlFor={`lg-${l.id}`} className={l.kind === "wearable" ? "off" : ""}>{l.name}{l.kind === "wearable" ? " · wearable" : ""}</label>
              {l.overlay && host && l.id !== host.id ? <button type="button" aria-pressed={!!over[l.id]} onClick={() => setOver({ ...over, [l.id]: !over[l.id] })}>on top</button> : <span />}
            </div>
          ))}
        </div>
        <div className="readout">
          <span className="t">{hovered ? `Check-in · ${dayLabel(hovered.at)} ${clock(hovered.at)}` : `${dayLabel(t)} · ${clock(t)}${hover == null ? " (now)" : ""}`}</span>
          {rows.map(([a, b]) => <div key={a}><span>{a}</span><b>{b}</b></div>)}
          {dayRows.length > 0 && <><span className="sec">{dayLabel(t)} — the day</span>{dayRows.map(([a, b]) => <div key={a}><span>{a}</span><b>{b}</b></div>)}</>}
          {nightRows.length > 0 && <><span className="sec">Night before</span>{nightRows.map(([a, b]) => <div key={a}><span>{a}</span><b>{b}</b></div>)}</>}
        </div>
      </aside>
    </section>
  );
}
