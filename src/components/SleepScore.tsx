/**
 * A score out of 100 with its parts (PLAN 97 sleep score; readiness, 14 Oct): each part shows its points of its most and
 * why, so the number can be checked; what isn't known yet is named under it. Numbers from lib/sleepscore, lib/readiness.
 *
 * A part that comes with the study's zones (the sleep score, owner 15 Oct: "it should have a range, like taken from studies,
 * like an ideal scenario, an average one, and a bad one, and then compare this and my usual to the last nights sleep") is
 * drawn as one bar coloured by zone — red poor, amber fair, green ideal — with a dot for this night and a tick for your
 * usual, and says the zone in words, so it never rests on colour alone ("i like the ranges and dots etc i just dont get it").
 */

type Zone = "ideal" | "fair" | "poor";
type ShownPart = {
  id: string; name: string; got: number; max: number; why: string;
  value?: number; usual?: number | null; scale?: [number, number]; zones?: [number, number, Zone][]; zone?: Zone; ideal?: string; usualText?: string | null;
};
type Shown = { score: number; word: string; parts: ShownPart[]; left: { id: string; name: string; max: number }[] };

/** Why a part of the sleep score isn't in it yet. */
const sleepLeft = (l: { id: string; name: string }) =>
  l.id === "rating" ? "your rating (rate the night on Today)"
  : l.id === "wakings" || l.id === "deep" || l.id === "rem" ? `${l.id === "rem" ? "REM" : l.name.toLowerCase()} (no stages from the band)`
  : l.id === "hrv" || l.id === "hrsleep" ? `${l.id === "hrv" ? "HRV" : l.name.toLowerCase()} (needs 5 other nights)`
  : `${l.name.toLowerCase()} (not from the band)`;

const pts = (v: number) => (Number.isInteger(v) ? v : v.toFixed(1));

function ZoneBar({ value, scale: [a, b], zones, zone, usual }: { value: number; scale: [number, number]; zones: [number, number, Zone][]; zone: Zone; usual?: number | null }) {
  const at = (x: number) => Math.max(0, Math.min(100, ((x - a) / (b - a)) * 100));
  return (
    <span className="zb" aria-hidden="true">
      {zones.map(([x0, x1, z]) => <i key={x0} className={`seg ${z}`} style={{ left: `${at(x0)}%`, width: `${at(x1) - at(x0)}%` }} />)}
      {usual != null && <i className="u" style={{ left: `${at(usual)}%` }} />}
      <i className={`dot ${zone}`} style={{ left: `${at(value)}%` }} />
    </span>
  );
}

export function SleepScore({ s, label = "Sleep score", leftWhy = sleepLeft }: { s: Shown; label?: string; leftWhy?: (l: { id: string; name: string }) => string }) {
  const zoned = s.parts.some((p) => p.zones);
  return (
    <div className="sl-score" data-score={s.score} aria-label={`${label} ${s.score} out of 100, ${s.word}`}>
      <div className="sl-score-n"><b>{s.score}</b><span>/ 100 · </span><span className={zoned ? `zw ${s.score >= 80 ? "ideal" : s.score >= 60 ? "fair" : "poor"}` : undefined}>{s.word}</span></div>
      <div className="sl-score-parts" role="list">
        {s.parts.map((p) => p.zones && p.scale && p.value != null && p.zone ? (
          <div key={p.id} className="sl-sp z" role="listitem" data-part={p.id} data-got={p.got} data-zone={p.zone}
            aria-label={`${p.name}: ${p.why}, ${p.zone}; ${pts(p.got)} of ${p.max}`}>
            <span className="hd"><span className="nm">{p.name}</span> <span className="why">{p.why}</span> <span className={`zw ${p.zone}`}>{p.zone}</span></span>
            <b>{pts(p.got)}<small>/{p.max}</small></b>
            <ZoneBar value={p.value} scale={p.scale} zones={p.zones} zone={p.zone} usual={p.usual} />
            <small className="ref">ideal {p.ideal}{p.usualText ? ` · your usual ${p.usualText}` : ""}</small>
          </div>
        ) : (
          <div key={p.id} className="sl-sp" role="listitem" data-part={p.id} data-got={p.got} data-zone={p.zone}>
            <span className="nm">{p.name}</span>
            <span className="tr" aria-hidden="true"><i className={p.zone} style={{ width: `${(p.got / p.max) * 100}%` }} /></span>
            {/* one decimal when it isn't whole: 4.5 of 5 shouldn't read as full marks */}
            <b>{pts(p.got)}<small>/{p.max}</small></b>
            <small className="why">{p.why}</small>
          </div>
        ))}
      </div>
      {zoned && (
        <p className="sl-key" aria-hidden="true">
          <span><i className="dot" />this night</span><span><i className="u" />your usual</span>
          <span><i className="sw ideal" />ideal</span><span><i className="sw fair" />fair</span><span><i className="sw poor" />poor</span>
          <span className="src">· ranges from sleep studies</span>
        </p>
      )}
      {s.left.length > 0 && <p className="sl-note">Not in it yet: {s.left.map(leftWhy).filter((v, i, a) => a.indexOf(v) === i).join(", ")} — scored out of the rest.</p>}
    </div>
  );
}
