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
  DAILY_CAP, MODELS, MONTHLY_USD, RECENT_CALLS, SCHEMAS, logOf, SYSTEM, TIER, checkChat, modelFor, checkDescribe, checkDigest, checkNight, checkQuestions, checkReview, checkSupplement, costUsd, jsonFrom, DESCRIBE_SHAPE, CHAT_TOOLS, CHAT_ROUNDS, READ_ROUNDS, READ_TOOLS, checkReadCalls, type ChatTurn,
  type AiRequest, type DigestAnswer, type ModelChoice, type NightAnswer, type SupplementAnswer, type Task, type UsageDoc,
} from "../src/lib/ai/tasks";
import { checkReadLinks, checkSupplementLinks } from "./links";

export type AiEnv = { ANTHROPIC_API_KEY?: string; SUPABASE_URL?: string; SUPABASE_KEY?: string; AI_DAILY_CAP?: string; AI_MONTHLY_USD?: string };
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

/** A read's look-up rounds (PLAN 160): at most READ_ROUNDS of them, not huge. */
const badTurn = (t: unknown) => t != null && (!Array.isArray(t) || t.length > (READ_ROUNDS + 1) * 3 || JSON.stringify(t).length > 400_000);

/** Refuse oversized or malformed requests before anything is spent. */
function validate(b: AiRequest): string | null {
  const long = (s: unknown, n: number) => typeof s === "string" && s.length > n;
  switch (b.task) {
    case "describe": return !b.text && !b.image ? "say or show what it is" : long(b.text, 2000) ? "text too long" : b.image && (long(b.image.data, 2_000_000) || !/^image\/(jpeg|png|webp)$/.test(b.image.mediaType)) ? "image too big or wrong type" : null;
    case "supplement": return !b.name || long(b.name, 100) || long(b.context, 48000) ? "bad supplement request" : null;
    case "chat": return !Array.isArray(b.messages) || !b.messages.length || b.messages.length > 40 || b.messages.some((m) => long(m.text, 4000)) || long(b.context, 48000)
      || (b.turn != null && (!Array.isArray(b.turn) || b.turn.length > CHAT_ROUNDS * 3 || JSON.stringify(b.turn).length > 400_000)) ? "bad chat request" : null;
    case "questions": return long(b.context, 48000) ? "context too long" : null;
    case "digest": return long(b.context, 48000) ? "context too long" : badTurn(b.turn) ? "bad look-ups" : null;
    case "night": return !/^\d{4}-\d{2}-\d{2}$/.test(String(b.day)) ? "bad day" : long(b.context, 52000) ? "context too long" : badTurn(b.turn) ? "bad look-ups" : null;
    case "review": return !["week", "month"].includes(b.kind) || ![b.from, b.to].every((d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d))) ? "bad review" : long(b.context, 60000) ? "context too long" : null;
    default: return "unknown task";
  }
}

function messagesFor(b: AiRequest, today: string): Anthropic.Beta.BetaMessageParam[] {
  switch (b.task) {
    case "describe": return [{ role: "user", content: [
      ...(b.image ? [{ type: "image" as const, source: { type: "base64" as const, media_type: b.image.mediaType, data: b.image.data } }] : []),
      { type: "text" as const, text: b.lookup && b.text && !b.image
        ? `Look up: ${b.text}\nThe food lists didn't have it. If it's a shop product (Lidl, Kaufland bakery, a brand), search for its label values; if it's a dish and you aren't sure, search a Romanian or Hungarian recipe or nutrition table. Give it its usual portion.\nAnswer with ONLY a JSON object, no prose, in this shape: ${DESCRIBE_SHAPE}`
        : b.text ? `What I had: ${b.text}` : "What's in this photo? Log it." },
    ] }];
    case "supplement": return [{ role: "user", content: `I just added: ${b.name}${b.dose ? ` (${b.dose})` : ""}.\n\nAbout me and my stack:\n${b.context}` }];
    // this message's tool rounds go after it exactly as they came (PLAN 67)
    case "chat": return [...b.messages.map((m) => ({ role: m.role, content: m.text })), ...((b.turn ?? []) as Anthropic.Beta.BetaMessageParam[])];
    case "questions": return [{ role: "user", content: `Today is ${today}.\n\nMy data:\n${b.context}\n\nAlready asked: ${b.asked.join(" | ") || "nothing yet"}` }];
    // the data block is cached: a read's look-up rounds send it again, byte for byte, at ~10% (PLAN 160)
    case "digest": return [{ role: "user", content: [{ type: "text", text: `Today is ${today}. Write my morning read.\n\nMy data:\n${b.context}\n\nAlready shown: ${b.shown.join(" | ") || "nothing yet"}`, cache_control: { type: "ephemeral" } }] }, ...((b.turn ?? []) as Anthropic.Beta.BetaMessageParam[])];
    case "night": return [{ role: "user", content: [{ type: "text", text: `Read back my day, ${b.day}.\n\nMy data:\n${b.context}`, cache_control: { type: "ephemeral" } }] }, ...((b.turn ?? []) as Anthropic.Beta.BetaMessageParam[])];
    case "review": return [{ role: "user", content: `Write my ${b.kind} read: ${b.from} to ${b.to}.\n\nMy data:\n${b.context}` }];
  }
}

// Joined as they are: a cited search answer arrives as several text blocks, split anywhere — even inside a JSON string.
const textOf = (content: Anthropic.Beta.BetaContentBlock[]) => content.filter((c): c is Anthropic.Beta.BetaTextBlock => c.type === "text").map((c) => c.text).join("");

export async function callModel(b: AiRequest, choice: ModelChoice, apiKey: string, deps: Deps, today: string) {
  const task: Task = b.task, m = MODELS[choice];
  // A typed name the food lists didn't know may be looked up on the web (two searches at most); search and
  // structured output don't mix, so that answer is parsed from text like the research tasks'.
  const lookup = b.task === "describe" && !!b.lookup && !!b.text && !b.image, chat = b.task === "chat";
  // the evening read searches too (PLAN 157: its study and its thing to try need real sources)
  const web = task === "supplement" || task === "digest" || task === "night" || lookup || chat;
  const schema = web ? undefined : (SCHEMAS as Record<string, unknown>)[task];
  const client = new Anthropic({ apiKey, fetch: deps.fetch, maxRetries: 1 });
  const effort = TIER[task] === "research" ? "medium" : "low";
  const system: Anthropic.Beta.BetaTextBlockParam[] = [{ type: "text", text: SYSTEM[task], cache_control: { type: "ephemeral" } }];
  // The data block is large and the same across a chat's messages: cached, so a reply costs ~10% for it.
  if (b.task === "chat") system.push({ type: "text", text: `Context — the user's data right now:\n${b.context}`, cache_control: { type: "ephemeral" } });
  let messages = messagesFor(b, today);
  const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, server_tool_use: { web_search_requests: 0 } };
  let res: Anthropic.Beta.BetaMessage | null = null;
  // The chat's own tools (the app runs them) and web search for outside facts; the last round may not call any.
  // the reads may ask the app for exact numbers too (PLAN 160): its read-only look-ups, beside web search
  const read = b.task === "digest" || b.task === "night", final = (chat || read) && !!(b as { final?: boolean }).final;
  const tools = chat ? [...CHAT_TOOLS.map((t) => ({ ...t, strict: true })), { type: m.web, name: "web_search" as const, max_uses: 3 }]
    : read ? [...READ_TOOLS.map((t) => ({ ...t, strict: true })), { type: m.web, name: "web_search" as const, max_uses: 4 }]
    : web ? [{ type: m.web, name: "web_search" as const, max_uses: lookup ? 2 : 4 }] : null;
  const paused: ChatTurn[] = [];
  // A web-search turn can pause; continue it (at most 3 times) by sending the partial answer back.
  for (let turn = 0; turn < 4; turn++) {
    res = await client.beta.messages.create({
      model: m.id,
      max_tokens: web ? 16000 : 4000,
      system,
      messages,
      ...(m.thinking ? { thinking: { type: "adaptive" as const } } : {}),
      output_config: { ...(m.thinking ? { effort } : {}), ...(schema ? { format: { type: "json_schema" as const, schema: schema as Record<string, unknown> } } : {}) },
      ...(tools ? { tools } : {}),
      ...(final ? { tool_choice: { type: "none" as const } } : {}),
      ...(choice !== "haiku" ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    } as Anthropic.Beta.MessageCreateParamsNonStreaming);
    usage.input_tokens += res.usage.input_tokens; usage.output_tokens += res.usage.output_tokens;
    usage.cache_read_input_tokens += res.usage.cache_read_input_tokens ?? 0; usage.cache_creation_input_tokens += res.usage.cache_creation_input_tokens ?? 0;
    usage.server_tool_use.web_search_requests += res.usage.server_tool_use?.web_search_requests ?? 0;
    if (res.stop_reason !== "pause_turn") break;
    messages = [...messages, { role: "assistant", content: res.content }];
    paused.push({ role: "assistant", content: res.content });
  }
  if (!res) throw new Error("no answer");
  if (res.stop_reason === "refusal") return { refused: true as const, usage };
  if (chat) {
    // tools to run: the calls, and every assistant message this call added, to be sent back as they were
    const calls = res.stop_reason === "tool_use" ? res.content.flatMap((c) => (c.type === "tool_use" ? [{ id: c.id, name: c.name, input: c.input as Record<string, unknown> }] : [])) : [];
    const answer = calls.length ? checkChat({ reply: "", remember: [], calls: calls as never, turn: [...paused, { role: "assistant", content: res.content }] }) : checkChat({ reply: textOf(res.content), remember: [] });
    return { refused: false as const, answer, usage };
  }
  if (read && res.stop_reason === "tool_use") {
    // look-ups to run in the app, and this call's turns to send back as they were
    const calls = res.content.flatMap((c) => (c.type === "tool_use" ? [{ id: c.id, name: c.name, input: c.input as Record<string, unknown> }] : []));
    const looks = checkReadCalls(calls, [...paused, { role: "assistant", content: res.content }]);
    if (looks.calls.length) return { refused: false as const, answer: looks, usage };
  }
  const text = textOf(res.content);
  const raw = schema ? JSON.parse(text) : jsonFrom(text);
  const checked = task === "describe" ? checkDescribe(raw) : task === "supplement" ? checkSupplement(raw) : task === "chat" ? checkChat(raw) : task === "questions" ? checkQuestions(raw) : task === "night" ? checkNight(raw) : task === "review" ? checkReview(raw) : checkDigest(raw);
  // every link it cites, opened: a dead one or one about something else takes its item with it (PLAN 160)
  const answer = task === "digest" || task === "night" ? await checkReadLinks(checked as DigestAnswer | NightAnswer, deps.fetch)
    : task === "supplement" ? await checkSupplementLinks(checked as SupplementAnswer, deps.fetch) : checked;
  return { refused: false as const, answer, usage };
}

export async function handleAi(req: Request, env: AiEnv, deps: Deps = { fetch: (...a) => fetch(...a), now: Date.now }): Promise<Response> {
  const url = new URL(req.url);
  const user = await whoIs(req, env, deps);
  if (!user) return json({ error: "sign in first" }, 401);
  const cap = Number(env.AI_DAILY_CAP) || DAILY_CAP;
  const tz = url.searchParams.get("tz") || "Europe/Budapest";
  const today = dayIn(deps.now(), tz);

  const budget = Number(env.AI_MONTHLY_USD) || MONTHLY_USD;
  if (req.method === "GET" && url.pathname === "/api/ai/usage") return json({ usage: await readUsage(user, env, deps, today), cap, budget, on: !!env.ANTHROPIC_API_KEY });
  if (req.method !== "POST" || url.pathname !== "/api/ai") return json({ error: "not found" }, 404);
  if (!env.ANTHROPIC_API_KEY) return json({ error: "no-key", message: "The AI is off: add ANTHROPIC_API_KEY in Cloudflare." }, 503);

  let body: AiRequest & { models?: { everyday?: ModelChoice; research?: ModelChoice } };
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const problem = validate(body);
  if (problem) return json({ error: problem }, 400);

  const usage = await readUsage(user, env, deps, today);
  // a chat message's tool rounds count as the one call it is (priced and logged each)
  const more = (body.task === "chat" || body.task === "digest" || body.task === "night") && !!body.turn?.length;
  if (usage.calls >= cap && !more) return json({ error: "cap", message: `Daily AI limit reached (${cap}). It resets at midnight.`, usage }, 429);

  // yours for the task's tier; past the month's budget, the cheapest until the 1st
  const choice: ModelChoice = modelFor(body.task, body.models, usage.monthUsd, budget);
  try {
    const out = await callModel(body, choice, env.ANTHROPIC_API_KEY, deps, today);
    const cost = costUsd(choice, out.usage);
    const next: UsageDoc = { ...usage, calls: usage.calls + (more ? 0 : 1), dayUsd: usage.dayUsd + cost, monthUsd: usage.monthUsd + cost, byModel: { ...usage.byModel, [choice]: (usage.byModel[choice] ?? 0) + cost },
      recent: [...(usage.recent ?? []), logOf(deps.now(), body.task, choice, out.usage, cost)].slice(-RECENT_CALLS) };
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
