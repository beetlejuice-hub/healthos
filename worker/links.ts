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
 *
 * A dead or mismatched link isn't the end of a study (PLAN 201; owner, 9 Nov, of "the study was left out — its link didn't
 * open, or the page was about something else": "pls stop doing this"): the AI names real papers but often gets their
 * address wrong, so the paper is looked up by its title — PubMed's search, then Crossref's — and kept with the address
 * found, when the hit's own title holds most of the cited title's words. Only a paper neither knows is left out.
 */

import type { DigestAnswer, DiveStudy, NightAnswer, SupplementAnswer } from "../src/lib/ai/tasks";

export type LinkVerdict = "ok" | "dead" | "mismatch" | "unknown";
/** findShare: of the cited title's words, how many a found paper's title must hold; findWords: fewer and it isn't looked up; finds: per read. */
export const LINKS = { timeoutMs: 5000, maxBytes: 300_000, titleShare: 0.5, textShare: 0.6, most: 10, findShare: 0.6, findWords: 3, finds: 3 } as const;
const UA = "Mozilla/5.0 (compatible; HealthOS link check)";
const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils", CROSSREF = "https://api.crossref.org/works";

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
    r = await f(url, { redirect: "follow", headers: { "user-agent": UA, accept: "text/html,*/*" }, signal: AbortSignal.timeout(LINKS.timeoutMs) });
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

async function getJson(url: string, f: typeof fetch): Promise<Record<string, unknown> | null> {
  try {
    const r = await f(url, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(LINKS.timeoutMs) });
    return r.ok ? ((await r.json()) as Record<string, unknown>) : null;
  } catch { return null; }
}
const get = (o: unknown, ...path: string[]): unknown => path.reduce<unknown>((x, k) => (x && typeof x === "object" ? (x as Record<string, unknown>)[k] : undefined), o);

/** A paper found again by its cited title: its PubMed (or DOI) address and its real title, marked checked — or null. */
export async function findPaper(title: string, f: typeof fetch): Promise<Src | null> {
  const want = words(title), fits = (t: string) => !!t && share(want, words(t)) >= LINKS.findShare;
  if (want.size < LINKS.findWords) return null;
  const found = await getJson(`${EUTILS}/esearch.fcgi?db=pubmed&retmode=json&retmax=3&sort=relevance&tool=healthos&term=${encodeURIComponent(title)}`, f);
  const ids = ((get(found, "esearchresult", "idlist") as unknown[]) ?? []).map(String).filter((id) => /^\d+$/.test(id));
  if (ids.length) {
    const sum = await getJson(`${EUTILS}/esummary.fcgi?db=pubmed&retmode=json&tool=healthos&id=${ids.join(",")}`, f);
    for (const id of ids) {
      const t = String(get(sum, "result", id, "title") ?? "").replace(/\.$/, "");
      if (fits(t)) return { title: t, url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`, checked: true };
    }
  }
  const cr = await getJson(`${CROSSREF}?rows=3&select=DOI,title&query.bibliographic=${encodeURIComponent(title)}`, f);
  for (const it of (get(cr, "message", "items") as unknown[]) ?? []) {
    const t = String((get(it, "title") as unknown[])?.[0] ?? ""), doi = String(get(it, "DOI") ?? "");
    if (doi && fits(t)) return { title: t, url: `https://doi.org/${doi}`, checked: true };
  }
  return null;
}

/** The sources of the items about to be left out, found again by title — at most LINKS.finds, side by side. */
async function refind(srcs: Src[], f: typeof fetch): Promise<Map<string, Src>> {
  const found = await Promise.all(srcs.slice(0, LINKS.finds).map(async (s) => [keyOf(s), await findPaper(s.title, f).catch(() => null)] as const));
  return new Map(found.filter((x): x is readonly [string, Src] => !!x[1]));
}
/** Check a batch: each link opened once (at most `most` links), each citation of it judged on its own title. */
async function verdicts(srcs: Src[], f: typeof fetch): Promise<Map<string, LinkVerdict>> {
  const urls = [...new Set(srcs.map((s) => s.url))].slice(0, LINKS.most);
  const pages = new Map(await Promise.all(urls.map(async (u) => [u, await open(u, f).catch((): Opened => ({ kind: "unknown" }))] as const)));
  return new Map(srcs.filter((s) => pages.has(s.url)).map((s) => [keyOf(s), judge(pages.get(s.url)!, s.title)]));
}
const keep = (v: Map<string, LinkVerdict>, s?: Src) => !s || (v.get(keyOf(s)) !== "dead" && v.get(keyOf(s)) !== "mismatch");
const mark = <T extends Src | undefined>(v: Map<string, LinkVerdict>, s: T): T => (s && v.get(keyOf(s)) === "ok" ? { ...s, checked: true } : s);

/**
 * A read's answer (morning or evening) with every cited link checked: dead or mismatched ones' items dropped, good ones
 * marked — and the kinds of the items dropped said back (`unlinked`), so the read can say one was left out rather than
 * lose it silently (PLAN 193; owner, 4 Nov: "tooday morning read had absolutely no study").
 */
export async function checkReadLinks<A extends DigestAnswer | NightAnswer>(a: A, f: typeof fetch): Promise<A> {
  const items = a.items ?? [], qs = a.questions ?? [], news = "news" in a ? a.news : null, disc = a.discovery ?? null;
  const v = await verdicts([...items.map((i) => i.source), ...qs.map((q) => q.source), news?.source, disc?.source].filter((s): s is Src => !!s), f);
  // a study first, then the rest: found again by title, kept with the address found
  const lost = items.filter((i) => !keep(v, i.source)).sort((x, y) => +(y.type === "study") - +(x.type === "study"));
  const again = await refind(lost.map((i) => i.source!), f);
  const fixed = (i: (typeof items)[number]) => (i.source && again.get(keyOf(i.source))) || null;
  const unlinked = lost.filter((i) => !fixed(i)).map((i) => i.type);
  return {
    ...a,
    ...(unlinked.length ? { unlinked } : {}),
    // the day's discovery (PLAN 187): a dead link, or a page about something else, and it goes
    ...(disc ? { discovery: keep(v, disc.source) ? { ...disc, source: mark(v, disc.source) } : null } : {}),
    ...(a.items ? { items: items.flatMap((i) => (keep(v, i.source) ? [i.source ? { ...i, source: mark(v, i.source) } : i] : fixed(i) ? [{ ...i, source: fixed(i)! }] : [])) } : {}),
    ...(a.questions ? { questions: qs.filter((q) => keep(v, q.source)).map((q) => (q.source ? { ...q, source: mark(v, q.source) } : q)) } : {}),
    ...(news ? { news: keep(v, news.source) ? { ...news, source: mark(v, news.source) } : null } : {}),
  };
}

/** A supplement's research with its sources checked: dead or mismatched ones left out, good ones marked. */
export async function checkSupplementLinks(a: SupplementAnswer, f: typeof fetch): Promise<SupplementAnswer> {
  const v = await verdicts(a.sources, f);
  return { ...a, sources: a.sources.filter((s) => keep(v, s)).map((s) => mark(v, s)) };
}

/** A deep dive's or an experiment verdict's studies with their links checked (PLAN 160): a dead or mismatched one is left out, good ones marked. */
export async function checkFoundLinks<A extends { found: DiveStudy[] }>(a: A, f: typeof fetch): Promise<A> {
  const v = await verdicts(a.found.map((x) => x.source), f);
  const again = await refind(a.found.filter((x) => !keep(v, x.source)).map((x) => x.source), f);
  return { ...a, found: a.found.flatMap((x) => (keep(v, x.source) ? [{ ...x, source: mark(v, x.source) }] : again.has(keyOf(x.source)) ? [{ ...x, source: again.get(keyOf(x.source))! }] : [])) };
}
