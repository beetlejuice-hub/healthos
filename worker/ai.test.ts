import { describe, expect, it } from "vitest";
import { handleAi } from "./ai";

/** A fake Supabase (one user, the docs table) and a fake Anthropic API, behind one fetch. */
function world(answers: unknown[], opts: { usage?: object } = {}) {
  const docs = new Map<string, unknown>();
  if (opts.usage) docs.set("ai_usage", opts.usage);
  const sent: { url: string; body: Record<string, unknown>; headers: Record<string, string> }[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    const url = new URL(req.url);
    if (url.pathname === "/auth/v1/user") return req.headers.get("authorization") === "Bearer good" ? Response.json({ id: "u1" }) : new Response("no", { status: 401 });
    if (url.pathname === "/rest/v1/docs") {
      if (req.method === "POST") { for (const r of (await req.json()) as { key: string; value: unknown }[]) docs.set(r.key, r.value); return new Response(null, { status: 201 }); }
      const v = docs.get("ai_usage"); return Response.json(v ? [{ value: v }] : []);
    }
    if (url.hostname === "api.anthropic.com") {
      const body = (await req.json()) as Record<string, unknown>;
      sent.push({ url: req.url, body, headers: Object.fromEntries(req.headers) });
      const a = answers.shift() as { text: string; stop?: string; searches?: number; blocks?: string[]; content?: unknown[] };
      return Response.json({ id: "msg_1", type: "message", role: "assistant", model: body.model, content: a.content ?? (a.blocks ?? [a.text]).map((text) => ({ type: "text", text })), stop_reason: a.stop ?? "end_turn", stop_sequence: null,
        usage: { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, server_tool_use: { web_search_requests: a.searches ?? 0 } } });
    }
    throw new Error(`unexpected ${req.url}`);
  }) as typeof fetch;
  return { docs, sent, deps: { fetch: fetcher, now: () => Date.UTC(2026, 9, 1, 10) } };
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
    expect(sent.tools.map((t) => t.name)).toEqual(["day", "series", "find", "show_chart", "remember", "web_search"]);
    expect(sent.tools.slice(0, 5).every((t) => t.strict === true)).toBe(true);
    expect(sent.tools[5]).toMatchObject({ type: "web_search_20260209", max_uses: 3 });
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

  it("review: the week read on the research model, the enforced shape, a bad request refused (PLAN 65)", async () => {
    const ans = { title: "Better mood, short on protein", summary: "Mood **7.5** against a usual 6.", notices: [{ title: "Mood up", text: "7.5 all week.", measure: "mood" }, { title: "", text: "dropped", measure: "" }], next: [{ what: "Protein at lunch", why: "0 of 7 days at goal" }], remember: [] };
    const w = world([{ text: JSON.stringify(ans) }]);
    const res = await handleAi(post({ task: "review", kind: "week", from: "2026-10-12", to: "2026-10-18", context: "## The week 12 Oct–18 Oct" }), env, w.deps);
    const body = (await res.json()) as { answer: { title: string; notices: { measure: string }[]; next: unknown[] } };
    expect(res.status).toBe(200);
    expect(body.answer.title).toBe("Better mood, short on protein");
    expect(body.answer.notices).toEqual([{ title: "Mood up", text: "7.5 all week.", measure: "mood" }]); // an empty notice left out
    const sent = w.sent[0].body;
    expect(sent.model).toBe("claude-opus-5-5");
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
    expect(sent.tools).toEqual([{ type: "web_search_20250305", name: "web_search", max_uses: 2 }]);
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
    expect(await run({ task: "chat", messages: [{ role: "user", text: "yo" }], context: "c" })).toBe("claude-opus-5-5");
  });

  it("past the month's $20, everything on Haiku 5.5 until the 1st; the usage says the budget", async () => {
    const usage = { day: "2026-10-01", calls: 3, dayUsd: 1, month: "2026-10", monthUsd: 20.4, byModel: {} };
    const w = world([{ text: JSON.stringify({ reply: "hi", remember: [] }) }], { usage });
    expect((await handleAi(post({ task: "chat", messages: [{ role: "user", text: "yo" }], context: "c", models: { everyday: "opus" } }), env, w.deps)).status).toBe(200);
    expect(w.sent[0].body.model).toBe("claude-haiku-5-5");
    const w2 = world([{ text: JSON.stringify({ reply: "hi", remember: [] }) }], { usage: { ...usage, monthUsd: 19.9 } });
    await handleAi(post({ task: "chat", messages: [{ role: "user", text: "yo" }], context: "c", models: { everyday: "opus" } }), env, w2.deps);
    expect(w2.sent[0].body.model).toBe("claude-opus-5-5");
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
    expect(body.costUsd).toBeCloseTo((2000 * 4 + 1000 * 20) / 1e6 + 0.03, 6);
  });

  it("night: the day is read back with a schema, no web search, and checked", async () => {
    const night = { summary: "A steady day; stress peaked at 14:00 with the deadline you noted.", happened: ["2 coffees, last 13:00", "gym 18:00", "x", "y", "dropped"], notes: "You wrote 'deadline' at 14:00 — the stress 8 fits that.", change: [{ what: "Walk after lunch", why: "your 15:00 dip" }, { what: "b", why: "" }, { what: "dropped", why: "" }], remember: ["Stress runs high on deadline days."] };
    const w = world([{ text: JSON.stringify(night) }]);
    const res = await handleAi(post({ task: "night", day: "2026-10-01", context: "## Today, as it happened\n- 14:00 check-in: stress 8 · my note: \"deadline\"" }), env, w.deps);
    const body = (await res.json()) as { answer: typeof night };
    expect(res.status).toBe(200);
    expect(body.answer.happened).toHaveLength(4);
    expect(body.answer.change).toHaveLength(2);
    const sent = w.sent[0].body;
    expect(sent.tools).toBeUndefined();
    expect((sent.output_config as { format: { type: string } }).format.type).toBe("json_schema");
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
});
