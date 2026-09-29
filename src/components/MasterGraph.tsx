import { useEffect, useMemo, useRef, useState } from "react";
import type { Lanes } from "../lib/insights";
import { buckets, valueAt, type Point } from "../lib/series";
import { clock, dayLabel, DAY, HOUR, MIN } from "../lib/time";
import type { Supplement } from "../lib/types";

/**
 * One timeline for everything (owner: "one master graph that has everything on it and things can
 * be ticked on and off"). Thin stacked lanes share the time axis; any line lane can be drawn on
 * top of the first one with its own axis ("caffeine on heart rate"). Drag or swipe to go back in
 * time; ⌘/Ctrl + wheel zooms. Canvas, because a year of data is too many SVG nodes.
 */

type Kind = "series" | "daily" | "sticks" | "blocks" | "ticks" | "wearable";
type Lane = { id: string; name: string; unit: string; color: string; h: number; kind: Kind; pts?: Point[]; lo?: number; hi?: number; area?: boolean; overlay?: boolean };

const cssVar = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || "#888";
const LEFT = 104, RIGHT = 46, TOP = 22, GAP = 7;

export function MasterGraph({ data, supplements }: { data: Lanes; supplements: Supplement[] }) {
  const C = useMemo(() => ({ caf: cssVar("--caf"), alc: cssVar("--alc"), kcal: cssVar("--kcal"), gym: cssVar("--gym"), supp: cssVar("--supp"), wt: cssVar("--wt"), mood: cssVar("--mood"), hr: cssVar("--hr"), line: cssVar("--i-line"), ink: cssVar("--i-ink"), ink2: cssVar("--i-ink-2"), dim: cssVar("--i-dim") }), []);
  const lanes: Lane[] = useMemo(() => {
    const range = (pts: Point[], pad: number, floor?: [number, number]): [number, number] => {
      if (!pts.length) return floor ?? [0, 1];
      const v = pts.map((p) => p[1]); return [Math.floor(Math.min(...v) - pad), Math.ceil(Math.max(...v) + pad)];
    };
    const cafHi = Math.max(200, Math.ceil(Math.max(0, ...data.caffeine.map((p) => p[1])) / 50) * 50);
    const alcHi = Math.max(20, Math.ceil(Math.max(0, ...data.alcohol.map((p) => p[1])) / 10) * 10);
    const [wLo, wHi] = range(data.weight, 0.5, [70, 90]);
    return [
      { id: "hr", name: "Heart rate", unit: "bpm", color: C.hr, h: 24, kind: "wearable" },
      { id: "sleep", name: "Sleep stages", unit: "", color: C.hr, h: 24, kind: "wearable" },
      { id: "caf", name: "Caffeine in body", unit: "mg", color: C.caf, h: 64, kind: "series", pts: data.caffeine, lo: 0, hi: cafHi, area: true, overlay: true },
      { id: "alc", name: "Alcohol in body", unit: "g", color: C.alc, h: 40, kind: "series", pts: data.alcohol, lo: 0, hi: alcHi, area: true, overlay: true },
      { id: "meals", name: "Meals", unit: "kcal", color: C.kcal, h: 32, kind: "sticks" },
      { id: "gym", name: "Workouts", unit: "", color: C.gym, h: 20, kind: "blocks" },
      { id: "supps", name: "Supplements", unit: "", color: C.supp, h: Math.max(20, supplements.length * 7), kind: "ticks" },
      { id: "wt", name: "Weight", unit: "kg", color: C.wt, h: 36, kind: "daily", pts: data.weight, lo: wLo, hi: wHi, overlay: true },
      { id: "energy", name: "Energy (you)", unit: "/10", color: C.mood, h: 32, kind: "daily", pts: data.energy, lo: 0, hi: 10, overlay: true },
      { id: "mood", name: "Mood (you)", unit: "/10", color: C.ink2, h: 32, kind: "daily", pts: data.mood, lo: 0, hi: 10, overlay: true },
    ];
  }, [data, supplements.length, C]);

  const [on, setOn] = useState<Record<string, boolean>>({ caf: true, alc: true, meals: true, gym: true, supps: true, wt: false, energy: true, mood: false });
  const [over, setOver] = useState<Record<string, boolean>>({ energy: false });
  const [view, setView] = useState({ t1: data.to + 90 * MIN, span: 3 * DAY });
  const [hover, setHover] = useState<number | null>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; t1: number } | null>(null);
  const [w, setW] = useState(900);

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
  let y = TOP; const layout = drawn.map((l) => { const r = { l, y }; y += l.h + GAP; return r; });
  const H = y + 4;

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

    const yOf = (top: number, h: number, lo: number, hi: number, v: number) => top + h - ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo || 1)) * h;
    const drawSeries = (l: Lane, top: number, h: number, asOverlay: boolean) => {
      const lo = l.lo ?? 0, hi = l.hi ?? 1, pts = l.pts ?? [];
      if (l.kind === "series") {
        const b = buckets(pts, t0, view.t1, Math.floor(pw));
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

    layout.forEach(({ l, y: top }) => {
      ctx.textAlign = "left"; ctx.font = "11px IBM Plex Sans, sans-serif"; ctx.fillStyle = l.kind === "wearable" ? C.dim : C.ink2; ctx.fillText(l.name, 8, top + 8);
      ctx.font = "10px IBM Plex Mono, monospace"; ctx.fillStyle = C.dim; if (l.unit) ctx.fillText(l.unit, 8, top + 20);
      ctx.strokeStyle = C.line; ctx.beginPath(); ctx.moveTo(LEFT, top + l.h + .5); ctx.lineTo(w - RIGHT, top + l.h + .5); ctx.stroke();
      ctx.save(); ctx.beginPath(); ctx.rect(LEFT, top - 2, pw, l.h + 4); ctx.clip();
      if (l.kind === "wearable") { ctx.fillStyle = C.dim; ctx.textAlign = "left"; ctx.fillText("Connect a wearable to fill this lane", LEFT + 8, top + l.h / 2); }
      else if (l.kind === "series" || l.kind === "daily") drawSeries(l, top, l.h, false);
      else if (l.kind === "sticks") data.meals.forEach((m) => { if (m.at < t0 || m.at > view.t1) return; const x = X(m.at), bh = Math.min(l.h, (m.kcal / 1100) * l.h); ctx.fillStyle = l.color; ctx.fillRect(x - 1, top + l.h - bh, 2, bh); if (view.span <= 2 * DAY) { ctx.fillStyle = C.ink2; ctx.textAlign = "left"; ctx.fillText(String(Math.round(m.kcal)), x + 4, top + l.h - bh + 5); } });
      else if (l.kind === "blocks") data.workouts.forEach((b) => { if (b.end < t0 || b.start > view.t1) return; const x0 = X(b.start), x1 = X(b.end); ctx.fillStyle = l.color; ctx.globalAlpha = .85; ctx.fillRect(x0, top + 3, Math.max(2, x1 - x0), l.h - 6); ctx.globalAlpha = 1; if (x1 - x0 > 50) { ctx.fillStyle = "#1a1a12"; ctx.textAlign = "left"; ctx.fillText(b.name, x0 + 4, top + l.h / 2); } });
      else if (l.kind === "ticks") {
        const rowH = l.h / Math.max(1, supplements.length);
        data.supps.forEach((s) => { if (s.at < t0 || s.at > view.t1) return; ctx.fillStyle = l.color; ctx.globalAlpha = .5 + (s.row % 5) * .1; ctx.fillRect(X(s.at) - 1, top + s.row * rowH + 1, 2.5, rowH - 2); });
        ctx.globalAlpha = 1;
        if (view.span <= 2 * DAY) { ctx.fillStyle = C.dim; ctx.font = "9.5px IBM Plex Mono, monospace"; ctx.textAlign = "left"; supplements.forEach((s, i) => ctx.fillText(s.name.split(" ")[0], LEFT + 3, top + i * rowH + rowH / 2)); }
      }
      if (host && l.id === host.id) overlays.forEach((o) => drawSeries(o, top, l.h, true));
      ctx.restore();
      // Axis values sit just inside the plot so they never collide with the lane's name.
      if (l.lo != null && l.hi != null) { ctx.textAlign = "left"; ctx.fillStyle = C.dim; ctx.font = "9px IBM Plex Mono, monospace"; ctx.fillText(String(l.hi), LEFT + 3, top + 5); ctx.fillText(String(l.lo), LEFT + 3, top + l.h - 4); ctx.font = "10px IBM Plex Mono, monospace"; }
      if (host && l.id === host.id) overlays.forEach((o, k) => { ctx.textAlign = "left"; ctx.fillStyle = o.color; ctx.fillText(`${o.hi}${o.unit}`, w - RIGHT + 5, top + 4 + k * 12); ctx.fillText(String(o.lo), w - RIGHT + 5, top + l.h - 3 - k * 12); });
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
  const rows: [string, string][] = [
    ["Caffeine", `${Math.round(valueAt(data.caffeine, t)?.[1] ?? 0)} mg`],
    ["Alcohol", `${(valueAt(data.alcohol, t)?.[1] ?? 0).toFixed(1)} g`],
    ["Last meal", (() => { const m = [...data.meals].reverse().find((x) => x.at <= t && x.at > t - 6 * HOUR); return m ? `${clock(m.at)} · ${Math.round(m.kcal)} kcal` : "—"; })()],
    ["Workout", data.workouts.find((b) => b.start <= t && b.end >= t)?.name ?? "—"],
    ["Weight", (() => { const v = valueAt(data.weight, t); return v ? `${v[1]} kg` : "—"; })()],
    ["Energy", (() => { const v = valueAt(data.energy, t); return v && t - v[0] < DAY ? `${v[1]}/10` : "—"; })()],
    ["Heart rate", "no wearable"],
  ];
  const scrubMax = Math.max(1, maxT - minT - view.span);
  const presets: [string, number][] = [["1D", DAY], ["3D", 3 * DAY], ["7D", 7 * DAY], ["30D", 30 * DAY], ["90D", 90 * DAY], ["All", maxT - minT]];

  return (
    <section className="master" aria-label="Master graph">
      <div className="mg-main">
        <div className="mg-bar">
          <div className="iseg" role="group" aria-label="Time range">
            {presets.map(([n, s]) => <button key={n} type="button" aria-pressed={Math.abs(view.span - s) < MIN} onClick={() => setView(clampView(maxT, s))}>{n}</button>)}
          </div>
          <button type="button" className="ibtn" aria-label="Zoom in" onClick={() => setView(clampView(view.t1 - view.span * .19, view.span / 1.6))}>＋</button>
          <button type="button" className="ibtn" aria-label="Zoom out" onClick={() => setView(clampView(view.t1 + view.span * .3, view.span * 1.6))}>－</button>
          <span className="range-lbl">{dayLabel(view.t1 - view.span)} {clock(view.t1 - view.span)} → {dayLabel(view.t1)} {clock(view.t1)}</span>
          <label className="scrub"><span className="k">Scroll back</span>
            <input type="range" min={0} max={1000} value={Math.round(((view.t1 - view.span - minT) / scrubMax) * 1000)} aria-label="Scroll back in time" onChange={(e) => setView(clampView(minT + view.span + (+e.target.value / 1000) * scrubMax, view.span))} />
          </label>
          <button type="button" className="ibtn" onClick={() => setView(clampView(maxT, view.span))}>Now</button>
        </div>
        <canvas ref={cv} className="mg-canvas" aria-label="Master graph of every tracked metric over time"
          onPointerDown={(e) => { drag.current = { x: e.clientX, t1: view.t1 }; e.currentTarget.setPointerCapture(e.pointerId); }}
          onPointerMove={(e) => { if (drag.current) { const pw = e.currentTarget.getBoundingClientRect().width - LEFT - RIGHT; setView(clampView(drag.current.t1 - ((e.clientX - drag.current.x) / pw) * view.span, view.span)); } setHover(tAt(e.clientX)); }}
          onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onPointerLeave={() => { if (!drag.current) setHover(null); }} />
        <div className="mg-bar"><span className="hint-i">Drag to scroll back · ⌘/Ctrl + wheel to zoom · tick lanes on and off; "on top" draws a line over {host?.name.toLowerCase() ?? "the first lane"} with its own axis.</span></div>
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
          <span className="t">{dayLabel(t)} · {clock(t)}{hover == null ? " (now)" : ""}</span>
          {rows.map(([a, b]) => <div key={a}><span>{a}</span><b>{b}</b></div>)}
        </div>
      </aside>
    </section>
  );
}
