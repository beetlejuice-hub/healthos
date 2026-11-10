import { describe, expect, it } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { handleAi, whyFailed } from "./ai";
import { SCHEMAS, SYSTEM } from "../src/lib/ai/tasks";

/** A fake Supabase (one user, the docs table) and a fake Anthropic API, behind one fetch. */
function world(answers: unknown[], opts: { usage?: object; /** Pages the cited links open (PLAN 160); any other site answers 403, as one that blocks robots. */ pages?: Record<string, { status?: number; html?: string } | "no-such-site">;
  /** Gemini's answers in turn (3 Nov): its text, or a status it fails with. */ gemini?: { status?: number; text?: string }[] } = {}) {
  const docs = new Map<string, unknown>();
  const gemSent: { url: string; body: Record<string, unknown>; headers: Record<string, string> }[] = [];
  if (opts.usage) docs.set("ai_usage", opts.usage);
  const sent: { url: string; body: Record<string, unknown>; headers: Record<string, string> }[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    const url = new URL(req.url);
    if (url.pathname === "/auth/v1/user") return req.headers.get("authorization") === "Bearer good" ? Response.json({ id: "u1" }) : new Response("no", { status: 401 });
    if (url.pathname === "/rest/v1/docs") {
      // PostgREST as the Worker uses it: an upsert (or an insert that skips an existing row), and an update only where the
      // stored rev still matches (`value->>rev=eq.3` / `is.null`) — what keeps two overlapping calls from losing a cost
      if (req.method === "POST") {
        const skip = /ignore-duplicates/.test(req.headers.get("prefer") ?? ""), rows = (await req.json()) as { key: string; value: unknown }[];
        const put = rows.filter((r) => !(skip && docs.has(r.key)));
        for (const r of put) docs.set(r.key, r.value);
        return Response.json(put, { status: 201 });
      }
      if (req.method === "PATCH") {
        const want = url.searchParams.get("value->>rev"), cur = docs.get("ai_usage") as { rev?: number } | undefined;
        if (!cur || (want === "is.null" ? cur.rev != null : want !== `eq.${cur.rev}`)) return Response.json([]);
        const { value } = (await req.json()) as { value: unknown };
        docs.set("ai_usage", value); return Response.json([{ value }]);
      }
      const v = docs.get("ai_usage"); return Response.json(v ? [{ value: v }] : []);
    }
    if (url.hostname === "api.anthropic.com") {
      const body = (await req.json()) as Record<string, unknown>;
      sent.push({ url: req.url, body, headers: Object.fromEntries(req.headers) });
      // a reply's own `usage`, its `ms` (a deep dive searches for minutes), or the API's `error` as it sends one
      const a = answers.shift() as { text: string; stop?: string; searches?: number; blocks?: string[]; content?: unknown[]; usage?: object; ms?: number; error?: { status: number; type: string; message: string } };
      if (a.ms) await new Promise((ok) => setTimeout(ok, a.ms));
      if (a.error) return Response.json({ type: "error", error: { type: a.error.type, message: a.error.message } }, { status: a.error.status });
      return Response.json({ id: "msg_1", type: "message", role: "assistant", model: body.model, content: a.content ?? (a.blocks ?? [a.text]).map((text) => ({ type: "text", text })), stop_reason: a.stop ?? "end_turn", stop_sequence: null,
        usage: a.usage ?? { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, server_tool_use: { web_search_requests: a.searches ?? 0 } } });
    }
    if (url.hostname === "generativelanguage.googleapis.com") {
      gemSent.push({ url: req.url, body: (await req.json()) as Record<string, unknown>, headers: Object.fromEntries(req.headers) });
      const g = opts.gemini?.shift();
      if (!g) throw new Error("Gemini asked more times than this test expects");
      if (g.status && g.status >= 400) return Response.json({ error: { code: g.status, status: g.status === 429 ? "RESOURCE_EXHAUSTED" : "INTERNAL", message: "fake" } }, { status: g.status });
      return Response.json({ candidates: [{ content: { role: "model", parts: [{ text: g.text ?? "" }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 800, candidatesTokenCount: 200, thoughtsTokenCount: 100 } });
    }
    if (url.protocol === "https:" && !/supabase|anthropic/.test(url.hostname)) {
      const p = opts.pages?.[req.url];
      if (p === "no-such-site") throw new TypeError("fetch failed: getaddrinfo ENOTFOUND");
      return p ? new Response(p.html ?? "", { status: p.status ?? 200, headers: { "content-type": "text/html; charset=utf-8" } }) : new Response("Forbidden", { status: 403 });
    }
    throw new Error(`unexpected ${req.url}`);
  }) as typeof fetch;
  return { docs, sent, gemSent, deps: { fetch: fetcher, now: () => Date.UTC(2026, 9, 1, 10) } };
}
const env = { ANTHROPIC_API_KEY: "sk-test" };
const post = (body: unknown, token = "good") => new Request("https://app/api/ai", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) });

const coffee = { items: [{ kind: "drink", name: "Long coffee, large", amount: "1 large cup", drink: { ml: 300, caffeineMg: 150, alcoholG: 0, kcal: 3 }, confidence: "medium", note: "assumed a double shot" }] };

describe("/api/ai", () => {
  it("chat looks things up (PLAN 67): the app's tools offered, a tool round handed back, the results continued, one call counted", async () => {
    const think = { type: "thinking", thinking: "", signature: "sig-1" };
    const use = { type: "tool_use", id: "tu_1", name: "day", input: { date: "2026-10-14" } };
    const w = world([{ text: "", stop: "tool_use", content: [think, { type: "text", text: "Let me look." }, use] }, { text: "You slept **7 h** that night." }], { usage: { day: "2026-10-01", calls: 49, dayUsd: 1, month: "2026-10", monthUsd: 3, byModel: {} } });
    const msgs = [{ role: "user", text: "how did I sleep on Wednesday?" }];
    const r1 = (await (await handleAi(post({ task: "chat", messages: msgs, context: "ctx" }), env, w.deps)).json()) as { answer: { reply: string; calls: { id: string; name: string; input: unknown }[]; turn: { role: string; content: unknown[] }[] }; usage: { calls: number } };
    expect(r1.answer.calls).toEqual([{ id: "tu_1", name: "day", input: { date: "2026-10-14" } }]);
    expect(r1.answer.turn).toEqual([{ role: "assistant", content: [think, { type: "text", text: "Let me look." }, use] }]); // exactly as it came, thinking included
    expect(r1.usage.calls).toBe(50);
    const sent = w.sent[0].body as { tools: { name: string; type?: string; strict?: boolean; max_uses?: number }[]; output_config: { format?: unknown }; tool_choice?: unknown };
    expect(sent.tools.map((t) => t.name)).toEqual(["day", "series", "find", "show_chart", "compare", "nights", "sessions", "propose", "remember", "web_search"]);
    // strict, all but propose: 28 optional fields, past the API's 24 for a request (28 Oct: every chat message turned down)
    expect(sent.tools.slice(0, 9).filter((t) => t.strict !== true).map((t) => t.name)).toEqual(["propose"]);
    expect(sent.tools[9]).toMatchObject({ type: "web_search_20260209", max_uses: 2 });
    expect(sent.output_config.format).toBeUndefined(); // replies are Markdown now, not JSON
    expect(sent.tool_choice).toBeUndefined();
    // the app ran the tool; the same message continues — past the daily 50 it still goes through, and isn't counted again
    const turn = [...r1.answer.turn, { role: "user", content: [{ type: "tool_result", tool_use_id: "tu_1", content: "Wed 14 Oct: asleep 7 h 02" }] }];
    const res2 = await handleAi(post({ task: "chat", messages: msgs, context: "ctx", turn, final: true }), env, w.deps);
    const r2 = (await res2.json()) as { answer: { reply: string; calls?: unknown }; usage: { calls: number; recent: unknown[] } };
    expect(res2.status).toBe(200);
    expect(r2.answer).toEqual({ reply: "You slept **7 h** that night.", remember: [] });
    expect(r2.usage.calls).toBe(50);
    expect(r2.usage.recent).toHaveLength(2); // both priced and logged
    const sent2 = w.sent[1].body as { messages: unknown[]; tool_choice?: unknown; system: { text: string }[] };
    expect(sent2.messages).toEqual([{ role: "user", content: "how did I sleep on Wednesday?" }, ...turn]);
    expect(sent2.tool_choice).toEqual({ type: "none" }); // the last round answers with what it has
    expect(sent2.system).toEqual((w.sent[0].body as { system: unknown }).system); // byte for byte: cached, and the thinking stays valid
    // a new message at the limit is refused
    expect((await handleAi(post({ task: "chat", messages: msgs, context: "ctx" }), env, w.deps)).status).toBe(429);
  });

  it("review: the week read on the reads' model (Sonnet), the enforced shape, a bad request refused (PLAN 65)", async () => {
    const ans = { title: "Better mood, short on protein", summary: "Mood **7.5** against a usual 6.", notices: [{ title: "Mood up", text: "7.5 all week.", measure: "mood" }, { title: "", text: "dropped", measure: "" }], next: [{ what: "Protein at lunch", why: "0 of 7 days at goal" }], remember: [] };
    const w = world([{ text: JSON.stringify(ans) }]);
    const res = await handleAi(post({ task: "review", kind: "week", from: "2026-10-12", to: "2026-10-18", context: "## The week 12 Oct–18 Oct" }), env, w.deps);
    const body = (await res.json()) as { answer: { title: string; notices: { measure: string }[]; next: unknown[] } };
    expect(res.status).toBe(200);
    expect(body.answer.title).toBe("Better mood, short on protein");
    expect(body.answer.notices).toEqual([{ title: "Mood up", text: "7.5 all week.", measure: "mood" }]); // an empty notice left out
    const sent = w.sent[0].body;
    expect(sent.model).toBe("claude-sonnet-5-5");
    expect((sent.output_config as { format: { type: string } }).format.type).toBe("json_schema");
    expect(sent.tools).toBeUndefined();
    expect(JSON.stringify(sent.messages)).toContain("Write my week read: 2026-10-12 to 2026-10-18");
    expect((await handleAi(post({ task: "review", kind: "year", from: "2026-10-12", to: "2026-10-18", context: "x" }), env, world([]).deps)).status).toBe(400);
  });

  it("describe with lookup (owner, 15 Oct: a dish the lists don't have → ask the AI, on the net or from knowledge)", async () => {
    const soup = { items: [{ kind: "food", name: "Pityókaleves", amount: "1 bowl", per100: { kcal: 62, p: 1.6, c: 7.5, f: 2.8 }, unit: { name: "bowl", g: 350 }, count: 1, confidence: "medium", note: "typical home recipe · ciorbă de cartofi" }] };
    const json = JSON.stringify(soup), cut = json.indexOf("home recipe");
    // a cited search answer comes back in pieces, split anywhere — here inside the note
    const w = world([{ text: "", blocks: ["Searching a recipe table. ", json.slice(0, cut), json.slice(cut)], searches: 1 }]);
    const res = await handleAi(post({ task: "describe", text: "pityoka leves", lookup: true }), env, w.deps);
    const body = (await res.json()) as { answer: { items: { name: string; unit: { g: number } }[] } };
    expect(res.status).toBe(200);
    expect(body.answer.items[0]).toMatchObject({ name: "Pityókaleves", unit: { name: "bowl", g: 350 } });
    const sent = w.sent[0].body;
    expect(sent.model).toBe("claude-haiku-5-5");
    expect(sent.tools).toEqual([{ type: "web_search_20250305", name: "web_search", max_uses: 1 }]);
    expect((sent.output_config as { format?: unknown }).format).toBeUndefined();
    expect(JSON.stringify(sent.messages)).toContain("Look up: pityoka leves");
    expect((w.docs.get("ai_usage") as { recent: { searches: number }[] }).recent[0].searches).toBe(1);
    // without lookup, or with a photo: no search, the enforced shape as before
    const w2 = world([{ text: JSON.stringify(soup) }]);
    await handleAi(post({ task: "describe", text: "pityoka leves" }), env, w2.deps);
    expect(w2.sent[0].body.tools).toBeUndefined();
    expect((w2.sent[0].body.output_config as { format: { type: string } }).format.type).toBe("json_schema");
  });

  it("needs a signed-in user and the key", async () => {
    const w = world([]);
    expect((await handleAi(post({ task: "describe", text: "x" }, "bad"), env, w.deps)).status).toBe(401);
    expect((await handleAi(post({ task: "describe", text: "x" }), {}, w.deps)).status).toBe(503);
  });

  it("describe: structured answer, checked, usage and cost recorded", async () => {
    const w = world([{ text: JSON.stringify(coffee) }]);
    const res = await handleAi(post({ task: "describe", text: "my usual long coffee, big cup", models: { light: "opus" } }), env, w.deps);
    const body = (await res.json()) as { answer: { items: { name: string }[] }; usage: { calls: number; dayUsd: number }; costUsd: number };
    expect(res.status).toBe(200);
    expect(body.answer.items[0].name).toBe("Long coffee, large");
    expect(body.costUsd).toBeCloseTo((1000 * 4 + 500 * 20) / 1e6, 6); // Opus 5.5 list price
    expect(w.docs.get("ai_usage")).toMatchObject({ day: "2026-10-01", calls: 1 });
    // each call logged as billed, so Settings can show what it cost and estimate from it (owner, 15 Oct)
    expect((w.docs.get("ai_usage") as { recent: unknown[] }).recent).toEqual([{ at: expect.any(Number), task: "describe", model: "opus", in: 1000, cached: 0, written: 0, out: 500, searches: 0, usd: body.costUsd }]);
    const sent = w.sent[0].body;
    expect(sent.model).toBe("claude-opus-5-5");
    expect(sent.fallbacks).toBe("default");
    expect(w.sent[0].headers["anthropic-beta"]).toContain("server-side-fallback-2026-07-01");
    expect(sent.thinking).toEqual({ type: "adaptive" });
    expect((sent.output_config as { effort: string }).effort).toBe("low");
    expect((sent.output_config as { format: { type: string } }).format.type).toBe("json_schema");
  });

  it("the cheaper model when chosen: Haiku 5.5, adaptive thinking, the basic web search, no fallback", async () => {
    const w = world([{ text: JSON.stringify({ name: "Ashwagandha", what: "adaptogen", usualDose: "300–600 mg", timing: "any regular time", evidence: "moderate", uses: ["stress"], cautions: ["thyroid"], interactions: [{ with: "Saffron", verdict: "none", say: "no known interaction" }], sources: [{ title: "NIH ODS", url: "https://ods.od.nih.gov/x" }] }), searches: 3 }]);
    const res = await handleAi(post({ task: "supplement", name: "Ashwagandha", context: "psoriasis", models: { research: "haiku" } }), env, w.deps);
    expect(res.status).toBe(200);
    const s = w.sent[0].body;
    expect(s.model).toBe("claude-haiku-5-5");
    expect(s.thinking).toEqual({ type: "adaptive" });
    expect(s.fallbacks).toBeUndefined();
    expect((s.tools as { type: string }[])[0].type).toBe("web_search_20250305");
    expect(((await res.json()) as { costUsd: number }).costUsd).toBeCloseTo((1000 * 0.1 + 500 * 0.5) / 1e6 + 0.03, 6);
  });

  it("owner, 15 Oct: food and quick questions on the cheap model, chat and research on the strong one — also for an older synced doc with no light tier", async () => {
    const run = async (body: { task: string } & Record<string, unknown>) => { const w = world([{ text: JSON.stringify(body.task === "describe" ? coffee : { reply: "hi", remember: [] }) }]); await handleAi(post(body), env, w.deps); return w.sent[0].body.model; };
    expect(await run({ task: "describe", text: "coffee" })).toBe("claude-haiku-5-5");
    expect(await run({ task: "describe", text: "coffee", models: { everyday: "opus", research: "opus" } })).toBe("claude-haiku-5-5");
    expect(await run({ task: "chat", messages: [{ role: "user", text: "yo" }], context: "c", models: { everyday: "opus", research: "opus" } })).toBe("claude-opus-5-5");
    // the chat's default is Sonnet; a pick of Opus (above) still goes
    expect(await run({ task: "chat", messages: [{ role: "user", text: "yo" }], context: "c" })).toBe("claude-sonnet-5-5");
  });

  it("past the month's $20, everything on Haiku 5.5 until the 1st; the usage says the budget", async () => {
    const usage = { day: "2026-10-01", calls: 3, dayUsd: 1, month: "2026-10", monthUsd: 20.4, byModel: {} };
    const w = world([{ text: JSON.stringify({ reply: "hi", remember: [] }) }], { usage });
    expect((await handleAi(post({ task: "chat", messages: [{ role: "user", text: "yo" }], context: "c", models: { everyday: "opus" } }), env, w.deps)).status).toBe(200);
    expect(w.sent[0].body.model).toBe("claude-haiku-5-5");
    const w2 = world([{ text: JSON.stringify({ reply: "hi", remember: [] }) }], { usage: { ...usage, monthUsd: 9.9 } });
    await handleAi(post({ task: "chat", messages: [{ role: "user", text: "yo" }], context: "c", models: { everyday: "opus" } }), env, w2.deps);
    expect(w2.sent[0].body.model).toBe("claude-opus-5-5");
    // between $10 and $20 the chat drops to Haiku, the research keeps its pick (owner, 10 Nov: "keep usage at 10 dollar mark")
    const w4 = world([{ text: JSON.stringify({ reply: "hi", remember: [] }) }], { usage: { ...usage, monthUsd: 12 } });
    await handleAi(post({ task: "chat", messages: [{ role: "user", text: "yo" }], context: "c", models: { everyday: "opus" } }), env, w4.deps);
    expect(w4.sent[0].body.model).toBe("claude-haiku-5-5");
    const w3 = world([{ text: JSON.stringify({ reply: "hi", remember: [] }) }], { usage: { ...usage, month: "2026-09" } }); // a new month starts at 0
    await handleAi(post({ task: "chat", messages: [{ role: "user", text: "yo" }], context: "c", models: { everyday: "opus" } }), env, w3.deps);
    expect(w3.sent[0].body.model).toBe("claude-opus-5-5");
    const g = (await (await handleAi(new Request("https://app/api/ai/usage", { headers: { authorization: "Bearer good" } }), env, world([]).deps)).json()) as { budget: number };
    expect(g.budget).toBe(20);
  });

  it("drops answers that don't make physical sense", async () => {
    const w = world([{ text: JSON.stringify({ items: [{ kind: "food", name: "Magic bar", amount: "1", per100: { kcal: 2000, p: 10, c: 10, f: 10 }, unit: { name: "bar", g: 50 }, count: 1, confidence: "low", note: "" }, coffee.items[0]] }) }]);
    const body = (await (await handleAi(post({ task: "describe", text: "bar and coffee" }), env, w.deps)).json()) as { answer: { items: unknown[]; dropped: string[] } };
    expect(body.answer.items).toHaveLength(1);
    expect(body.answer.dropped).toEqual(["Magic bar"]);
  });

  it("hard daily cap, reset on a new day", async () => {
    const w = world([], { usage: { day: "2026-10-01", calls: 50, dayUsd: 1, month: "2026-10", monthUsd: 5, byModel: {} } });
    expect((await handleAi(post({ task: "describe", text: "x" }), env, w.deps)).status).toBe(429);
    expect(w.sent).toHaveLength(0);
    const w2 = world([{ text: JSON.stringify(coffee) }], { usage: { day: "2026-09-30", calls: 50, dayUsd: 1, month: "2026-09", monthUsd: 5, byModel: {} } });
    const res = await handleAi(post({ task: "describe", text: "x" }), env, w2.deps);
    expect(res.status).toBe(200);
    expect(w2.docs.get("ai_usage")).toMatchObject({ calls: 1, month: "2026-10" });
  });

  it("a web-search turn that pauses is continued", async () => {
    const digest = { greeting: "Morning!", items: [{ type: "study", title: "Creatine and sleep", text: "…", source: { title: "Study", url: "https://example.org/s" } }, { type: "fact", title: "No source", text: "dropped" }] };
    const w = world([{ text: "searching", stop: "pause_turn", searches: 2 }, { text: `Here: ${JSON.stringify(digest)}`, searches: 1 }]);
    const res = await handleAi(post({ task: "digest", context: "c", shown: [] }), env, w.deps);
    const body = (await res.json()) as { answer: { items: { title: string }[] }; costUsd: number };
    expect(w.sent).toHaveLength(2);
    expect(body.answer.items.map((i) => i.title)).toEqual(["Creatine and sleep"]); // a fact without a source isn't shown
    expect(body.costUsd).toBeCloseTo((2000 * 2 + 1000 * 10) / 1e6 + 0.03, 6); // the reads on Sonnet 5.5
  });

  it("the read's links are opened before you see it: a dead one's item goes, a matching one is marked (PLAN 160)", async () => {
    const good = "https://pubmed.ncbi.nlm.nih.gov/24235903/", gone = "https://pubmed.ncbi.nlm.nih.gov/99999999/";
    const digest = { greeting: "Morning!", items: [
      { type: "study", title: "Coffee at 4 pm still costs you sleep", text: "…", source: { title: "Caffeine effects on sleep taken 6 hours before bed", url: good } },
      { type: "try", title: "Tart cherry before bed", text: "…", source: { title: "Tart cherry juice and sleep", url: gone } },
      { type: "study", title: "Blocked publisher", text: "…", source: { title: "Creatine and sleep", url: "https://academic.example.com/1" } },
    ] };
    const w = world([{ text: JSON.stringify(digest), searches: 2 }], { pages: { [good]: { html: "<title>Caffeine effects on sleep taken 0, 3, or 6 hours before going to bed - PubMed</title>" }, [gone]: { status: 404 } } });
    const body = (await (await handleAi(post({ task: "digest", context: "c", shown: [] }), env, w.deps)).json()) as { answer: { items: { title: string; source?: { checked?: boolean } }[] } };
    expect(body.answer.items.map((i) => [i.title, i.source?.checked ?? false])).toEqual([["Coffee at 4 pm still costs you sleep", true], ["Blocked publisher", false]]);
  });

  it("a read may ask for the app's numbers first: its look-ups go back to the app, the next round carries the results, one call counted (PLAN 160)", async () => {
    const digest = { greeting: "Morning", items: [{ type: "pattern", title: "Drinks cost you a point of sleep", text: "5.1 after drinks vs 7.9 without — clear.", measure: "sleep" }] };
    const call = { type: "tool_use", id: "tu_1", name: "compare", input: { measure: "sleep", thing: "drinks", when: "next_day", from: "2026-09-01", to: "2026-09-30" } };
    const w = world([{ text: "", stop: "tool_use", content: [{ type: "text", text: "Let me check." }, call] }, { text: JSON.stringify(digest) }]);
    // round 1: the look-up comes back to the app, with this call's turn to send back as it was
    const r1 = (await (await handleAi(post({ task: "digest", context: "c", shown: [] }), env, w.deps)).json()) as { answer: { calls: { id: string; name: string }[]; turn: unknown[] } };
    expect(r1.answer.calls).toEqual([{ id: "tu_1", name: "compare", input: call.input }]);
    expect(r1.answer.turn).toHaveLength(1);
    const tools = (w.sent[0].body.tools as { name: string }[]).map((t) => t.name);
    expect([...tools].sort()).toEqual(["compare", "day", "find", "nights", "series", "sessions", "web_search"]); // the read-only ones: never propose or remember
    expect(JSON.stringify(w.sent[0].body.messages)).toContain('"cache_control":{"type":"ephemeral"}'); // the data block, cached for the next round
    // round 2: the app's result goes back; the last round may not look anything up
    const turn = [...r1.answer.turn, { role: "user", content: [{ type: "tool_result", tool_use_id: "tu_1", content: "Sleep rating the next day with drinks vs without — with: average 5.1 over 9 days; without: 7.9 over 20. Difference −2.8 (95% range −3.3 to −2.3): clear." }] }];
    const res = await handleAi(post({ task: "digest", context: "c", shown: [], turn, final: true }), env, w.deps);
    const r2 = (await res.json()) as { answer: { items: { title: string }[] } };
    expect(r2.answer.items.map((i) => i.title)).toEqual(["Drinks cost you a point of sleep"]);
    expect(w.sent[1].body.tool_choice).toEqual({ type: "none" });
    expect(JSON.stringify(w.sent[1].body.messages)).toContain("Difference −2.8");
    expect(w.docs.get("ai_usage")).toMatchObject({ calls: 1 }); // the read's rounds are one call
    // a look-up the reads don't have is not passed on
    const w2 = world([{ text: "", stop: "tool_use", content: [{ type: "tool_use", id: "tu_2", name: "propose", input: { change: "goals" } }] }]);
    const res3 = await handleAi(post({ task: "digest", context: "c", shown: [] }), env, w2.deps);
    // …and with nothing else in it, it's an answer in the wrong shape (502, "try again") — not a crash
    expect(res3.status).toBe(502);
    expect(((await res3.json()) as { error: string }).error).toBe("bad-answer");
  });

  it("a read that searched the web before it looked something up goes on: its turn carries the pages, well past 400 kB (22 Oct)", async () => {
    // four searches of 8 pages, each page's text encrypted (~20 kB) — as the API sends them back
    const page = (i: number) => ({ type: "web_search_result", url: `https://pubmed.ncbi.nlm.nih.gov/${i}/`, title: `Study ${i}`, encrypted_content: "E".repeat(20_000), page_age: null });
    const searched = [0, 1, 2, 3].flatMap((s) => [{ type: "server_tool_use", id: `srv_${s}`, name: "web_search", input: { query: `q${s}` } }, { type: "web_search_tool_result", tool_use_id: `srv_${s}`, content: Array.from({ length: 8 }, (_, i) => page(s * 8 + i)) }]);
    const turn = [{ role: "assistant", content: [...searched, { type: "tool_use", id: "tu_1", name: "compare", input: {} }] }, { role: "user", content: [{ type: "tool_result", tool_use_id: "tu_1", content: "with: 5.1; without: 7.9 — clear." }] }];
    expect(JSON.stringify(turn).length).toBeGreaterThan(600_000);
    const digest = { greeting: "Morning", items: [{ type: "fact", title: "A fact", text: "Words." }] };
    for (const task of ["digest", "night", "dive"] as const) {
      const w = world([{ text: JSON.stringify(task === "night" ? { summary: "s", happened: [], notes: "", change: [], remember: [] } : task === "dive" ? { topic: "t", verdict: "v", found: [] } : digest) }]);
      const res = await handleAi(post({ task, day: "2026-10-01", context: "c", shown: [], turn, final: true }), env, w.deps);
      expect([task, res.status]).toEqual([task, 200]);
      expect(w.sent).toHaveLength(1);
    }
    // …and a chat message's rounds the same
    const w = world([{ text: JSON.stringify({ reply: "hi", remember: [] }) }]);
    expect((await handleAi(post({ task: "chat", messages: [{ role: "user", text: "hi" }], context: "c", turn, final: true }), env, w.deps)).status).toBe(200);
    // still not without end: refused before anything is spent
    const huge = [{ role: "assistant", content: [{ type: "text", text: "x".repeat(12_100_000) }] }];
    const w2 = world([]);
    expect((await handleAi(post({ task: "digest", context: "c", shown: [], turn: huge }), env, w2.deps)).status).toBe(400);
    expect(w2.sent).toHaveLength(0);
  });

  it("the weekly deep dive: up to 5 searches and the reads' look-ups; its studies' links checked (PLAN 160)", async () => {
    const good = "https://pubmed.ncbi.nlm.nih.gov/34883514/", gone = "https://journal.example.com/missing";
    const dive = { topic: "Is magnesium doing anything for your sleep?", why: "40 nights on it.", yourData: "6.4 with vs 6.6 without — not clear.", verdict: "Your data can't tell yet.", sure: "weak",
      found: [{ title: "Magnesium and sleep in older adults", text: "Small effect on sleep onset.", source: { title: "Magnesium supplementation and sleep in older adults", url: good } }, { title: "Gone", text: "…", source: { title: "Magnesium and REM sleep", url: gone } }] };
    const w = world([{ text: JSON.stringify(dive), searches: 8 }], { pages: { [good]: { html: "<title>Oral magnesium supplementation for insomnia in older adults: a systematic review - PubMed</title><meta name=\"citation_title\" content=\"Oral magnesium supplementation for insomnia in older adults\">" }, [gone]: { status: 404 } } });
    const res = await handleAi(post({ task: "dive", context: "c" }), env, w.deps);
    const body = (await res.json()) as { answer: { found: { title: string; source: { checked?: boolean } }[]; topic: string } };
    expect(res.status).toBe(200);
    expect(body.answer.topic).toBe("Is magnesium doing anything for your sleep?");
    expect(body.answer.found.map((f) => [f.title, f.source.checked ?? false])).toEqual([["Magnesium and sleep in older adults", true]]);
    const tools = w.sent[0].body.tools as { name: string; max_uses?: number }[];
    expect(tools.find((t) => t.name === "web_search")?.max_uses).toBe(5);
    expect(tools.some((t) => t.name === "compare")).toBe(true);
    expect(JSON.stringify(w.sent[0].body.system)).toContain("this week's deep dive");
  });

  it("an experiment's verdict: a few searches, its studies' links checked (PLAN 160)", async () => {
    const v = { text: "Energy went up 1.5 — clear. Studies on afternoon caffeine and sleep fit that.", next: "Keep the 14:00 cut-off", found: [{ title: "Caffeine 6 h before bed", text: "Cut sleep by an hour.", source: { title: "Caffeine effects on sleep taken 6 hours before bed", url: "https://pubmed.ncbi.nlm.nih.gov/24235903/" } }] };
    const w = world([{ text: JSON.stringify(v), searches: 2 }], { pages: { "https://pubmed.ncbi.nlm.nih.gov/24235903/": { html: "<title>Caffeine effects on sleep taken 0, 3, or 6 hours before going to bed - PubMed</title>" } } });
    const res = await handleAi(post({ task: "verdict", context: "## The experiment\n- The app's result: worked for you" }), env, w.deps);
    const body = (await res.json()) as { answer: { text: string; found: { source: { checked?: boolean } }[] } };
    expect(res.status).toBe(200);
    expect(body.answer.found[0].source.checked).toBe(true);
    expect((w.sent[0].body.tools as { name: string; max_uses: number }[])).toEqual([expect.objectContaining({ name: "web_search", max_uses: 2 })]);
    expect(JSON.stringify(w.sent[0].body.system)).toContain("The app's result is THE result");
  });

  it("the app's own research: 2 searches at most, on the reads' model, its sources' links checked, an empty answer refused (PLAN 192)", async () => {
    const a = { title: "Creatine at 5 g: does the timing matter?", known: "Daily intake matters more than timing; 3–5 g a day saturates muscle in about a month.", forYou: "You take 5 g on 14 of 14 days — that's the dose studied.", tip: "Keep it daily, any time", sure: "strong",
      found: [{ title: "ISSN position stand", text: "3–5 g/day is effective and safe.", source: { title: "ISSN position stand: creatine", url: "https://pubmed.ncbi.nlm.nih.gov/28615996/" } }, { title: "no link", text: "dropped", source: { title: "x", url: "ftp://x" } }] };
    const w = world([{ text: JSON.stringify(a), searches: 2 }], { pages: { "https://pubmed.ncbi.nlm.nih.gov/28615996/": { html: "<title>International Society of Sports Nutrition position stand: safety and efficacy of creatine supplementation - PubMed</title>" } } });
    const res = await handleAi(post({ task: "research", context: "## About me\n## The topic (the app's pick, from my data)\n- What: a supplement I take — Creatine, 5 g" }), env, w.deps);
    const body = (await res.json()) as { answer: { title: string; found: { source: { checked?: boolean } }[] } };
    expect(res.status).toBe(200);
    expect(body.answer.title).toBe(a.title);
    expect(body.answer.found).toHaveLength(1);
    expect(body.answer.found[0].source.checked).toBe(true);
    expect((w.sent[0].body.tools as { name: string; max_uses: number }[])).toEqual([expect.objectContaining({ name: "web_search", max_uses: 2 })]);
    expect(w.sent[0].body.model).toBe("claude-sonnet-5-5");
    expect(JSON.stringify(w.sent[0].body.system)).toContain("the app's own research on ONE thing");
    const bad = world([{ text: JSON.stringify({ title: "", known: "" }) }]);
    expect((await handleAi(post({ task: "research", context: "c" }), env, bad.deps)).status).not.toBe(200);
  });

  it("night: the day is read back with web search (its study and thing to try need sources), from text, and checked", async () => {
    const night = { summary: "A steady day; stress peaked at 14:00 with the deadline you noted.", happened: ["2 coffees, last 13:00", "gym 18:00", "x", "y", "dropped"], notes: "You wrote 'deadline' at 14:00 — the stress 8 fits that.", change: [{ what: "Walk after lunch", why: "your 15:00 dip" }, { what: "b", why: "" }, { what: "dropped", why: "" }], remember: ["Stress runs high on deadline days."],
      // PLAN 157: the evening's three — a study and a try need a real link; the morning's other kinds aren't the evening's
      items: [{ type: "study", title: "Deadlines and sleep", text: "Work stress late in the day pushed sleep onset back in a 2025 study.", tip: "Write tomorrow's list before 20:00", measure: "stress", source: { title: "Sleep 2025", url: "https://example.org/s" } },
        { type: "try", title: "No source", text: "dropped" }, { type: "noticed", title: "Your 15:00 dip came after lunch again", text: "Third time this week.", measure: "energy" }, { type: "pattern", title: "a morning kind", text: "dropped" }],
      questions: [{ kind: "investigate", text: "Was the 15:00 dip food, or the deadline?", options: ["Food", "Deadline", "Both"], why: "dips on 3 of 5 days", key: "dip_cause" }] };
    const w = world([{ text: `Here it is: ${JSON.stringify(night)}`, searches: 2 }]);
    const res = await handleAi(post({ task: "night", day: "2026-10-01", context: "## Today, as it happened\n- 14:00 check-in: stress 8 · my note: \"deadline\"" }), env, w.deps);
    const body = (await res.json()) as { answer: typeof night };
    expect(res.status).toBe(200);
    expect(body.answer.happened).toHaveLength(4);
    expect(body.answer.change).toHaveLength(2);
    expect(body.answer.items.map((i) => i.title)).toEqual(["Deadlines and sleep", "Your 15:00 dip came after lunch again"]);
    expect(body.answer.questions.map((q) => q.key)).toEqual(["dip_cause"]);
    const sent = w.sent[0].body;
    expect(JSON.stringify(sent.tools)).toContain("web_search");
    expect((sent.output_config as { format?: unknown }).format).toBeUndefined();
    expect(JSON.stringify(sent.messages)).toContain("my note: \\\"deadline\\\"");
    expect(JSON.stringify(sent.system)).toContain("Take them seriously");
  });

  it("night: a bad day or an answer without a summary is refused", async () => {
    expect((await handleAi(post({ task: "night", day: "yesterday", context: "c" }), env, world([]).deps)).status).toBe(400);
    const w = world([{ text: JSON.stringify({ summary: "", happened: [], notes: "", change: [] }) }]);
    expect((await handleAi(post({ task: "night", day: "2026-10-01", context: "c" }), env, w.deps)).status).toBe(502);
  });

  it("a big context (two months of check-ins) is accepted; chat caches it", async () => {
    const big = "x".repeat(44_000);
    expect((await handleAi(post({ task: "questions", context: big, asked: [] }), env, world([{ text: JSON.stringify({ questions: [] }) }]).deps)).status).toBe(200);
    expect((await handleAi(post({ task: "questions", context: "x".repeat(49_000), asked: [] }), env, world([]).deps)).status).toBe(400);
    const w = world([{ text: JSON.stringify({ reply: "hi", remember: [] }) }]);
    await handleAi(post({ task: "chat", messages: [{ role: "user", text: "hi" }], context: big }), env, w.deps);
    expect((w.sent[0].body.system as { cache_control?: unknown }[])[1].cache_control).toEqual({ type: "ephemeral" });
  });

  it("rejects oversized input before spending anything", async () => {
    const w = world([]);
    expect((await handleAi(post({ task: "describe", text: "x".repeat(3000) }), env, w.deps)).status).toBe(400);
    expect((await handleAi(post({ task: "nope" }), env, w.deps)).status).toBe(400);
    expect(w.sent).toHaveLength(0);
  });

  // Owner, 27 Oct: "App says we spent 11 bucks, in reality we spent 18"
  it("two calls at once both count: a deep dive that searches for a while doesn't write over a chat that ended meanwhile", async () => {
    const dive = { topic: "Does a late dinner cost you sleep?", why: "w", yourData: "d", verdict: "v", sure: "weak", found: [] };
    const w = world([
      { text: JSON.stringify(dive), ms: 60, usage: { input_tokens: 10_000, output_tokens: 2000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, server_tool_use: { web_search_requests: 5 } } },
      { text: "Sure." },
    ], { usage: { day: "2026-10-01", calls: 3, dayUsd: 1, month: "2026-10", monthUsd: 5, byModel: { opus: 5 } } });
    const slow = handleAi(post({ task: "dive", context: "c" }), env, w.deps);
    while (!w.sent.length) await new Promise((ok) => setTimeout(ok, 1)); // the dive is with the AI…
    const quick = await handleAi(post({ task: "chat", messages: [{ role: "user", text: "hi" }], context: "c" }), env, w.deps); // …when a chat comes and goes
    expect(quick.status).toBe(200);
    expect((await slow).status).toBe(200);
    const diveUsd = (10_000 * 2 + 2000 * 10) / 1e6 + 5 * 0.01, chatUsd = (1000 * 2 + 500 * 10) / 1e6; // both on Sonnet
    const u = w.docs.get("ai_usage") as { calls: number; dayUsd: number; monthUsd: number; byModel: { opus: number; sonnet: number; haiku: number }; recent: { task: string }[]; rev: number };
    expect(u.calls).toBe(5);
    expect(u.dayUsd).toBeCloseTo(1 + diveUsd + chatUsd, 6);
    expect(u.monthUsd).toBeCloseTo(5 + diveUsd + chatUsd, 6);
    expect(u.byModel.sonnet).toBeCloseTo(diveUsd + chatUsd, 6);
    expect(u.recent.map((r) => r.task)).toEqual(["chat", "dive"]);
    expect(u.rev).toBe(2);
    // and by job (PLAN 195): each call under its own task
    const t = (u as unknown as { byTask: Record<string, number> }).byTask;
    expect([t.dive, t.chat].map((x) => +x.toFixed(6))).toEqual([+diveUsd.toFixed(6), +chatUsd.toFixed(6)]);
  });

  it("a fallback is paid at its own model's rates, the attempt before it too (usage.iterations)", async () => {
    // Opus 5.5 declined (2,000 tokens read, nothing written); Opus 5 answered — the top-level usage is only Opus 5's
    const usage = { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, server_tool_use: { web_search_requests: 0 },
      iterations: [{ type: "message", input_tokens: 2000, output_tokens: 0 }, { type: "fallback_message", model: "claude-opus-5", input_tokens: 1000, output_tokens: 500 }] };
    const w = world([{ text: "Sure.", usage }]);
    const body = (await (await handleAi(post({ task: "chat", messages: [{ role: "user", text: "hi" }], context: "c", models: { everyday: "opus" } }), env, w.deps)).json()) as { costUsd: number };
    expect(body.costUsd).toBeCloseTo((2000 * 4) / 1e6 + (1000 * 5 + 500 * 25) / 1e6, 6);
    expect((w.docs.get("ai_usage") as { dayUsd: number }).dayUsd).toBeCloseTo(body.costUsd, 6);
  });

  it("an answer in the wrong shape is still paid for, and says why it failed", async () => {
    const w = world([{ text: JSON.stringify({ summary: "", happened: [], notes: "", change: [] }) }], { usage: { day: "2026-10-01", calls: 3, dayUsd: 1, month: "2026-10", monthUsd: 10, byModel: {} } });
    const res = await handleAi(post({ task: "night", day: "2026-10-01", context: "c" }), env, w.deps);
    const body = (await res.json()) as { error: string; message: string; costUsd: number };
    expect([res.status, body.error]).toEqual([502, "bad-answer"]);
    expect(body.message).toBe("The AI's answer came back in the wrong shape. (bad-answer)");
    expect(w.docs.get("ai_usage")).toMatchObject({ calls: 4, dayUsd: 1 + body.costUsd, recent: [{ task: "night" }] });
    expect(body.costUsd).toBeGreaterThan(0);
  });

  // Owner, 27 Oct: "we need error codes for stuff… i should know what caused"
  it("each failure says its cause and code: credit gone, a spend limit, the key, overloaded; nothing is charged for them", async () => {
    const said = async (error: { status: number; type: string; message: string }, n = 1) => {
      const w = world(Array.from({ length: n }, () => ({ text: "", error })));
      const res = await handleAi(post({ task: "describe", text: "x" }), env, w.deps);
      const b = (await res.json()) as { error: string; message: string };
      expect(w.docs.get("ai_usage")).toBeUndefined();
      return [res.status, b.error, b.message];
    };
    expect(await said({ status: 400, type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits." }))
      .toEqual([402, "no-credit", "The Anthropic account is out of credit — top it up in the Anthropic console, under Billing. Nothing AI works until then. (no-credit)"]);
    expect((await said({ status: 400, type: "invalid_request_error", message: "You have reached your specified workspace API usage limits. You will regain access on 2026-11-01." }))[1]).toBe("spend-limit");
    expect((await said({ status: 401, type: "authentication_error", message: "invalid x-api-key" }))[1]).toBe("bad-key");
    expect((await said({ status: 400, type: "invalid_request_error", message: "messages.0: something odd" }))[2]).toBe("Anthropic turned this request down. (ai-error 400: messages.0: something odd)");
    expect(whyFailed(new Anthropic.InternalServerError(529, { type: "overloaded_error" }, "Overloaded", new Headers()))).toEqual(["overloaded", 503]);
    expect(whyFailed(new Anthropic.APIConnectionError({ message: "fetch failed" }))).toEqual(["no-network", 502]);
    expect(whyFailed(new Anthropic.APIConnectionTimeoutError())).toEqual(["ai-timeout", 504]);
    expect(whyFailed(new TypeError("x is undefined"))).toEqual(["server-error", 500, "x is undefined"]);
  });

  it("a web search that failed is said with the answer (owner: \"if ai cant access the internet… i should know\")", async () => {
    const digest = { greeting: "Morning!", items: [{ type: "fact", title: "Protein first", text: "…", measure: "protein" }] };
    const fail = { type: "web_search_tool_result", tool_use_id: "s1", content: { type: "web_search_tool_result_error", error_code: "unavailable" } };
    const capped = { type: "web_search_tool_result", tool_use_id: "s2", content: { type: "web_search_tool_result_error", error_code: "max_uses_exceeded" } };
    const failed = { text: "", content: [{ type: "server_tool_use", id: "s1", name: "web_search", input: { query: "q" } }, fail, capped, { type: "text", text: JSON.stringify(digest) }] };
    // unavailable twice: tried again once with the search called directly, then said with the answer
    const w = world([failed, failed]);
    const body = (await (await handleAi(post({ task: "digest", context: "c", shown: [] }), env, w.deps)).json()) as { answer: { greeting: string }; webFailed?: string[] };
    expect(body.answer.greeting).toBe("Morning!");
    expect(body.webFailed).toEqual(["unavailable"]); // its own cap reached isn't a failure
    expect(w.sent.length).toBe(2);
    const webTool = (b: Record<string, unknown>) => (b.tools as { name: string; allowed_callers?: string[] }[]).find((t) => t.name === "web_search")!;
    expect(webTool(w.sent[0].body).allowed_callers).toBeUndefined();
    expect(webTool(w.sent[1].body).allowed_callers).toEqual(["direct"]);
    // unavailable, then the direct search works: the second answer, nothing said about a failure, both paid for
    const retried = world([failed, { text: JSON.stringify({ ...digest, greeting: "Morning, searched." }) }]);
    const again = (await (await handleAi(post({ task: "digest", context: "c", shown: [] }), env, retried.deps)).json()) as { answer: { greeting: string }; webFailed?: string[]; costUsd: number };
    expect(again.answer.greeting).toBe("Morning, searched.");
    expect(again.webFailed).toBeUndefined();
    expect(retried.sent.length).toBe(2);
    // the retry turned down: the first answer stands, the failure said — never worse than not retrying
    const refused = world([failed, { text: "", error: { status: 400, type: "invalid_request_error", message: "tools.0: something about callers" } }]);
    const kept = (await (await handleAi(post({ task: "digest", context: "c", shown: [] }), env, refused.deps)).json()) as { answer: { greeting: string }; webFailed?: string[] };
    expect(kept.answer.greeting).toBe("Morning!"); expect(kept.webFailed).toEqual(["unavailable"]);
    // the cap alone isn't retried
    const capOnly = world([{ text: "", content: [capped, { type: "text", text: JSON.stringify(digest) }] }]);
    await handleAi(post({ task: "digest", context: "c", shown: [] }), env, capOnly.deps);
    expect(capOnly.sent.length).toBe(1);
    const ok = world([{ text: JSON.stringify(digest) }]);
    expect(((await (await handleAi(post({ task: "digest", context: "c", shown: [] }), env, ok.deps)).json()) as { webFailed?: string[] }).webFailed).toBeUndefined();
  });
});

/**
 * Every request the Worker sends stays inside the API's limits for strict schemas: 24 optional fields, 16 union fields
 * and 20 strict tools across a request (platform docs, structured outputs). 28 Oct: "Schemas contains too many optional
 * parameters (28)" turned every chat message down after propose grew; this would have caught it before it shipped.
 */
describe("strict schemas stay inside the API's limits", () => {
  const count = (s: unknown): { optional: number; unions: number } => {
    let optional = 0, unions = 0;
    const walk = (x: unknown) => {
      if (!x || typeof x !== "object") return;
      const o = x as { type?: unknown; properties?: Record<string, unknown>; required?: string[]; items?: unknown; anyOf?: unknown[] };
      if (o.properties) { const req = new Set(o.required ?? []); for (const [k, v] of Object.entries(o.properties)) { if (!req.has(k)) optional++; const p = v as { anyOf?: unknown; type?: unknown }; if (p && (p.anyOf || Array.isArray(p.type))) unions++; walk(v); } }
      if (o.items) walk(o.items);
      for (const a of o.anyOf ?? []) walk(a);
    };
    walk(s);
    return { optional, unions };
  };
  const bodies: Record<string, object> = {
    chat: { task: "chat", messages: [{ role: "user", text: "hi" }], context: "c" },
    digest: { task: "digest", context: "c", shown: [] }, night: { task: "night", day: "2026-10-28", context: "c" }, dive: { task: "dive", context: "c" },
    questions: { task: "questions", context: "c", asked: [] }, describe: { task: "describe", text: "2 eggs" },
    supplement: { task: "supplement", name: "Creatine", context: "c" }, verdict: { task: "verdict", context: "c" }, research: { task: "research", context: "c" },
  };
  for (const [task, body] of Object.entries(bodies)) it(task, async () => {
    const w = world([{ text: "{}" }]);
    await handleAi(post(body), env, w.deps).catch(() => null);
    const sent = w.sent[0]?.body as { tools?: { strict?: boolean; input_schema?: unknown }[]; output_config?: { format?: { schema?: unknown } } } | undefined;
    expect(sent, `${task} was sent`).toBeTruthy();
    const strict = (sent!.tools ?? []).filter((t) => t.strict === true);
    const all = [...strict.map((t) => count(t.input_schema)), count(sent!.output_config?.format?.schema)];
    const total = all.reduce((a, c) => ({ optional: a.optional + c.optional, unions: a.unions + c.unions }), { optional: 0, unions: 0 });
    expect(total.optional, `${task}: optional fields across strict schemas`).toBeLessThanOrEqual(24);
    expect(total.unions, `${task}: union fields`).toBeLessThanOrEqual(16);
    expect(strict.length).toBeLessThanOrEqual(20);
  });
});

// Owner, 3 Nov: "bro why are we not doing the gemini free api tier and farm other free api-s for bs like food calorie
// estimate, i should not be paying dollahs for that … i also have 10 dollar in gemini credits which i could use"
describe("the light jobs on Gemini first", () => {
  const gEnv = { ...env, GEMINI_FREE_KEY: "free-key", GEMINI_API_KEY: "paid-key" };
  type Out = { answer: { items: { name: string }[] }; costUsd: number; via?: string };
  const last = (w: ReturnType<typeof world>) => (w.docs.get("ai_usage") as { recent: { via?: string; usd: number; task: string }[] }).recent.at(-1);
  it("a food estimate goes to the free tier: answered, nothing paid, Claude not asked, logged as free", async () => {
    const w = world([], { gemini: [{ text: JSON.stringify(coffee) }] });
    const res = await handleAi(post({ task: "describe", text: "my usual long coffee, big cup" }), gEnv, w.deps);
    const body = (await res.json()) as Out;
    expect(res.status).toBe(200);
    expect(body.answer.items[0].name).toBe("Long coffee, large");
    expect([body.costUsd, body.via, w.sent.length]).toEqual([0, "gemini-free", 0]);
    expect(last(w)).toMatchObject({ task: "describe", via: "gemini-free", usd: 0 });
    // the same prompt and shape as Claude's, the free key, the free model
    const g = w.gemSent[0], gc = g.body.generationConfig as Record<string, unknown>;
    expect(g.url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent");
    expect(g.headers["x-goog-api-key"]).toBe("free-key");
    expect((g.body.systemInstruction as { parts: { text: string }[] }).parts[0].text).toBe(SYSTEM.describe);
    expect([gc.responseMimeType, gc.responseJsonSchema]).toEqual(["application/json", SCHEMAS.describe]);
    expect((g.body.contents as { parts: { text: string }[] }[])[0].parts).toEqual([{ text: "What I had: my usual long coffee, big cup" }]);
  });
  it("a photo goes as the picture itself", async () => {
    const w = world([], { gemini: [{ text: JSON.stringify(coffee) }] });
    await handleAi(post({ task: "describe", image: { mediaType: "image/jpeg", data: "AAAA" } }), gEnv, w.deps);
    expect((w.gemSent[0].body.contents as { parts: unknown[] }[])[0].parts).toEqual([{ inlineData: { mimeType: "image/jpeg", data: "AAAA" } }, { text: "What's in this photo? Log it." }]);
  });
  it("free quota used up → his credits, at Flash-Lite's price (thinking counted as out)", async () => {
    const w = world([], { gemini: [{ status: 429 }, { text: JSON.stringify(coffee) }] });
    const body = (await (await handleAi(post({ task: "describe", text: "coffee" }), gEnv, w.deps)).json()) as Out;
    expect(body.via).toBe("gemini");
    expect(body.costUsd).toBeCloseTo((800 * 0.25 + 300 * 1.5) / 1e6, 9);
    expect((w.docs.get("ai_usage") as { byTask: Record<string, number> }).byTask.describe).toBeCloseTo(body.costUsd, 9);
    expect([w.gemSent[1].headers["x-goog-api-key"], w.gemSent[1].url.includes("gemini-3.1-flash-lite"), w.sent.length]).toEqual(["paid-key", true, 0]);
  });
  it("an answer in the wrong shape, then the credits down → Claude, as before", async () => {
    const w = world([{ text: JSON.stringify(coffee) }], { gemini: [{ text: "Sure! Here's your coffee: 3 kcal" }, { status: 500 }] });
    const res = await handleAi(post({ task: "describe", text: "coffee", models: { light: "haiku" } }), gEnv, w.deps);
    const body = (await res.json()) as Out;
    expect([res.status, body.via, w.gemSent.length, w.sent.length]).toEqual([200, undefined, 2, 1]);
    expect(body.answer.items[0].name).toBe("Long coffee, large");
    expect(last(w)?.via).toBeUndefined();
  });
  it("the questions go too; a key alone works (no free key → the credits first)", async () => {
    const qs = { questions: [{ kind: "check", q: "Did the late coffee keep you up?", why: "your sleep rating fell", options: ["yes", "no"] }] };
    const w = world([], { gemini: [{ text: JSON.stringify(qs) }] });
    const res = await handleAi(post({ task: "questions", context: "## Today\n- coffee 16:00", asked: [] }), { ...env, GEMINI_API_KEY: "paid-key" }, w.deps);
    expect(res.status).toBe(200);
    expect([w.gemSent[0].headers["x-goog-api-key"], w.sent.length]).toEqual(["paid-key", 0]);
  });
  it("controls: a web look-up, chat and the reads stay on Claude; without keys nothing goes to Gemini", async () => {
    const w = world([{ text: JSON.stringify(coffee) }, { text: "Hi." }, { text: JSON.stringify(coffee) }], { gemini: [] });
    await handleAi(post({ task: "describe", text: "Lidl kifli", lookup: true }), gEnv, w.deps);
    await handleAi(post({ task: "chat", context: "x", messages: [{ role: "user", text: "hi" }] }), gEnv, w.deps);
    await handleAi(post({ task: "describe", text: "coffee" }), env, w.deps);
    expect([w.gemSent.length, w.sent.length]).toEqual([0, 3]);
  });
  it("Settings can say which keys are set", async () => {
    const w = world([]);
    const u = (await (await handleAi(new Request("https://app/api/ai/usage", { headers: { authorization: "Bearer good" } }), { ...env, GEMINI_FREE_KEY: "k" }, w.deps)).json()) as { gemini: object };
    expect(u.gemini).toEqual({ free: true, paid: false });
  });
});
