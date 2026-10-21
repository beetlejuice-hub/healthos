/**
 * A cited link, with "✓ checked" when the server opened it and it was about what it's cited for (PLAN 160; owner, 21 Oct:
 * "do 2" — links checked). One that couldn't be checked (a site that blocks robots, a slow one) shows without the mark.
 */

export function SourceLink({ s, className, arrow = true }: { s: { title: string; url: string; checked?: boolean }; className?: string; arrow?: boolean }) {
  return (
    <span className="src-link">
      <a className={className} href={s.url} target="_blank" rel="noopener noreferrer">{s.title}{arrow ? " ↗" : ""}</a>
      {s.checked && <small className="src-ok" title="The app opened this link before showing it, and it's about what it's cited for">✓ checked</small>}
    </span>
  );
}
