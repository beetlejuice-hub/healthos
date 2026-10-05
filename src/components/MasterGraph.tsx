import { useEffect, useMemo, useRef, useState } from "react";
import type { Lanes } from "../lib/insights";
import { buckets, valueAt, type Point } from "../lib/series";
import { atMinute, clock, dayLabel, localDay, DAY, HOUR, MIN } from "../lib/time";
import type { Supplement } from "../lib/types";
import type { GlanceDay } from "../lib/glance";
import { feelRuns, feelText, latestCheck, lifeBars, nearestCheck, ribbonRuns, ribbonWidth, stressMix, type Check, type FeelK } from "../lib/feelgraph";
import { CAF_SLEEP } from "../lib/caffeine-sleep";

/**
 * One timeline for everything (owner: "one master graph that has everything on it and things can
 * be ticked on and off"). Thin stacked lanes share the time axis; any line lane can be drawn on
 * top of the first one with its own axis ("caffeine on heart rate"). Drag or swipe to go back in
 * time; ⌘/Ctrl + wheel zooms. Canvas, because a year of data is too many SVG nodes.
 */

/** "feel": the How you felt lane — owner, 5 Oct, picked versions C (feeling ribbon) + A (life chart) of the four. "chips": sleep ratings. */
type Kind = "series" | "daily" | "sticks" | "blocks" | "ticks" | "wearable" | "feel" | "chips";
type Lane = { id: string; name: string; unit: string; color: string; h: number; kind: Kind; pts?: Point[]; lo?: number; hi?: number; area?: boolean; overlay?: boolean };

/** A colour token; Insights tokens live on the screen, so read them there. */
const cssVar = (v: string) => getComputedStyle(document.querySelector(".app") ?? document.documentElement).getPropertyValue(v).trim() || "#888";
const RIGHT = 46, TOP = 22, GAP = 7;
/** The label column: room for each lane's value at the cursor on a laptop, narrower on a phone. */
const leftFor = (w: number) => (w >= 640 ? 136 : 96);
/** Calm end of the stress colour (a cool grey-blue); the tense end is the heart-rate red. */
const CALM = "#56717c";
const mixHex = (a: string, b: string, f: number) => { const p = (h: string) => { const n = parseInt(h.replace("#", "").slice(0, 6), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }; const [x, y] = [p(a), p(b)]; return `rgb(${x.map((v, i) => Math.round(v * (1 - f) + y[i] * f)).join(",")})`; };

/** "Show on graph" from a scout pattern: these lanes, on top of each other, these days highlighted. */
export type GraphFocus = { key: string; lanes: string[]; days: string[] };

export function MasterGraph({ data, supplements, focus, days }: { data: Lanes; supplements: Supplement[]; focus?: GraphFocus | null; /** Per-day numbers for the readout's "the day" and "last night" (lib/glance). */ days?: GlanceDay[] }) {
  const C = useMemo(() => ({ up: cssVar("--g-now"), down: cssVar("--g-down"), line2: cssVar("--i-line-2"), ok: cssVar("--ok"), caf: cssVar("--caf"), alc: cssVar("--alc"), kcal: cssVar("--kcal"), gym: cssVar("--gym"), supp: cssVar("--supp"), wt: cssVar("--wt"), mood: cssVar("--mood"), hr: cssVar("--hr"), line: cssVar("--i-line"), ink: cssVar("--i-ink"), ink2: cssVar("--i-ink-2"), dim: cssVar("--i-dim") }), []);
  const lanes: Lane[] = useMemo(() => {
    const range = (pts: Point[], pad: number, floor?: [number, number]): [number, number] => {
      if (!pts.length) return floor ?? [0, 1];
      const v = pts.map((p) => p[1]); return [Math.floor(Math.min(...v) - pad), Math.ceil(Math.max(...v) + pad)];
    };
    const cafHi = Math.max(200, Math.ceil(Math.max(0, ...data.caffeine.map((p) => p[1])) / 50) * 50);
    const alcHi = Math.max(20, Math.ceil(Math.max(0, ...data.alcohol.map((p) => p[1])) / 10) * 10);
    const [wLo, wHi] = range(data.weight, 0.5, [70, 90]);
    return [
      { id: "feel", name: "How you felt", unit: "you · 1–10", color: C.mood, h: 112, kind: "feel", pts: data.mood, lo: 0.5, hi: 10.5 },
      { id: "slept", name: "Sleep rating", unit: "/10", color: C.ok, h: 22, kind: "chips", pts: data.sleep, lo: 1, hi: 10 },
      { id: "hr", name: "Heart rate", unit: "bpm", color: C.hr, h: 24, kind: "wearable" },
      { id: "sleep", name: "Sleep stages", unit: "", color: C.hr, h: 24, kind: "wearable" },
      { id: "caf", name: "Caffeine in body", unit: "mg", color: C.caf, h: 64, kind: "series", pts: data.caffeine, lo: 0, hi: cafHi, area: true, overlay: true },
      { id: "alc", name: "Alcohol in body", unit: "g", color: C.alc, h: 40, kind: "series", pts: data.alcohol, lo: 0, hi: alcHi, area: true, overlay: true },
      { id: "meals", name: "Meals", unit: "kcal", color: C.kcal, h: 32, kind: "sticks" },
      { id: "gym", name: "Workouts", unit: "", color: C.gym, h: 20, kind: "blocks" },
      { id: "supps", name: "Supplements", unit: "", color: C.supp, h: Math.max(20, supplements.length * 7), kind: "ticks" },
      { id: "wt", name: "Weight", unit: "kg", color: C.wt, h: 36, kind: "daily", pts: data.weight, lo: wLo, hi: wHi, overlay: true },
      { id: "kcal", name: "Calories per day", unit: "kcal", color: C.kcal, h: 36, kind: "daily", pts: data.kcalDay, lo: 0, hi: Math.max(3000, Math.ceil(Math.max(0, ...data.kcalDay.map((p) => p[1])) / 500) * 500), overlay: true },
    ];
  }, [data, supplements.length, C]);

  const [on, setOn] = useState<Record<string, boolean>>({ caf: true, alc: true, meals: true, gym: true, supps: false, wt: true, feel: true, slept: true, kcal: false });
  const [over, setOver] = useState<Record<string, boolean>>({ energy: false });
  const [view, setView] = useState({ t1: data.to + 90 * MIN, span: 3 * DAY });
  const [hover, setHover] = useState<number | null>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; t1: number } | null>(null);
  const [w, setW] = useState(900);
  const LEFT = leftFor(w);

  // A pattern asked to be shown: only its lanes, the second drawn over the first where it can be,
  // and the view widened to cover the days that show it.
  useEffect(() => {
    if (!focus) return;
    const FEEL = new Set(["mood", "energy", "focus", "stress"]);
    const want = new Set(focus.lanes.map((id) => (FEEL.has(id) ? "feel" : id)));
    setOn(Object.fromEntries(lanes.map((l) => [l.id, want.has(l.id)])));
    const series = focus.lanes.find((id) => lanes.find((l) => l.id === id)?.kind === "series");
    setOver(series ? Object.fromEntries([...want].filter((id) => id !== series && lanes.find((l) => l.id === id)?.overlay).map((id) => [id, true])) : {});
    const firstDay = focus.days.length ? atMinute([...focus.days].sort()[0], 0) : data.to - 14 * DAY;
    setView(clampView(data.to + 90 * MIN, Math.max(7 * DAY, data.to - firstDay + 2 * DAY)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.key]);

  const minT = data.from, maxT = data.to + 90 * MIN;
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
  let y = TOP; const layout = drawn.map((l) => { const r = { l, y }; y += l.h + GAP; return r; });
  const H = y + 4;
  const feelLanes = layout.filter((r) => r.l.kind === "feel");
  const feelRow = feelLanes[0];
  const [hoverY, setHoverY] = useState<number | null>(null);
  // The check-in under the finger or cursor (within ~14 px), when pointing inside the Feelings lane.
  const pwNow = Math.max(10, w - LEFT - RIGHT);
  const overFeel = hoverY != null ? feelLanes.find((r) => hoverY >= r.y - 4 && hoverY <= r.y + r.l.h + 4) : undefined;
  const hovered: Check | null = hover != null && overFeel && view.span <= 7 * DAY
    ? nearestCheck(data.checks.filter((c) => c.mood != null), hover, (14 / pwNow) * view.span) : null;

  /** What a lane reads at time t, for the label column (null: nothing to say). */
  const laneValue = (l: Lane, t: number): string | null => {
    if (l.id === "caf") return `${Math.round(valueAt(data.caffeine, t)?.[1] ?? 0)}`;
    if (l.id === "alc") { const v = valueAt(data.alcohol, t)?.[1] ?? 0; return v >= 0.05 ? v.toFixed(1) : "0"; }
    if (l.id === "wt" || l.id === "kcal") { const v = valueAt(l.pts ?? [], t); return v && t - v[0] < 3 * DAY ? (l.id === "wt" ? v[1].toFixed(1) : Math.round(v[1]).toLocaleString("en-GB")) : null; }
    if (l.id === "slept") { const v = valueAt(l.pts ?? [], t); return v && t - v[0] < DAY ? String(v[1]) : null; }
    if (l.id === "meals") { const m = [...data.meals].reverse().find((x) => x.at <= t && x.at > t - 5 * HOUR); return m ? String(Math.round(m.kcal)) : null; }
    if (l.kind === "feel") { const c = hovered ?? latestCheck(data.checks, t); return c && t - c.at < 6 * HOUR && c.mood != null ? `mood ${c.mood}` : null; }
    return null;
  };

  useEffect(() => {
    const el = cv.current; if (!el) return;
    const dpr = window.devicePixelRatio || 1;
    el.width = Math.round(w * dpr); el.height = Math.round(H * dpr); el.style.height = `${H}px`;
    const ctx = el.getContext("2d")!; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, H);
    const t0 = view.t1 - view.span, pw = Math.max(10, w - LEFT - RIGHT);
    const X = (t: number) => LEFT + ((t - t0) / view.span) * pw;
    ctx.font = "10px IBM Plex Mono, monospace"; ctx.textBaseline = "middle";

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
    const drawSeries = (l: Lane, top: number, h: number, asOverlay: boolean) => {
      const lo = l.lo ?? 0, hi = l.hi ?? 1, pts = l.pts ?? [];
      if (l.kind === "series") {
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
      } else if (l.kind === "feel") {
        const Y = (v: number) => yOf(top, h, lo, hi, v);
        ctx.strokeStyle = l.color; ctx.fillStyle = l.color; ctx.lineWidth = 1.5; if (asOverlay) ctx.setLineDash([4, 3]);
        for (const run of feelRuns(data.checks, l.id as FeelK)) {
          if (run[run.length - 1][0] < t0 - HOUR || run[0][0] > view.t1 + HOUR) continue;
          ctx.beginPath(); run.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1])))); ctx.stroke();
          const r = view.span <= 7 * DAY ? 3.6 : view.span <= 30 * DAY ? 2.6 : 1.6;
          run.forEach((p) => { ctx.beginPath(); ctx.arc(X(p[0]), Y(p[1]), r, 0, 7); ctx.fill(); });
        }
        ctx.setLineDash([]); ctx.lineWidth = 1;
      } else {
        const inView = pts.filter((p) => p[0] >= t0 - 3 * DAY && p[0] <= view.t1 + 3 * DAY);
        const Y = (v: number) => yOf(top, h, lo, hi, v);
        ctx.strokeStyle = l.color; ctx.lineWidth = asOverlay ? 1.75 : 1.25; if (asOverlay) ctx.setLineDash([5, 3]);
        ctx.beginPath(); inView.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1])))); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = l.color; inView.forEach((p) => { ctx.beginPath(); ctx.arc(X(p[0]), Y(p[1]), view.span < 20 * DAY ? 2.5 : 1.3, 0, 7); ctx.fill(); });
        if (view.span < 8 * DAY) { ctx.textAlign = "left"; inView.forEach((p) => ctx.fillText(String(Math.round(p[1] * 10) / 10), X(p[0]) + 5, Y(p[1]) - 6)); }
      }
    };

    layout.forEach(({ l, y: top }) => {
      ctx.textAlign = "left"; ctx.font = "11px IBM Plex Sans, sans-serif"; ctx.fillStyle = l.kind === "wearable" ? C.dim : C.ink2; ctx.fillText(l.name, 8, top + 8);
      ctx.font = "10px IBM Plex Mono, monospace"; ctx.fillStyle = C.dim; if (l.unit) ctx.fillText(l.unit, 8, top + 20);
      const lv = LEFT >= 120 ? laneValue(l, hover ?? data.to) : null;
      if (lv) { ctx.font = "600 12px IBM Plex Sans, sans-serif"; ctx.fillStyle = C.ink; ctx.textAlign = "right"; ctx.fillText(lv, LEFT - 8, top + (l.h >= 34 ? l.h - 9 : 8)); ctx.textAlign = "left"; ctx.font = "10px IBM Plex Mono, monospace"; }
      ctx.strokeStyle = C.line; ctx.beginPath(); ctx.moveTo(LEFT, top + l.h + .5); ctx.lineTo(w - RIGHT, top + l.h + .5); ctx.stroke();
      ctx.save(); ctx.beginPath(); ctx.rect(LEFT, top - 2, pw, l.h + 4); ctx.clip();
      if (l.kind === "wearable") { ctx.fillStyle = C.dim; ctx.textAlign = "left"; ctx.fillText("Connect a wearable", LEFT + 8, top + l.h / 2); }
      else if (l.kind === "series" || l.kind === "daily") drawSeries(l, top, l.h, false);
      else if (l.kind === "sticks") data.meals.forEach((m) => { if (m.at < t0 || m.at > view.t1) return; const x = X(m.at), bh = Math.min(l.h, (m.kcal / 1100) * l.h), bw = view.span <= 3 * DAY ? 4 : 2; ctx.fillStyle = l.color; ctx.fillRect(x - bw / 2, top + l.h - bh, bw, bh); if (view.span <= 3 * DAY) { ctx.fillStyle = C.ink2; ctx.textAlign = "left"; ctx.fillText(String(Math.round(m.kcal)), x + 4, top + l.h - bh + 5); } });
      else if (l.kind === "blocks") data.workouts.forEach((b) => { if (b.end < t0 || b.start > view.t1) return; const x0 = X(b.start), x1 = X(b.end); ctx.fillStyle = l.color; ctx.globalAlpha = .85; ctx.fillRect(x0, top + 3, Math.max(2, x1 - x0), l.h - 6); ctx.globalAlpha = 1; if (x1 - x0 > 50) { ctx.fillStyle = "#1a1a12"; ctx.textAlign = "left"; ctx.fillText(b.name, x0 + 4, top + l.h / 2); } });
      else if (l.kind === "feel") {
        if (view.span <= 7 * DAY) {
          // C · feeling ribbon: height = mood, thickness = energy, colour = stress (calm grey → tense red).
          // Joined within a day only, so a night is a gap; notes ringed.
          const Y = (v: number) => yOf(top + 4, l.h - 8, 0.5, 10.5, v), col = (s?: number) => { const m = stressMix(s); return m == null ? C.ink2 : mixHex(CALM, C.hr, m); };
          [2, 5, 8].forEach((v) => { ctx.strokeStyle = C.line; ctx.setLineDash([1, 4]); ctx.beginPath(); ctx.moveTo(LEFT, Y(v)); ctx.lineTo(w - RIGHT, Y(v)); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = C.dim; ctx.textAlign = "left"; ctx.font = "9px IBM Plex Mono, monospace"; ctx.fillText(String(v), LEFT + 3, Y(v) - 5); ctx.font = "10px IBM Plex Mono, monospace"; });
          for (const run of ribbonRuns(data.checks)) {
            if (run[run.length - 1].at < t0 - DAY || run[0].at > view.t1 + DAY) continue;
            for (let i = 1; i < run.length; i++) {
              const a = run[i - 1], b = run[i], x1 = X(a.at), x2 = X(b.at), y1 = Y(a.mood!), y2 = Y(b.mood!), w1 = ribbonWidth(a.energy) / 2, w2 = ribbonWidth(b.energy) / 2, xm = (x1 + x2) / 2;
              const g = ctx.createLinearGradient(x1, 0, x2, 0); g.addColorStop(0, col(a.stress)); g.addColorStop(1, col(b.stress)); ctx.fillStyle = g;
              ctx.beginPath(); ctx.moveTo(x1, y1 - w1); ctx.bezierCurveTo(xm, y1 - w1, xm, y2 - w2, x2, y2 - w2); ctx.lineTo(x2, y2 + w2); ctx.bezierCurveTo(xm, y2 + w2, xm, y1 + w1, x1, y1 + w1); ctx.closePath(); ctx.fill();
            }
            for (const c of run) { const x = X(c.at), y = Y(c.mood!), r = ribbonWidth(c.energy) / 2 + .5; ctx.fillStyle = col(c.stress); ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); if (c.note) { ctx.strokeStyle = C.ink; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x, y, r + 4, 0, 7); ctx.stroke(); ctx.lineWidth = 1; } }
          }
          if (hovered?.mood != null) { const x = X(hovered.at), y = Y(hovered.mood), r = ribbonWidth(hovered.energy) / 2 + 7; ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke(); ctx.lineWidth = 1; }
        } else {
          // A · life chart: each day's mood above or below your own average, energy and stress underneath.
          const { base, days } = lifeBars(data.checks), mh = l.h - 30, y0 = top + mh / 2, ext = 3, Y = (dv: number) => y0 - (Math.max(-ext, Math.min(ext, dv)) / ext) * (mh / 2 - 4);
          [-2, -1, 1, 2].forEach((v) => { ctx.strokeStyle = C.line; ctx.setLineDash([1, 4]); ctx.beginPath(); ctx.moveTo(LEFT, Y(v)); ctx.lineTo(w - RIGHT, Y(v)); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = C.dim; ctx.textAlign = "left"; ctx.font = "9px IBM Plex Mono, monospace"; ctx.fillText(v > 0 ? `+${v}` : `−${-v}`, LEFT + 3, Y(v) - 5); ctx.font = "10px IBM Plex Mono, monospace"; });
          ctx.strokeStyle = C.line2; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(LEFT, y0); ctx.lineTo(w - RIGHT, y0); ctx.stroke(); ctx.lineWidth = 1;
          if (base != null) { ctx.fillStyle = C.ink2; ctx.textAlign = "right"; ctx.font = "9px IBM Plex Mono, monospace"; ctx.fillText(`0 = your avg ${base.toFixed(1)}`, w - RIGHT - 3, top + 6); ctx.font = "10px IBM Plex Mono, monospace"; }
          const inV = days.filter((d) => d.at >= t0 - DAY && d.at <= view.t1 + DAY), bw = Math.max(1.5, (pw / (view.span / DAY)) * .7);
          for (const d of inV) {
            const x = X(d.at) - bw / 2, y = Y(d.dev), r = Math.min(3, bw / 2, Math.abs(y - y0));
            ctx.fillStyle = d.dev >= 0 ? C.up : C.down; ctx.beginPath();
            if (d.dev >= 0) { ctx.moveTo(x, y0); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.lineTo(x + bw - r, y); ctx.quadraticCurveTo(x + bw, y, x + bw, y + r); ctx.lineTo(x + bw, y0); }
            else { ctx.moveTo(x, y0); ctx.lineTo(x, y - r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.lineTo(x + bw - r, y); ctx.quadraticCurveTo(x + bw, y, x + bw, y - r); ctx.lineTo(x + bw, y0); }
            ctx.fill();
            if (d.note && bw >= 5) { ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(x + bw / 2, d.dev >= 0 ? y - 5 : y + 5, 1.7, 0, 7); ctx.fill(); }
          }
          // energy and stress, day averages, in a strip at the bottom
          const sy = top + mh + 4, sh = 22, SY = (v: number) => sy + sh - ((v - 1) / 9) * sh;
          ([["energy", C.gym], ["stress", C.hr]] as const).forEach(([k, c]) => { ctx.strokeStyle = c; ctx.lineWidth = 1.5; ctx.beginPath(); let prev: number | null = null; for (const d of inV) { const v = d[k]; if (v == null) { prev = null; continue; } const x = X(d.at), y = SY(v); if (prev != null && d.at - prev <= 1.6 * DAY) ctx.lineTo(x, y); else ctx.moveTo(x, y); prev = d.at; } ctx.stroke(); ctx.lineWidth = 1; });
        }
      }
      else if (l.kind === "chips") (l.pts ?? []).forEach(([at, v]) => {
        if (at < t0 - HOUR || at > view.t1) return;
        const x = X(at), cw = view.span <= 7 * DAY ? 22 : 6;
        ctx.fillStyle = l.color; ctx.globalAlpha = .25 + .75 * ((v - 1) / 9); ctx.fillRect(x - cw / 2, top + 2, cw, l.h - 4); ctx.globalAlpha = 1;
        if (cw > 10) { ctx.fillStyle = v >= 7 ? "#10181a" : C.ink; ctx.textAlign = "center"; ctx.fillText(String(v), x, top + l.h / 2); }
      });
      else if (l.kind === "ticks") {
        const rowH = l.h / Math.max(1, supplements.length);
        data.supps.forEach((s) => { if (s.at < t0 || s.at > view.t1) return; ctx.fillStyle = l.color; ctx.globalAlpha = .5 + (s.row % 5) * .1; ctx.fillRect(X(s.at) - 1, top + s.row * rowH + 1, 2.5, rowH - 2); });
        ctx.globalAlpha = 1;
        if (view.span <= 2 * DAY) { ctx.fillStyle = C.dim; ctx.font = "9.5px IBM Plex Mono, monospace"; ctx.textAlign = "left"; supplements.forEach((s, i) => ctx.fillText(s.name.split(" ")[0], LEFT + 3, top + i * rowH + rowH / 2)); }
      }
      if (l.id === "caf") [CAF_SLEEP.lowBelowMg, CAF_SLEEP.higherFromMg].forEach((v) => { if (v > (l.hi ?? 0)) return; const yy = yOf(top, l.h, 0, l.hi ?? 1, v); ctx.strokeStyle = C.caf; ctx.globalAlpha = .45; ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.moveTo(LEFT, yy); ctx.lineTo(w - RIGHT, yy); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1; ctx.fillStyle = C.caf; ctx.textAlign = "right"; ctx.font = "9px IBM Plex Mono, monospace"; ctx.fillText(`${v}`, w - RIGHT - 3, yy - 6); ctx.font = "10px IBM Plex Mono, monospace"; });
      if (host && l.id === host.id) overlays.forEach((o) => drawSeries(o, top, l.h, true));
      ctx.restore();
      // Axis values sit just inside the plot so they never collide with the lane's name.
      if (l.lo != null && l.hi != null && l.kind !== "feel") { ctx.textAlign = "left"; ctx.fillStyle = C.dim; ctx.font = "9px IBM Plex Mono, monospace"; ctx.fillText(String(l.hi), LEFT + 3, top + 5); ctx.fillText(String(l.lo), LEFT + 3, top + l.h - 4); ctx.font = "10px IBM Plex Mono, monospace"; }
      if (host && l.id === host.id) overlays.forEach((o, k) => { ctx.textAlign = "left"; ctx.fillStyle = o.color; ctx.fillText(o.kind === "feel" ? "10" : `${o.hi}${o.unit}`, w - RIGHT + 5, top + 4 + k * 12); ctx.fillText(o.kind === "feel" ? "1" : String(o.lo), w - RIGHT + 5, top + l.h - 3 - k * 12); });
    });
    // now + crosshair
    const nx = X(data.to); if (nx >= LEFT && nx <= w - RIGHT) { ctx.strokeStyle = C.ink2; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(nx + .5, TOP - 6); ctx.lineTo(nx + .5, H - 4); ctx.stroke(); ctx.setLineDash([]); }
    if (hover != null) { const hx = X(hover); ctx.strokeStyle = C.ink; ctx.globalAlpha = .45; ctx.beginPath(); ctx.moveTo(hx + .5, TOP - 6); ctx.lineTo(hx + .5, H - 4); ctx.stroke(); ctx.globalAlpha = 1; }
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
  const nightRows: [string, string][] = dayOf?.sleep != null ? [["Slept, your rating", `${dayOf.sleep}/10`]] : [];
  const rows: [string, string][] = [
    ["Caffeine", `${Math.round(valueAt(data.caffeine, t)?.[1] ?? 0)} mg`],
    ["Alcohol", `${(valueAt(data.alcohol, t)?.[1] ?? 0).toFixed(1)} g`],
    ["Last meal", (() => { const m = [...data.meals].reverse().find((x) => x.at <= t && x.at > t - 6 * HOUR); return m ? `${clock(m.at)} · ${Math.round(m.kcal)} kcal` : "—"; })()],
    ["Workout", data.workouts.find((b) => b.start <= t && b.end >= t)?.name ?? "—"],
    ["Weight", (() => { const v = valueAt(data.weight, t); return v ? `${v[1]} kg` : "—"; })()],
    ["Feelings", (() => { const c = hovered ?? latestCheck(data.checks, t); return c ? `${clock(c.at)} · ${feelText(c)}` : "—"; })()],
    ...(() => { const c = hovered ?? latestCheck(data.checks, t); return [...(c?.doing?.length ? [["Up to", c.doing.join(", ")] as [string, string]] : []), ...(c?.note ? [["Note", `“${c.note}”`] as [string, string]] : [])]; })(),
    ["Heart rate", "no wearable"],
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
    <section className="master" id="ins-timeline" aria-label="Master graph">
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
        </div>
        <canvas ref={cv} className="mg-canvas" aria-label="Master graph of every tracked metric over time"
          data-lanes={layout.map((r) => r.l.id).join(",")} data-plot={`${LEFT},${RIGHT}`} data-view={`${Math.round(view.t1 - view.span)},${Math.round(view.t1)}`} data-feel={feelRow ? `${feelRow.y},${feelRow.l.h}` : ""}
          onPointerDown={(e) => { drag.current = { x: e.clientX, t1: view.t1 }; e.currentTarget.setPointerCapture(e.pointerId); setHover(tAt(e.clientX)); setHoverY(e.clientY - e.currentTarget.getBoundingClientRect().top); }}
          onPointerMove={(e) => { if (drag.current && Math.abs(e.clientX - drag.current.x) > 4) { const pw = e.currentTarget.getBoundingClientRect().width - LEFT - RIGHT; setView(clampView(drag.current.t1 - ((e.clientX - drag.current.x) / pw) * view.span, view.span)); } setHover(tAt(e.clientX)); setHoverY(e.clientY - e.currentTarget.getBoundingClientRect().top); }}
          onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onPointerLeave={() => { if (!drag.current) setHover(null); }} />
        <canvas ref={ov} className="mg-overview" role="slider" aria-label="Whole history: drag the window or tap to jump" aria-valuemin={minT} aria-valuemax={maxT} aria-valuenow={Math.round(view.t1)}
          data-window={`${Math.round(view.t1 - view.span)},${Math.round(view.t1)}`}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); ovMove(e.clientX, true); }}
          onPointerMove={(e) => { if (ovDrag.current) ovMove(e.clientX, false); }}
          onPointerUp={() => { ovDrag.current = null; }} onPointerCancel={() => { ovDrag.current = null; }} />
        <div className="mg-bar mg-key">{view.span <= 7 * DAY
          ? <span className="hint-i"><b>How you felt</b> · height = mood · thickness = energy (thin = drained) · colour = stress <i className="sw" style={{ background: CALM }} />calm → <i className="sw" style={{ background: C.hr }} />tense · ring = a note</span>
          : <span className="hint-i"><b>How you felt</b> · each day's mood above <i className="sw" style={{ background: C.up }} /> or below <i className="sw" style={{ background: C.down }} /> your own average · <i className="sw ln" style={{ background: C.gym }} />energy and <i className="sw ln" style={{ background: C.hr }} />stress underneath · dot = a note · zoom to a week or less for each check-in</span>}</div>
        <div className="mg-bar"><span className="hint-i">Point at a check-in to read it · drag the chart or the overview to move · ⌘/Ctrl + wheel to zoom · tick lanes on and off; "on top" draws a line over {host?.name.toLowerCase() ?? "the first lane"} with its own axis.</span></div>
      </div>
      <aside className="mg-side">
        <div className="legend">
          <span className="k" style={{ marginBottom: 4 }}>Lanes</span>
          {lanes.map((l) => (
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
