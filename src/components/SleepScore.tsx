/**
 * The night out of 100, with its parts (PLAN 97; owner, 14 Oct: "should do a 100/… pointing for my sleep based on all the
 * sleep data, length, etc i get and also add in my rating"). Each part shows its points of its most and why, so the number
 * can be checked; what isn't known yet is named under it. Numbers from lib/sleepscore.
 */

import type { SleepScore as Score } from "../lib/sleepscore";

export function SleepScore({ s }: { s: Score }) {
  return (
    <div className="sl-score" data-score={s.score} aria-label={`Sleep score ${s.score} out of 100, ${s.word}`}>
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
      {s.left.length > 0 && <p className="sl-note">Not in it yet: {s.left.map((l) => l.id === "rating" ? "your rating (rate the night on Today)" : l.id === "deep" || l.id === "rem" ? `${l.name} (no stages from the band)` : `${l.name.toLowerCase()} (needs 5 other nights)`).filter((v, i, a) => a.indexOf(v) === i).join(", ")} — scored out of the rest.</p>}
    </div>
  );
}
