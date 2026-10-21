import { describe, expect, it } from "vitest";
import { checkLink, checkReadLinks, checkSupplementLinks, pageTitles } from "./links";
import type { DigestAnswer, SupplementAnswer } from "../src/lib/ai/tasks";

// PLAN 160 — owner, 21 Oct: "do 2, 1, 3, 4" (2: every cited link opened before you see it). The network here can't reach
// PubMed or the journals, so the pages are stand-ins in the shapes those sites send: PubMed's <title> "… - PubMed" and
// its citation_title meta, a publisher that answers robots with 403, a site that doesn't exist, a PDF.
const PUBMED = `<!DOCTYPE html><html><head><title>Caffeine effects on sleep taken 0, 3, or 6 hours before going to bed - PubMed</title>
<meta name="citation_title" content="Caffeine effects on sleep taken 0, 3, or 6 hours before going to bed">
<meta property="og:title" content="Caffeine effects on sleep taken 0, 3, or 6 hours before going to bed - PubMed"></head>
<body><h1 class="heading-title">Caffeine effects on sleep taken 0, 3, or 6 hours before going to bed</h1><p>Abstract: 400 mg of caffeine 6 hours before bedtime reduced total sleep time by more than 1 hour.</p></body></html>`;
const NEWS = `<html><head><title>Health news | The Daily Paper</title></head><body><script>var title = "glycine";</script>
<article><p>Researchers found that taking glycine before bed improved how rested people felt the next morning, in a small trial of sleep quality.</p></article></body></html>`;

type Page = { status?: number; html?: string; type?: string } | "no-such-site" | "slow";
function web(pages: Record<string, Page>) {
  const opened: string[] = [];
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    opened.push(url);
    expect((init?.headers as Record<string, string>)?.["user-agent"]).toMatch(/HealthOS link check/);
    const p = pages[url];
    if (p === "no-such-site") throw new TypeError("fetch failed");
    if (p === "slow") throw Object.assign(new Error("The operation timed out."), { name: "TimeoutError" });
    if (!p) return new Response("Forbidden", { status: 403 });
    return new Response(p.html ?? "", { status: p.status ?? 200, headers: { "content-type": p.type ?? "text/html; charset=utf-8" } });
  }) as typeof fetch;
  return { f, opened };
}

describe("one link", () => {
  const { f } = web({
    "https://pubmed.ncbi.nlm.nih.gov/24235903/": { html: PUBMED },
    "https://pubmed.ncbi.nlm.nih.gov/99999999/": { status: 404, html: "<title>Page not available - PubMed</title>" },
    "https://news.example.com/glycine": { html: NEWS },
    "https://journal.example.com/paper.pdf": { html: "%PDF-1.7", type: "application/pdf" },
    "https://made-up-journal.example/x": "no-such-site",
    "https://slow.example.com/x": "slow",
  });
  it("a real study page, cited in other words, matches", async () => {
    expect(await checkLink("https://pubmed.ncbi.nlm.nih.gov/24235903/", "Caffeine 6 hours before bed still cuts sleep", f)).toBe("ok");
  });
  it("the same page cited for something else doesn't", async () => {
    expect(await checkLink("https://pubmed.ncbi.nlm.nih.gov/24235903/", "Magnesium glycinate improves deep sleep in older adults", f)).toBe("mismatch");
  });
  it("a dead link and a made-up site are dead; plain http isn't a source", async () => {
    expect(await checkLink("https://pubmed.ncbi.nlm.nih.gov/99999999/", "Caffeine and sleep", f)).toBe("dead");
    expect(await checkLink("https://made-up-journal.example/x", "Caffeine and sleep", f)).toBe("dead");
    expect(await checkLink("http://pubmed.ncbi.nlm.nih.gov/24235903/", "Caffeine and sleep", f)).toBe("dead");
  });
  it("a site that blocks robots, or a slow one, can't be told — not dead", async () => {
    expect(await checkLink("https://academic.example.com/article/1", "Caffeine and sleep", f)).toBe("unknown");
    expect(await checkLink("https://slow.example.com/x", "Caffeine and sleep", f)).toBe("unknown");
  });
  it("a page whose title says nothing (a news site) matches on its text — not on its scripts", async () => {
    expect(await checkLink("https://news.example.com/glycine", "Glycine before bed: people felt more rested", f)).toBe("ok");
    expect(await checkLink("https://news.example.com/glycine", "Glycine lowers blood pressure in hypertension", f)).toBe("mismatch");
  });
  it("a PDF that opens is there", async () => {
    expect(await checkLink("https://journal.example.com/paper.pdf", "Caffeine and sleep", f)).toBe("ok");
  });
  it("the page's titles: <title>, citation_title, og:title, the first <h1>, entities decoded", () => {
    expect(pageTitles(`<title>A &amp; B</title><meta content="C D" name="citation_title"><h1><span>E</span> F</h1>`)).toMatch(/A & B C D\s+E\s+F/);
  });
});

describe("a read's links", () => {
  const ok = "https://pubmed.ncbi.nlm.nih.gov/24235903/", dead = "https://pubmed.ncbi.nlm.nih.gov/99999999/";
  const pages = { [ok]: { html: PUBMED }, [dead]: { status: 404 } };
  const read: DigestAnswer = {
    greeting: "Morning",
    items: [
      { type: "study", title: "Coffee at 4 pm still costs you sleep", text: "…", source: { title: "Caffeine effects on sleep taken 6 hours before bed", url: ok } },
      { type: "try", title: "Tart cherry for sleep", text: "…", source: { title: "Tart cherry juice and sleep", url: dead } },
      { type: "pattern", title: "Your late coffees", text: "…" },
      { type: "study", title: "Unchecked", text: "…", source: { title: "Caffeine and sleep", url: "https://academic.example.com/1" } },
    ],
    questions: [
      { id: "q1", kind: "study", text: "Do you have coffee after 15:00?", why: "a study", options: ["Yes", "No"], key: "late_coffee", repeat: "once", source: { title: "Magnesium and deep sleep", url: ok } },
      { id: "q2", kind: "check", text: "Still taking magnesium?", why: "", options: ["Yes", "No"], key: "mag", repeat: "once" },
    ],
    news: { title: "New", text: "…", source: { title: "Tart cherry juice and sleep", url: dead } },
  };
  it("a dead link's item goes, a matching one is marked, an unchecked one stays unmarked, items without a link stay", async () => {
    const { f, opened } = web(pages);
    const a = await checkReadLinks(read, f);
    expect(a.items.map((i) => [i.title, i.source?.checked ?? null])).toEqual([["Coffee at 4 pm still costs you sleep", true], ["Your late coffees", null], ["Unchecked", null]]);
    // the study question cites the caffeine page for magnesium: it goes; a question without a source stays
    expect(a.questions!.map((q) => q.key)).toEqual(["mag"]);
    expect(a.news).toBeNull();
    // each link opened once, each citation of it judged on its own: the item's title matches, the question's doesn't
    expect(opened.filter((u) => u === ok)).toHaveLength(1);
    expect(a.greeting).toBe("Morning");
  });
  it("nothing to check: as it was", async () => {
    const { f, opened } = web({});
    const plain: DigestAnswer = { greeting: "Hi", items: [{ type: "pattern", title: "x", text: "y" }] };
    expect(await checkReadLinks(plain, f)).toEqual(plain);
    expect(opened).toEqual([]);
  });
});

describe("a supplement's sources", () => {
  it("dead or mismatched ones are left out, a matching one marked", async () => {
    const { f } = web({ "https://ods.od.nih.gov/caf": { html: "<title>Caffeine - Health Professional Fact Sheet</title>" }, "https://gone.example.com/x": { status: 410 } });
    const a = { name: "Caffeine", what: "", usualDose: "", timing: "", evidence: "strong", uses: [], cautions: [], interactions: [],
      sources: [{ title: "NIH: caffeine fact sheet", url: "https://ods.od.nih.gov/caf" }, { title: "Old page", url: "https://gone.example.com/x" }, { title: "Blocked", url: "https://academic.example.com/2" }] } as SupplementAnswer;
    expect((await checkSupplementLinks(a, f)).sources).toEqual([{ title: "NIH: caffeine fact sheet", url: "https://ods.od.nih.gov/caf", checked: true }, { title: "Blocked", url: "https://academic.example.com/2" }]);
  });
});
