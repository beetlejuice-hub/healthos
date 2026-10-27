/**
 * What a read or a deep dive checked with the app's own numbers (PLAN 160): "its test ×2 · the band's nights" — and any web
 * search that failed, "web:unavailable" (owner, 27 Oct: "if ai cant access the internet… i should know what caused").
 */

const LOOK_WORDS: Record<string, string> = { compare: "its test", series: "a trend", nights: "the band's nights", day: "a day's log", find: "a search of your log", sessions: "your sessions" };
const WEB_WORDS: Record<string, string> = { unavailable: "the search service was down", too_many_requests: "too many searches at once", query_too_long: "a search was too long", invalid_input: "a search was malformed" };

export function Looked({ names }: { names?: string[] }) {
  if (!names?.length) return null;
  const n = new Map<string, number>(), web = names.filter((x) => x.startsWith("web:")).map((x) => x.slice(4));
  for (const x of names) if (!x.startsWith("web:")) n.set(x, (n.get(x) ?? 0) + 1);
  return <>
    {n.size > 0 && <p className="mr-looked">Checked against your data by the app: {[...n].map(([k, c]) => `${LOOK_WORDS[k] ?? k}${c > 1 ? ` ×${c}` : ""}`).join(" · ")}</p>}
    {web.length > 0 && <p className="mr-looked mr-webfail">The web search failed ({web.map((w) => `${WEB_WORDS[w] ?? w} · ${w}`).join("; ")}), so this is from your data and what the AI already knew — no new studies.</p>}
  </>;
}
