/**
 * POST /api/ai       { task, …, models?: { everyday, research }, tz? } → { answer, usage, costUsd }
 * GET  /api/ai/usage → { usage, cap, on }
 *
 * The only place the Anthropic key is used. It's a Cloudflare secret (`ANTHROPIC_API_KEY`), never
 * in the app. Every call must carry a signed-in HealthOS session (checked with Supabase), counts
 * against a hard daily cap (default 50), and its cost is written to the account's "ai_usage" doc —
 * through Supabase with the user's own token, so row-level security applies like everywhere else.
 */

import Anthropic from "@anthropic-ai/sdk";
import {
  DAILY_CAP, MODELS, SCHEMAS, SYSTEM, TIER, checkChat, checkDescribe, checkDigest, checkQuestions, checkSupplement, costUsd, jsonFrom,
  type AiRequest, type ModelChoice, type Task, type UsageDoc,
} from "../src/lib/ai/tasks";

export type AiEnv = { ANTHROPIC_API_KEY?: string; SUPABASE_URL?: string; SUPABASE_KEY?: string; AI_DAILY_CAP?: string };
type Deps = { fetch: typeof fetch; now: () => number };

const SB_URL = "https://ubfvaewfdbmecowoeuni.supabase.co";
const SB_KEY = "sb_publishable_yN86P7x08XORkRDCtr7sbw_If6orfsW";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** "2026-10-01" in the user's time zone, so the cap resets at their midnight. */
const dayIn = (ms: number, tz: string) => { try { return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(ms); } catch { return new Date(ms).toISOString().slice(0, 10); } };

export async function whoIs(req: Request, env: AiEnv, deps: Deps): Promise<{ id: string; token: string } | null> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const r = await deps.fetch(`${env.SUPABASE_URL ?? SB_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_KEY ?? SB_KEY, authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  const u = (await r.json()) as { id?: string };
  return u.id ? { id: u.id, token } : null;
}

const EMPTY = (day: string): UsageDoc => ({ day, calls: 0, dayUsd: 0, month: day.slice(0, 7), monthUsd: 0, byModel: {} });

async function readUsage(user: { token: string }, env: AiEnv, deps: Deps, day: string): Promise<UsageDoc> {
  const r = await deps.fetch(`${env.SUPABASE_URL ?? SB_URL}/rest/v1/docs?key=eq.ai_usage&select=value`, { headers: { apikey: env.SUPABASE_KEY ?? SB_KEY, authorization: `Bearer ${user.token}` } });
  const rows = r.ok ? ((await r.json()) as { value: UsageDoc }[]) : [];
  const u = rows[0]?.value;
  if (!u) return EMPTY(day);
  // A new day resets the count; a new month resets the month's total.
  return { ...u, ...(u.day !== day ? { day, calls: 0, dayUsd: 0 } : {}), ...(u.month !== day.slice(0, 7) ? { month: day.slice(0, 7), monthUsd: 0, byModel: {} } : {}) };
}

async function writeUsage(user: { id: string; token: string }, env: AiEnv, deps: Deps, value: UsageDoc) {
  await deps.fetch(`${env.SUPABASE_URL ?? SB_URL}/rest/v1/docs?on_conflict=user_id,key`, {
    method: "POST",
    headers: { apikey: env.SUPABASE_KEY ?? SB_KEY, authorization: `Bearer ${user.token}`, "content-type": "application/json", prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([{ user_id: user.id, key: "ai_usage", value }]),
  });
}

/** Refuse oversized or malformed requests before anything is spent. */
function validate(b: AiRequest): string | null {
  const long = (s: unknown, n: number) => typeof s === "string" && s.length > n;
  switch (b.task) {
    case "describe": return !b.text && !b.image ? "say or show what it is" : long(b.text, 2000) ? "text too long" : b.image && (long(b.image.data, 2_000_000) || !/^image\/(jpeg|png|webp)$/.test(b.image.mediaType)) ? "image too big or wrong type" : null;
    case "supplement": return !b.name || long(b.name, 100) || long(b.context, 20000) ? "bad supplement request" : null;
    case "chat": return !Array.isArray(b.messages) || !b.messages.length || b.messages.length > 40 || b.messages.some((m) => long(m.text, 4000)) || long(b.context, 20000) ? "bad chat request" : null;
    case "questions": case "digest": return long(b.context, 20000) ? "context too long" : null;
    default: return "unknown task";
  }
}

function messagesFor(b: AiRequest, today: string): Anthropic.Beta.BetaMessageParam[] {
  switch (b.task) {
    case "describe": return [{ role: "user", content: [
      ...(b.image ? [{ type: "image" as const, source: { type: "base64" as const, media_type: b.image.mediaType, data: b.image.data } }] : []),
      { type: "text" as const, text: b.text ? `What I had: ${b.text}` : "What's in this photo? Log it." },
    ] }];
    case "supplement": return [{ role: "user", content: `I just added: ${b.name}${b.dose ? ` (${b.dose})` : ""}.\n\nAbout me and my stack:\n${b.context}` }];
    case "chat": return b.messages.map((m) => ({ role: m.role, content: m.text }));
    case "questions": return [{ role: "user", content: `Today is ${today}.\n\nMy data:\n${b.context}\n\nAlready asked: ${b.asked.join(" | ") || "nothing yet"}` }];
    case "digest": return [{ role: "user", content: `Today is ${today}. Write my morning read.\n\nMy data:\n${b.context}\n\nAlready shown: ${b.shown.join(" | ") || "nothing yet"}` }];
  }
}

const textOf = (content: Anthropic.Beta.BetaContentBlock[]) => content.filter((c): c is Anthropic.Beta.BetaTextBlock => c.type === "text").map((c) => c.text).join("\n");

export async function callModel(b: AiRequest, choice: ModelChoice, apiKey: string, deps: Deps, today: string) {
  const task: Task = b.task, m = MODELS[choice];
  const web = task === "supplement" || task === "digest";
  const schema = (SCHEMAS as Record<string, unknown>)[task];
  const client = new Anthropic({ apiKey, fetch: deps.fetch, maxRetries: 1 });
  const effort = TIER[task] === "research" ? "medium" : "low";
  const system: Anthropic.Beta.BetaTextBlockParam[] = [{ type: "text", text: SYSTEM[task], cache_control: { type: "ephemeral" } }];
  if (b.task === "chat") system.push({ type: "text", text: `Context — the user's data right now:\n${b.context}` });
  let messages = messagesFor(b, today);
  const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, server_tool_use: { web_search_requests: 0 } };
  let res: Anthropic.Beta.BetaMessage | null = null;
  // A web-search turn can pause; continue it (at most 3 times) by sending the partial answer back.
  for (let turn = 0; turn < 4; turn++) {
    res = await client.beta.messages.create({
      model: m.id,
      max_tokens: web ? 16000 : 4000,
      system,
      messages,
      ...(m.thinking ? { thinking: { type: "adaptive" as const } } : {}),
      output_config: { ...(m.thinking ? { effort } : {}), ...(schema ? { format: { type: "json_schema" as const, schema: schema as Record<string, unknown> } } : {}) },
      ...(web ? { tools: [{ type: m.web, name: "web_search" as const, max_uses: 4 }] } : {}),
      ...(choice !== "haiku" ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    } as Anthropic.Beta.MessageCreateParamsNonStreaming);
    usage.input_tokens += res.usage.input_tokens; usage.output_tokens += res.usage.output_tokens;
    usage.cache_read_input_tokens += res.usage.cache_read_input_tokens ?? 0; usage.cache_creation_input_tokens += res.usage.cache_creation_input_tokens ?? 0;
    usage.server_tool_use.web_search_requests += res.usage.server_tool_use?.web_search_requests ?? 0;
    if (res.stop_reason !== "pause_turn") break;
    messages = [...messages, { role: "assistant", content: res.content }];
  }
  if (!res) throw new Error("no answer");
  if (res.stop_reason === "refusal") return { refused: true as const, usage };
  const text = textOf(res.content);
  const raw = schema ? JSON.parse(text) : jsonFrom(text);
  const answer = task === "describe" ? checkDescribe(raw) : task === "supplement" ? checkSupplement(raw) : task === "chat" ? checkChat(raw) : task === "questions" ? checkQuestions(raw) : checkDigest(raw);
  return { refused: false as const, answer, usage };
}

export async function handleAi(req: Request, env: AiEnv, deps: Deps = { fetch: (...a) => fetch(...a), now: Date.now }): Promise<Response> {
  const url = new URL(req.url);
  const user = await whoIs(req, env, deps);
  if (!user) return json({ error: "sign in first" }, 401);
  const cap = Number(env.AI_DAILY_CAP) || DAILY_CAP;
  const tz = url.searchParams.get("tz") || "Europe/Budapest";
  const today = dayIn(deps.now(), tz);

  if (req.method === "GET" && url.pathname === "/api/ai/usage") return json({ usage: await readUsage(user, env, deps, today), cap, on: !!env.ANTHROPIC_API_KEY });
  if (req.method !== "POST" || url.pathname !== "/api/ai") return json({ error: "not found" }, 404);
  if (!env.ANTHROPIC_API_KEY) return json({ error: "no-key", message: "The AI is off: add ANTHROPIC_API_KEY in Cloudflare." }, 503);

  let body: AiRequest & { models?: { everyday?: ModelChoice; research?: ModelChoice } };
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const problem = validate(body);
  if (problem) return json({ error: problem }, 400);

  const usage = await readUsage(user, env, deps, today);
  if (usage.calls >= cap) return json({ error: "cap", message: `Daily AI limit reached (${cap}). It resets at midnight.`, usage }, 429);

  const pick = body.models?.[TIER[body.task]];
  const choice: ModelChoice = pick && pick in MODELS ? pick : "opus";
  try {
    const out = await callModel(body, choice, env.ANTHROPIC_API_KEY, deps, today);
    const cost = costUsd(choice, out.usage);
    const next: UsageDoc = { ...usage, calls: usage.calls + 1, dayUsd: usage.dayUsd + cost, monthUsd: usage.monthUsd + cost, byModel: { ...usage.byModel, [choice]: (usage.byModel[choice] ?? 0) + cost } };
    await writeUsage(user, env, deps, next);
    if (out.refused) return json({ error: "refused", message: "The AI declined this one.", usage: next, costUsd: cost }, 422);
    return json({ answer: out.answer, usage: next, costUsd: cost, model: choice });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return json({ error: "bad-key", message: "The Anthropic key was rejected — check ANTHROPIC_API_KEY in Cloudflare." }, 502);
    if (e instanceof Anthropic.RateLimitError) return json({ error: "busy", message: "The AI is busy — try again in a minute." }, 429);
    if (e instanceof Anthropic.APIError) return json({ error: "ai-error", message: `The AI service failed (${e.status ?? "network"}).` }, 502);
    if (e instanceof SyntaxError) return json({ error: "bad-answer", message: "The AI's answer didn't come back in the right shape — try again." }, 502);
    throw e;
  }
}
