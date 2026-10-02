/**
 * One feeling, 1–10, as a slider (owner, 2 Oct: the 1–10 button grid "looks pretty big and bad on
 * phone… replace w a slider, make it nice and creative"). One line per feeling: tap anywhere on the
 * track, or drag along it — the thumb carries the number and a bubble shows the word while you drag.
 * A vertical swipe scrolls the page instead, so scrolling past never rates anything. Your last value
 * is a faint ring until you set a new one. Arrow keys work too (it's a real ARIA slider).
 */

import { useRef, useState } from "react";

export type FeelSliderProps = {
  label: string;
  /** For tests and screen readers: "mood", "sleep". */
  name: string;
  value: number | undefined;
  /** Last value given, shown faintly when nothing is set now. */
  ghost?: number;
  word: (v: number) => string;
  color: string;
  /** High is bad (stress): the track runs calm → hot. */
  inverted?: boolean;
  onChange: (v: number) => void;
  /** What the right side says before anything is set ("tap", "last night"). */
  empty?: string;
};

const STEPS = 10;

export function FeelSlider({ label, name, value, ghost, word, color, inverted = false, onChange, empty = "tap" }: FeelSliderProps) {
  const track = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number; id: number; dragging: boolean } | null>(null);
  const [preview, setPreview] = useState<number | null>(null);
  const shown = preview ?? value;
  const valueAt = (clientX: number) => {
    const r = track.current!.getBoundingClientRect();
    return Math.min(STEPS, Math.max(1, Math.round(((clientX - r.left) / r.width) * (STEPS - 1)) + 1));
  };
  const pct = (v: number) => ((v - 1) / (STEPS - 1)) * 100;

  const down = (e: React.PointerEvent) => {
    // A mouse press would otherwise start selecting (or dragging selected) text, which cancels the drag.
    if (e.pointerType === "mouse") e.preventDefault();
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId, dragging: false };
  };
  const move = (e: React.PointerEvent) => {
    const s = start.current; if (!s) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (!s.dragging) {
      if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) { start.current = null; return; } // a scroll
      if (Math.abs(dx) < 6) return;
      s.dragging = true;
      try { (e.currentTarget as HTMLElement).setPointerCapture(s.id); } catch { /* fine without */ }
    }
    setPreview(valueAt(e.clientX));
  };
  const up = (e: React.PointerEvent) => {
    const s = start.current; start.current = null;
    if (!s) return;
    const v = valueAt(e.clientX);
    setPreview(null);
    if (v !== value || !s.dragging) onChange(v);
  };
  const key = (e: React.KeyboardEvent) => {
    const cur = value ?? ghost ?? 5;
    const next = e.key === "ArrowRight" || e.key === "ArrowUp" ? cur + 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? cur - 1 : e.key === "Home" ? 1 : e.key === "End" ? STEPS : null;
    if (next == null) return;
    e.preventDefault();
    onChange(Math.min(STEPS, Math.max(1, next)));
  };

  const lo = inverted ? `color-mix(in srgb, var(--ok) 35%, var(--c-card-2))` : `color-mix(in srgb, ${color} 14%, var(--c-card-2))`;
  return (
    <div className={`fs${shown != null ? " fs-on" : ""}${preview != null ? " dragging" : ""}`} style={{ "--fs": color, "--fs-lo": lo } as React.CSSProperties}>
      <span className="fs-label">{label}</span>
      <div
        ref={track}
        className="fs-track"
        role="slider"
        tabIndex={0}
        aria-label={label}
        data-name={name}
        aria-valuemin={1}
        aria-valuemax={STEPS}
        aria-valuenow={value}
        aria-valuetext={value != null ? `${value}, ${word(value)}` : ghost != null ? `not set, was ${ghost}` : "not set"}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => { start.current = null; setPreview(null); }}
        onKeyDown={key}
        onDragStart={(e) => e.preventDefault()}
      >
        <div className="fs-rail">{shown != null && <div className="fs-fill" style={{ width: `calc(14px + (100% - 28px) * ${pct(shown) / 100})` }} />}</div>
        <div className="fs-dots" aria-hidden="true">
          {Array.from({ length: STEPS }, (_, i) => <i key={i} style={{ left: `${pct(i + 1)}%` }} className={shown != null && i + 1 <= shown ? "on" : ""} />)}
        </div>
        {shown == null && ghost != null && <span className="fs-ghost" style={{ left: `${pct(ghost)}%` }} aria-hidden="true" />}
        {shown != null && <span key={shown} className="fs-thumb" style={{ left: `${pct(shown)}%` }} aria-hidden="true">{shown}
          {preview != null && <span className="fs-bubble">{word(shown)}</span>}
        </span>}
      </div>
      <span className="fs-word">{value != null ? word(value) : ghost != null ? `was ${ghost}` : empty}</span>
    </div>
  );
}
