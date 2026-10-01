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
      const a = answers.shift() as { text: string; stop?: string; searches?: number };
      return Response.json({ id: "msg_1", type: "message", role: "assistant", model: body.model, content: [{ type: "text", text: a.text }], stop_reason: a.stop ?? "end_turn", stop_sequence: null,
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
  it("needs a signed-in user and the key", async () => {
    const w = world([]);
    expect((await handleAi(post({ task: "describe", text: "x" }, "bad"), env, w.deps)).status).toBe(401);
    expect((await handleAi(post({ task: "describe", text: "x" }), {}, w.deps)).status).toBe(503);
  });

  it("describe: structured answer, checked, usage and cost recorded", async () => {
    const w = world([{ text: JSON.stringify(coffee) }]);
    const res = await handleAi(post({ task: "describe", text: "my usual long coffee, big cup" }), env, w.deps);
    const body = (await res.json()) as { answer: { items: { name: string }[] }; usage: { calls: number; dayUsd: number }; costUsd: number };
    expect(res.status).toBe(200);
    expect(body.answer.items[0].name).toBe("Long coffee, large");
    expect(body.costUsd).toBeCloseTo((1000 * 4 + 500 * 20) / 1e6, 6); // Opus 5.5 list price
    expect(w.docs.get("ai_usage")).toMatchObject({ day: "2026-10-01", calls: 1 });
    const sent = w.sent[0].body;
    expect(sent.model).toBe("claude-opus-5-5");
    expect(sent.fallbacks).toBe("default");
    expect(w.sent[0].headers["anthropic-beta"]).toContain("server-side-fallback-2026-07-01");
    expect(sent.thinking).toEqual({ type: "adaptive" });
    expect((sent.output_config as { effort: string }).effort).toBe("low");
    expect((sent.output_config as { format: { type: string } }).format.type).toBe("json_schema");
  });

  it("the cheaper model when chosen; Haiku gets no thinking and the basic web search", async () => {
    const w = world([{ text: JSON.stringify({ name: "Ashwagandha", what: "adaptogen", usualDose: "300–600 mg", timing: "any regular time", evidence: "moderate", uses: ["stress"], cautions: ["thyroid"], interactions: [{ with: "Saffron", verdict: "none", say: "no known interaction" }], sources: [{ title: "NIH ODS", url: "https://ods.od.nih.gov/x" }] }), searches: 3 }]);
    const res = await handleAi(post({ task: "supplement", name: "Ashwagandha", context: "psoriasis", models: { research: "haiku" } }), env, w.deps);
    expect(res.status).toBe(200);
    const s = w.sent[0].body;
    expect(s.model).toBe("claude-haiku-4-5");
    expect(s.thinking).toBeUndefined();
    expect((s.tools as { type: string }[])[0].type).toBe("web_search_20250305");
    expect(((await res.json()) as { costUsd: number }).costUsd).toBeCloseTo((1000 * 1 + 500 * 5) / 1e6 + 0.03, 6);
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

  it("rejects oversized input before spending anything", async () => {
    const w = world([]);
    expect((await handleAi(post({ task: "describe", text: "x".repeat(3000) }), env, w.deps)).status).toBe(400);
    expect((await handleAi(post({ task: "nope" }), env, w.deps)).status).toBe(400);
    expect(w.sent).toHaveLength(0);
  });
});
