/** What a read or a deep dive checked with the app's own numbers (PLAN 160): "its test ×2 · the band's nights". */

const LOOK_WORDS: Record<string, string> = { compare: "its test", series: "a trend", nights: "the band's nights", day: "a day's log", find: "a search of your log", sessions: "your sessions" };

export function Looked({ names }: { names?: string[] }) {
  if (!names?.length) return null;
  const n = new Map<string, number>();
  for (const x of names) n.set(x, (n.get(x) ?? 0) + 1);
  return <p className="mr-looked">Checked against your data by the app: {[...n].map(([k, c]) => `${LOOK_WORDS[k] ?? k}${c > 1 ? ` ×${c}` : ""}`).join(" · ")}</p>;
}
