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
  AI_ERRORS, type AiError, type Usage, DAILY_CAP, MODELS, MONTHLY_USD, RECENT_CALLS, SCHEMAS, logOf, SYSTEM, TIER, checkChat, modelFor, checkDescribe, checkDigest, checkNight, checkQuestions, checkReview, checkSupplement, costUsd, jsonFrom, DESCRIBE_SHAPE, CHAT_TOOLS, CHAT_ROUNDS, READ_ROUNDS, READ_TOOLS, checkReadCalls, checkDive, checkVerdict, type ChatTurn,
  type AiRequest, type DigestAnswer, type DiveAnswer, type VerdictAnswer, type ModelChoice, type NightAnswer, type SupplementAnswer, type Task, type UsageDoc,
} from "../src/lib/ai/tasks";
import { checkFoundLinks, checkReadLinks, checkSupplementLinks } from "./links";

export type AiEnv = { ANTHROPIC_API_KEY?: string; SUPABASE_URL?: string; SUPABASE_KEY?: string; AI_DAILY_CAP?: string; AI_MONTHLY_USD?: string };
type Deps = { fetch: typeof fetch; now: () => number };

const SB_URL = "https://ubfvaewfdbmecowoeuni.supabase.co";
const SB_KEY = "sb_publishable_yN86P7x08XORkRDCtr7sbw_If6orfsW";
/** Chat tools sent without strict: the API allows 24 optional fields across a request's strict schemas (and 16 unions). */
const LOOSE = new Set(["propose"]);
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

async function readDoc(user: { token: string }, env: AiEnv, deps: Deps): Promise<UsageDoc | null> {
  const r = await deps.fetch(`${env.SUPABASE_URL ?? SB_URL}/rest/v1/docs?key=eq.ai_usage&select=value`, { headers: { apikey: env.SUPABASE_KEY ?? SB_KEY, authorization: `Bearer ${user.token}` } });
  const rows = r.ok ? ((await r.json()) as { value: UsageDoc }[]) : [];
  return rows[0]?.value ?? null;
}
// A new day resets the count; a new month resets the month's total.
const asOf = (u: UsageDoc | null, day: string): UsageDoc => !u ? EMPTY(day)
  : { ...u, ...(u.day !== day ? { day, calls: 0, dayUsd: 0 } : {}), ...(u.month !== day.slice(0, 7) ? { month: day.slice(0, 7), monthUsd: 0, byModel: {} } : {}) };
const readUsage = async (user: { token: string }, env: AiEnv, deps: Deps, day: string) => asOf(await readDoc(user, env, deps), day);

async function writeUsage(user: { id: string; token: string }, env: AiEnv, deps: Deps, value: UsageDoc, onlyNew = false) {
  return deps.fetch(`${env.SUPABASE_URL ?? SB_URL}/rest/v1/docs?on_conflict=user_id,key`, {
    method: "POST",
    headers: { apikey: env.SUPABASE_KEY ?? SB_KEY, authorization: `Bearer ${user.token}`, "content-type": "application/json", prefer: `resolution=${onlyNew ? "ignore" : "merge"}-duplicates,return=representation` },
    body: JSON.stringify([{ user_id: user.id, key: "ai_usage", value }]),
  });
}

/**
 * Add a call's spend to the total. Read just before writing, and written only if no other call wrote since (its `rev`
 * the same) — else read again. Owner, 27 Oct: "App says we spent 11 bucks, in reality we spent 18": each call read the
 * total when it started and wrote that plus its own cost when it ended, so a deep dive that searched for minutes wrote
 * over every read and chat that finished meanwhile.
 */
async function addSpend(user: { id: string; token: string }, env: AiEnv, deps: Deps, day: string, f: (u: UsageDoc) => UsageDoc): Promise<UsageDoc> {
  let next = EMPTY(day);
  for (let i = 0; i < 5; i++) {
    const old = await readDoc(user, env, deps);
    next = { ...f(asOf(old, day)), rev: (old?.rev ?? 0) + 1 };
    const r = !old ? await writeUsage(user, env, deps, next, true)
      : await deps.fetch(`${env.SUPABASE_URL ?? SB_URL}/rest/v1/docs?user_id=eq.${user.id}&key=eq.ai_usage&value->>rev=${old.rev == null ? "is.null" : `eq.${old.rev}`}`, {
        method: "PATCH",
        headers: { apikey: env.SUPABASE_KEY ?? SB_KEY, authorization: `Bearer ${user.token}`, "content-type": "application/json", prefer: "return=representation" },
        body: JSON.stringify({ value: next }),
      });
    if (r.ok && ((await r.json().catch(() => [])) as unknown[]).length) return next;
  }
  await writeUsage(user, env, deps, next); // lost five times in a row: kept rather than lost
  return next;
}

/**
 * A read's or a chat message's tool rounds sent back (PLAN 160): at most `rounds` of them, each up to 3 paused web-search
 * turns, its answer and the app's results. The web search results ride in them whole (each page's encrypted text, often
 * tens of kB a page), so a read that searched and then looked something up could pass the 400 kB this was until 22 Oct —
 * refused before anything was spent, and the read never came. The deep dive searches up to 10 times.
 */
export const TURN_MAX_BYTES = 12_000_000;
const badTurn = (t: unknown, rounds: number) => t != null && (!Array.isArray(t) || t.length > rounds * 5 || JSON.stringify(t).length > TURN_MAX_BYTES);

/** Refuse oversized or malformed requests before anything is spent. */
function validate(b: AiRequest): string | null {
  const long = (s: unknown, n: number) => typeof s === "string" && s.length > n;
  switch (b.task) {
    case "describe": return !b.text && !b.image ? "say or show what it is" : long(b.text, 2000) ? "text too long" : b.image && (long(b.image.data, 2_000_000) || !/^image\/(jpeg|png|webp)$/.test(b.image.mediaType)) ? "image too big or wrong type" : null;
    case "supplement": return !b.name || long(b.name, 100) || long(b.context, 48000) ? "bad supplement request" : null;
    case "chat": return !Array.isArray(b.messages) || !b.messages.length || b.messages.length > 40 || b.messages.some((m) => long(m.text, 4000)) || long(b.context, 48000)
      || badTurn(b.turn, CHAT_ROUNDS) ? "bad chat request" : null;
    case "questions": return long(b.context, 48000) ? "context too long" : null;
    case "digest": return long(b.context, 48000) ? "context too long" : badTurn(b.turn, READ_ROUNDS) ? "bad look-ups" : null;
    case "night": return !/^\d{4}-\d{2}-\d{2}$/.test(String(b.day)) ? "bad day" : long(b.context, 52000) ? "context too long" : badTurn(b.turn, READ_ROUNDS) ? "bad look-ups" : null;
    case "review": return !["week", "month"].includes(b.kind) || ![b.from, b.to].every((d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d))) ? "bad review" : long(b.context, 60000) ? "context too long" : null;
    case "dive": return long(b.context, 60000) ? "context too long" : badTurn(b.turn, READ_ROUNDS) ? "bad look-ups" : null;
    case "verdict": return long(b.context, 40000) ? "context too long" : null;
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
    case "verdict": return [{ role: "user", content: `My experiment ended. Give me its verdict.\n\n${b.context}` }];
    case "dive": return [{ role: "user", content: [{ type: "text", text: `Today is ${today}. Do this week's deep dive.\n\nMy data:\n${b.context}`, cache_control: { type: "ephemeral" } }] }, ...((b.turn ?? []) as Anthropic.Beta.BetaMessageParam[])];
  }
}

// Joined as they are: a cited search answer arrives as several text blocks, split anywhere — even inside a JSON string.
const textOf = (content: Anthropic.Beta.BetaContentBlock[]) => content.filter((c): c is Anthropic.Beta.BetaTextBlock => c.type === "text").map((c) => c.text).join("");

/** A web search that failed (not one that hit its own cap): "unavailable", "too_many_requests"… */
const searchFails = (content: Anthropic.Beta.BetaContentBlock[]) => content.flatMap((c) => {
  const r = c as { type: string; content?: { type?: string; error_code?: string } };
  return r.type === "web_search_tool_result" && r.content?.type === "web_search_tool_result_error" && r.content.error_code !== "max_uses_exceeded" ? [r.content.error_code ?? "error"] : [];
});

/** What a call has spent so far, kept as each response comes, so a call that fails after the AI answered is still paid for. */
type Totals = { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number; server_tool_use: { web_search_requests: number } };
export type Spent = { usd: number; usage: Totals; webFailed: string[]; /** The total once this call's cost is added. */ next?: UsageDoc };
export const nothingSpent = (): Spent => ({ usd: 0, usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, server_tool_use: { web_search_requests: 0 } }, webFailed: [] });

export async function callModel(b: AiRequest, choice: ModelChoice, apiKey: string, deps: Deps, today: string, spent: Spent = nothingSpent()) {
  const task: Task = b.task, m = MODELS[choice];
  // A typed name the food lists didn't know may be looked up on the web (two searches at most); search and
  // structured output don't mix, so that answer is parsed from text like the research tasks'.
  const lookup = b.task === "describe" && !!b.lookup && !!b.text && !b.image, chat = b.task === "chat";
  // the evening read searches too (PLAN 157: its study and its thing to try need real sources)
  const web = task === "supplement" || task === "digest" || task === "night" || task === "dive" || task === "verdict" || lookup || chat;
  const schema = web ? undefined : (SCHEMAS as Record<string, unknown>)[task];
  const client = new Anthropic({ apiKey, fetch: deps.fetch, maxRetries: 1 });
  const effort = TIER[task] === "research" ? "medium" : "low";
  const system: Anthropic.Beta.BetaTextBlockParam[] = [{ type: "text", text: SYSTEM[task], cache_control: { type: "ephemeral" } }];
  // The data block is large and the same across a chat's messages: cached, so a reply costs ~10% for it.
  if (b.task === "chat") system.push({ type: "text", text: `Context — the user's data right now:\n${b.context}`, cache_control: { type: "ephemeral" } });
  let messages = messagesFor(b, today);
  const usage = spent.usage;
  let res: Anthropic.Beta.BetaMessage | null = null;
  // The chat's own tools (the app runs them) and web search for outside facts; the last round may not call any.
  // the reads may ask the app for exact numbers too (PLAN 160): its read-only look-ups, beside web search
  const read = b.task === "digest" || b.task === "night" || b.task === "dive", final = (chat || read) && !!(b as { final?: boolean }).final;
  // strict: the API holds every argument to its schema — but it allows 24 optional fields across a request's strict
  // schemas, and propose has 28 (28 Oct: "Schemas contains too many optional parameters (28)" turned every chat message
  // down). propose goes non-strict: the app checks each one itself before it becomes a card (lib/ai/propose).
  const tools = chat ? [...CHAT_TOOLS.map((t) => ({ ...t, strict: !LOOSE.has(t.name) })), { type: m.web, name: "web_search" as const, max_uses: 3 }]
    : read ? [...READ_TOOLS.map((t) => ({ ...t, strict: true })), { type: m.web, name: "web_search" as const, max_uses: b.task === "dive" ? 10 : 4 }]
    : web ? [{ type: m.web, name: "web_search" as const, max_uses: lookup ? 2 : task === "verdict" ? 3 : 4 }] : null;
  // A search that comes back "unavailable" (Anthropic: "an internal error occurred") is tried again once, the whole
  // request, with the search called directly instead of from dynamic filtering's code — a different path to the same
  // search (owner, 28 Oct: "Ai says web search is down..why?"). Failing again, it's said with the answer as before.
  const direct = tools?.map((t) => ("type" in t && t.type === m.web ? { ...t, allowed_callers: ["direct"] } : t)) ?? null;
  const start = messages;
  let paused: ChatTurn[] = [], fails: string[] = [];
  let first: { res: Anthropic.Beta.BetaMessage | null; paused: ChatTurn[]; fails: string[]; messages: typeof messages } | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const useTools = attempt ? direct : tools;
    if (attempt) first = { res, paused, fails, messages };
    paused = []; fails = []; messages = start;
    try {
    // A web-search turn can pause; continue it (at most 3 times) by sending the partial answer back.
    for (let turn = 0; turn < 4; turn++) {
      res = await client.beta.messages.create({
        model: m.id,
        max_tokens: web ? 16000 : 4000,
        system,
        messages,
        ...(m.thinking ? { thinking: { type: "adaptive" as const } } : {}),
        output_config: { ...(m.thinking ? { effort } : {}), ...(schema ? { format: { type: "json_schema" as const, schema: schema as Record<string, unknown> } } : {}) },
        ...(useTools ? { tools: useTools } : {}),
        ...(final ? { tool_choice: { type: "none" as const } } : {}),
        ...(choice !== "haiku" ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      } as Anthropic.Beta.MessageCreateParamsNonStreaming);
      // each response priced as it comes, at the rates of the model that answered (a fallback bills at its own — 27 Oct)
      spent.usd += costUsd(choice, res.usage as Usage);
      fails.push(...searchFails(res.content));
      usage.input_tokens += res.usage.input_tokens; usage.output_tokens += res.usage.output_tokens;
      usage.cache_read_input_tokens += res.usage.cache_read_input_tokens ?? 0; usage.cache_creation_input_tokens += res.usage.cache_creation_input_tokens ?? 0;
      usage.server_tool_use.web_search_requests += res.usage.server_tool_use?.web_search_requests ?? 0;
      if (res.stop_reason !== "pause_turn") break;
      messages = [...messages, { role: "assistant", content: res.content }];
      paused.push({ role: "assistant", content: res.content });
    }
    } catch (e) {
      // the retry itself turned down (say, a chat that searched the other way earlier): keep the first answer, as before
      if (!first) throw e;
      ({ res, paused, fails, messages } = first);
      break;
    }
    if (!tools || !fails.includes("unavailable")) break;
  }
  spent.webFailed.push(...fails);
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
  const checked = task === "describe" ? checkDescribe(raw) : task === "supplement" ? checkSupplement(raw) : task === "chat" ? checkChat(raw) : task === "questions" ? checkQuestions(raw) : task === "night" ? checkNight(raw) : task === "review" ? checkReview(raw) : task === "dive" ? checkDive(raw) : task === "verdict" ? checkVerdict(raw) : checkDigest(raw);
  // every link it cites, opened: a dead one or one about something else takes its item with it (PLAN 160)
  const answer = task === "digest" || task === "night" ? await checkReadLinks(checked as DigestAnswer | NightAnswer, deps.fetch)
    : task === "supplement" ? await checkSupplementLinks(checked as SupplementAnswer, deps.fetch)
    : task === "dive" || task === "verdict" ? await checkFoundLinks(checked as DiveAnswer | VerdictAnswer, deps.fetch) : checked;
  return { refused: false as const, answer, usage };
}

/** A failure as its code and plain words (AI_ERRORS), with any detail after: "… (ai-error 400: …)". */
const fail = (code: AiError, status: number, extra: object = {}, detail?: string) => json({ error: code, message: `${AI_ERRORS[code]} (${code}${detail ? ` ${detail}` : ""})`, ...extra }, status);

export async function handleAi(req: Request, env: AiEnv, deps: Deps = { fetch: (...a) => fetch(...a), now: Date.now }, ctx?: { waitUntil: (p: Promise<unknown>) => void }): Promise<Response> {
  const url = new URL(req.url);
  const user = await whoIs(req, env, deps);
  if (!user) return json({ error: "sign in first" }, 401);
  const cap = Number(env.AI_DAILY_CAP) || DAILY_CAP;
  const tz = url.searchParams.get("tz") || "Europe/Budapest";
  const today = dayIn(deps.now(), tz);

  const budget = Number(env.AI_MONTHLY_USD) || MONTHLY_USD;
  if (req.method === "GET" && url.pathname === "/api/ai/usage") return json({ usage: await readUsage(user, env, deps, today), cap, budget, on: !!env.ANTHROPIC_API_KEY });
  if (req.method !== "POST" || url.pathname !== "/api/ai") return json({ error: "not found" }, 404);
  if (!env.ANTHROPIC_API_KEY) return fail("no-key", 503);

  let body: AiRequest & { models?: { everyday?: ModelChoice; research?: ModelChoice } };
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const problem = validate(body);
  if (problem) return json({ error: problem }, 400);

  const usage = await readUsage(user, env, deps, today);
  // a chat message's tool rounds count as the one call it is (priced and logged each)
  const more = (body.task === "chat" || body.task === "digest" || body.task === "night" || body.task === "dive") && !!body.turn?.length;
  if (usage.calls >= cap && !more) return fail("cap", 429, { usage }, String(cap));

  // yours for the task's tier; past the month's budget, the cheapest until the 1st
  const choice: ModelChoice = modelFor(body.task, body.models, usage.monthUsd, budget);
  const spent = nothingSpent();
  // Called and paid for in one piece: if the app stops waiting, Cloudflare cancels the request but lets this run on (for
  // 30 s), so a call that was nearly done still adds its cost.
  const run = (async () => {
    try { return { out: await callModel(body, choice, env.ANTHROPIC_API_KEY!, deps, today, spent) }; } catch (e) { return { e }; } finally {
      // whatever was spent is added, even when the call then failed (an answer in the wrong shape is still paid for)
      // (if Supabase can't be reached the answer still goes back; only the total misses it)
      if (spent.usd > 0) spent.next = await addSpend(user, env, deps, today, (u) => ({ ...u, calls: u.calls + (more ? 0 : 1), dayUsd: u.dayUsd + spent.usd, monthUsd: u.monthUsd + spent.usd,
        byModel: { ...u.byModel, [choice]: (u.byModel[choice] ?? 0) + spent.usd }, recent: [...(u.recent ?? []), logOf(deps.now(), body.task, choice, spent.usage, spent.usd)].slice(-RECENT_CALLS) })).catch(() => undefined);
    }
  })();
  ctx?.waitUntil(run);
  const { out, e } = await run, next = spent.next ?? usage, cost = spent.usd;
  const web = spent.webFailed.length ? { webFailed: [...new Set(spent.webFailed)] } : {};
  if (out?.refused) return fail("refused", 422, { usage: next, costUsd: cost });
  if (out) return json({ answer: out.answer, usage: next, costUsd: cost, model: choice, ...web });
  const [code, status, detail] = whyFailed(e);
  return fail(code, status, { usage: next, costUsd: cost, ...web }, detail);
}

/**
 * What went wrong, as one of AI_ERRORS (owner, 27 Oct: "we need error codes for stuff… i should know what caused"). The
 * API's own words decide between the cases its status alone can't: credit gone and a spend limit both come as a 400.
 */
export function whyFailed(e: unknown): [AiError, number, string?] {
  if (e instanceof SyntaxError) return ["bad-answer", 502];
  if (e instanceof Anthropic.APIConnectionTimeoutError) return ["ai-timeout", 504];
  if (e instanceof Anthropic.APIConnectionError) return ["no-network", 502];
  if (e instanceof Anthropic.APIError) {
    // the API's own words ("Your credit balance is too low…"), not the SDK's "400 {json}"
    const said = (e.error as { error?: { message?: string } } | undefined)?.error?.message ?? e.message ?? "", st = e.status;
    if (/credit balance/i.test(said)) return ["no-credit", 402];
    if (/usage limit|spend limit|spending limit/i.test(said)) return ["spend-limit", 402];
    if (st === 401 || st === 403) return ["bad-key", 502];
    if (st === 429) return ["busy", 429];
    if (st === 529 || /overloaded/i.test(said)) return ["overloaded", 503];
    if (st === 413 || /too long|too large|prompt is too long/i.test(said)) return ["too-big", 413];
    if (st != null && st >= 500) return ["ai-down", 502, String(st)];
    return ["ai-error", 502, `${st ?? "?"}: ${said.replace(/\s+/g, " ").slice(0, 120)}`];
  }
  return ["server-error", 500, e instanceof Error ? e.message.slice(0, 120) : String(e).slice(0, 120)];
}
