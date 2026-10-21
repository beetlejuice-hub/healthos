/**
 * Every link the AI cites, opened before you see it (PLAN 160; owner, 21 Oct: "do 2, 1, 3, 4" — 2: "links checked").
 * The reads' studies and things to try, their study questions, the news and a supplement's sources come with a link; the
 * AI could cite one that's dead or about something else. Each is fetched (5 s at most, the first 300 kB read):
 *
 *   dead      404 / 410, or no such site → the item goes (no source, no recommendation — PLAN 132)
 *   mismatch  it opens, but the page's own title (or, failing that, its text) holds under half the cited title's words
 *             → the item goes
 *   unknown   the site won't let a robot in (401 / 403 / 429), errs (5xx) or is slow → kept, unmarked
 *   ok        it opens and matches → kept, marked checked
 *
 * Words: lower case, 4+ letters or digits, the commonest English ones left out ("with", "from", "study"…). No AI call.
 */

import type { DigestAnswer, NightAnswer, SupplementAnswer } from "../src/lib/ai/tasks";

export type LinkVerdict = "ok" | "dead" | "mismatch" | "unknown";
export const LINKS = { timeoutMs: 5000, maxBytes: 300_000, titleShare: 0.5, textShare: 0.6, most: 10 } as const;

const STOP = new Set(["with", "from", "that", "this", "than", "what", "when", "your", "into", "over", "after", "before", "about", "their", "they", "have", "does", "study", "studies", "review", "trial", "effect", "effects", "health", "pubmed", "journal", "article", "research", "evidence", "www", "https", "http", "html"]);
export const words = (s: string) => new Set((s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").match(/[a-z0-9]{4,}/g) ?? []).filter((w) => !STOP.has(w)));
const share = (want: Set<string>, have: Set<string>) => (want.size ? [...want].filter((w) => have.has(w)).length / want.size : 1);
const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));

/** The page's own titles: <title>, citation_title, og:title, the first <h1>. */
export function pageTitles(html: string): string {
  const meta = (name: string) => [...html.matchAll(new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*>`, "gi"))].map((m) => /content=["']([^"']*)/i.exec(m[0])?.[1] ?? "");
  return decode([/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "", ...meta("citation_title"), ...meta("og:title"), /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1]?.replace(/<[^>]+>/g, " ") ?? ""].join(" "));
}

async function readSome(r: Response, max: number): Promise<string> {
  if (!r.body) return "";
  const reader = r.body.getReader(), parts: Uint8Array[] = [];
  let n = 0;
  while (n < max) { const { done, value } = await reader.read(); if (done || !value) break; parts.push(value); n += value.length; }
  void reader.cancel().catch(() => {});
  const all = new Uint8Array(n); let at = 0;
  for (const p of parts) { all.set(p.subarray(0, Math.min(p.length, n - at)), at); at += p.length; if (at >= n) break; }
  return new TextDecoder().decode(all);
}

type Opened = { kind: "dead" | "unknown" } | { kind: "page"; html: string | null };
/** Open one link: dead, can't tell, or the page (null: not text — a PDF that opens). */
async function open(url: string, f: typeof fetch): Promise<Opened> {
  if (!/^https:\/\//i.test(url)) return { kind: "dead" };
  let r: Response;
  try {
    r = await f(url, { redirect: "follow", headers: { "user-agent": "Mozilla/5.0 (compatible; HealthOS link check)", accept: "text/html,*/*" }, signal: AbortSignal.timeout(LINKS.timeoutMs) });
  } catch (e) {
    // slow is "can't tell"; no such site, or nothing answering, is dead
    return { kind: (e as Error)?.name === "TimeoutError" || (e as Error)?.name === "AbortError" ? "unknown" : "dead" };
  }
  if (r.status === 404 || r.status === 410) return { kind: "dead" };
  if (!r.ok) return { kind: "unknown" };
  if (!/html|text|xml/i.test(r.headers.get("content-type") ?? "text/html")) return { kind: "page", html: null };
  try { return { kind: "page", html: await readSome(r, LINKS.maxBytes) }; } catch { return { kind: "unknown" }; }
}
/** Whether an opened page is about what it's cited for. */
function judge(o: Opened, title: string): LinkVerdict {
  if (o.kind !== "page") return o.kind;
  if (o.html == null) return "ok";
  const want = words(title);
  if (share(want, words(pageTitles(o.html))) >= LINKS.titleShare) return "ok";
  return share(want, words(o.html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "))) >= LINKS.textShare ? "ok" : "mismatch";
}
/** Open one link and say whether it's there and about what it's cited for. */
export async function checkLink(url: string, title: string, f: typeof fetch): Promise<LinkVerdict> {
  return judge(await open(url, f), title);
}

type Src = { title: string; url: string; checked?: boolean };
const keyOf = (s: Src) => `${s.url}\n${s.title}`;
/** Check a batch: each link opened once (at most `most` links), each citation of it judged on its own title. */
async function verdicts(srcs: Src[], f: typeof fetch): Promise<Map<string, LinkVerdict>> {
  const urls = [...new Set(srcs.map((s) => s.url))].slice(0, LINKS.most);
  const pages = new Map(await Promise.all(urls.map(async (u) => [u, await open(u, f).catch((): Opened => ({ kind: "unknown" }))] as const)));
  return new Map(srcs.filter((s) => pages.has(s.url)).map((s) => [keyOf(s), judge(pages.get(s.url)!, s.title)]));
}
const keep = (v: Map<string, LinkVerdict>, s?: Src) => !s || (v.get(keyOf(s)) !== "dead" && v.get(keyOf(s)) !== "mismatch");
const mark = <T extends Src | undefined>(v: Map<string, LinkVerdict>, s: T): T => (s && v.get(keyOf(s)) === "ok" ? { ...s, checked: true } : s);

/** A read's answer (morning or evening) with every cited link checked: dead or mismatched ones' items dropped, good ones marked. */
export async function checkReadLinks<A extends DigestAnswer | NightAnswer>(a: A, f: typeof fetch): Promise<A> {
  const items = a.items ?? [], qs = a.questions ?? [], news = "news" in a ? a.news : null;
  const v = await verdicts([...items.map((i) => i.source), ...qs.map((q) => q.source), news?.source].filter((s): s is Src => !!s), f);
  return {
    ...a,
    ...(a.items ? { items: items.filter((i) => keep(v, i.source)).map((i) => (i.source ? { ...i, source: mark(v, i.source) } : i)) } : {}),
    ...(a.questions ? { questions: qs.filter((q) => keep(v, q.source)).map((q) => (q.source ? { ...q, source: mark(v, q.source) } : q)) } : {}),
    ...(news ? { news: keep(v, news.source) ? { ...news, source: mark(v, news.source) } : null } : {}),
  };
}

/** A supplement's research with its sources checked: dead or mismatched ones left out, good ones marked. */
export async function checkSupplementLinks(a: SupplementAnswer, f: typeof fetch): Promise<SupplementAnswer> {
  const v = await verdicts(a.sources, f);
  return { ...a, sources: a.sources.filter((s) => keep(v, s)).map((s) => mark(v, s)) };
}
