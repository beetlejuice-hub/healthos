/**
 * A score out of 100 with its parts (PLAN 97 sleep score; readiness, 14 Oct): each part shows its points of its most and
 * why, so the number can be checked; what isn't known yet is named under it. Numbers from lib/sleepscore, lib/readiness.
 */

type Shown = { score: number; word: string; parts: { id: string; name: string; got: number; max: number; why: string }[]; left: { id: string; name: string; max: number }[] };

/** Why a part of the sleep score isn't in it yet. */
const sleepLeft = (l: { id: string; name: string }) => (l.id === "rating" ? "your rating (rate the night on Today)" : l.id === "deep" || l.id === "rem" ? `${l.name} (no stages from the band)`
  : l.id === "timing" || l.id === "heart" ? `${l.name.toLowerCase()} (needs 5 other nights)` : `${l.name.toLowerCase()} (not from the band)`);

export function SleepScore({ s, label = "Sleep score", leftWhy = sleepLeft }: { s: Shown; label?: string; leftWhy?: (l: { id: string; name: string }) => string }) {
  return (
    <div className="sl-score" data-score={s.score} aria-label={`${label} ${s.score} out of 100, ${s.word}`}>
      <div className="sl-score-n"><b>{s.score}</b><span>/ 100 · {s.word}</span></div>
      <div className="sl-score-parts" role="list">
        {s.parts.map((p) => (
          <div key={p.id} className="sl-sp" role="listitem" data-part={p.id} data-got={p.got}>
            <span className="nm">{p.name}</span>
            <span className="tr" aria-hidden="true"><i style={{ width: `${(p.got / p.max) * 100}%` }} /></span>
            {/* one decimal when it isn't whole: 4.5 of 5 shouldn't read as full marks */}
            <b>{Number.isInteger(p.got) ? p.got : p.got.toFixed(1)}<small>/{p.max}</small></b>
            <small className="why">{p.why}</small>
          </div>
        ))}
      </div>
      {s.left.length > 0 && <p className="sl-note">Not in it yet: {s.left.map(leftWhy).filter((v, i, a) => a.indexOf(v) === i).join(", ")} — scored out of the rest.</p>}
    </div>
  );
}
