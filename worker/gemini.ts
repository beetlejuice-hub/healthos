/**
 * The light jobs on Gemini first (owner, 3 Nov: "bro why are we not doing the gemini free api tier and farm other free
 * api-s for bs like food calorie estimate, i should not be paying dollahs for that … i also have 10 dollar in gemini
 * credits"). Food estimates and the app's questions go to Gemini's free tier (GEMINI_FREE_KEY: a Google project without
 * billing — billing on a project ends its free quota), then to his credits (GEMINI_API_KEY: the project that has them),
 * then to Claude as before. A quota used up, an error, an answer in the wrong shape: the next one. The same prompt and
 * the same checks as Claude's, so what reaches the app is held to the same rules.
 *
 * Facts it rests on (Google's pages, 3 Nov 2026): the free tier is Flash-class only, with small daily caps; in the EU an
 * unpaid project's prompts are treated like paid ones (not used to improve Google's products); paid Flash-Lite costs more
 * per token than Claude Haiku, so the saving is the free quota and credit already bought. Model names change: GEMINI_MODEL
 * and GEMINI_PAID_MODEL override them.
 */

import { SCHEMAS, SYSTEM, checkDescribe, checkQuestions, type AiRequest, type Task } from "../src/lib/ai/tasks";

export type Via = "gemini-free" | "gemini";
export type GeminiEnv = { GEMINI_FREE_KEY?: string; GEMINI_API_KEY?: string; GEMINI_MODEL?: string; GEMINI_PAID_MODEL?: string };

export const GEMINI = {
  free: "gemini-3.5-flash-lite",
  paid: "gemini-3.1-flash-lite",
  /** List prices, $ per million tokens in / out (thinking is billed as out). */
  rates: { "gemini-3.5-flash-lite": [0.3, 2.5], "gemini-3.1-flash-lite": [0.25, 1.5] } as Record<string, [number, number]>,
} as const;

/** Which requests may go to Gemini: food estimates without a web look-up, and the questions. Nothing with his whole day. */
export const forGemini = (b: AiRequest): boolean => (b.task === "describe" && !b.lookup) || b.task === "questions";

/** The providers to try, in order, with what's set: the free tier, then the credits. */
export function geminiOrder(env: GeminiEnv): { via: Via; key: string; model: string }[] {
  return [
    ...(env.GEMINI_FREE_KEY ? [{ via: "gemini-free" as const, key: env.GEMINI_FREE_KEY, model: env.GEMINI_MODEL || GEMINI.free }] : []),
    ...(env.GEMINI_API_KEY ? [{ via: "gemini" as const, key: env.GEMINI_API_KEY, model: env.GEMINI_PAID_MODEL || GEMINI.paid }] : []),
  ];
}

export type GeminiUsage = { in: number; out: number };
export const geminiUsd = (via: Via, model: string, u: GeminiUsage) => {
  if (via === "gemini-free") return 0;
  const [i, o] = GEMINI.rates[model] ?? GEMINI.rates[GEMINI.paid];
  return (u.in * i + u.out * o) / 1e6;
};

/** Why a Gemini call didn't give an answer — any of them means: try the next one. */
export class GeminiMiss extends Error {
  why: "quota" | "key" | "refused" | "down" | "bad-answer";
  usage: GeminiUsage;
  constructor(why: GeminiMiss["why"], detail: string, usage: GeminiUsage = { in: 0, out: 0 }) { super(`gemini ${why}: ${detail}`); this.why = why; this.usage = usage; }
}

type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

/** The user's message as Gemini's parts: the photo (if any) and the same words Claude gets. */
function partsFor(b: AiRequest, today: string): Part[] {
  if (b.task === "describe") {
    return [...(b.image ? [{ inlineData: { mimeType: b.image.mediaType, data: b.image.data } }] : []), { text: b.text ? `What I had: ${b.text}` : "What's in this photo? Log it." }];
  }
  if (b.task === "questions") return [{ text: `Today is ${today}.\n\nMy data:\n${b.context}\n\nAlready asked: ${b.asked.join(" | ") || "nothing yet"}` }];
  throw new GeminiMiss("refused", `not a Gemini task: ${b.task}`);
}

/** One call: the answer, checked as Claude's is, and the tokens it used. */
export async function callGemini(b: AiRequest, p: { key: string; model: string }, fetcher: typeof fetch, today: string): Promise<{ answer: unknown; usage: GeminiUsage }> {
  const task = b.task as Task;
  const body = {
    systemInstruction: { parts: [{ text: SYSTEM[task] }] },
    contents: [{ role: "user", parts: partsFor(b, today) }],
    generationConfig: { responseMimeType: "application/json", responseJsonSchema: (SCHEMAS as Record<string, unknown>)[task], maxOutputTokens: 4000 },
  };
  let res: Response;
  try {
    res = await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(p.model)}:generateContent`, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": p.key }, body: JSON.stringify(body) });
  } catch (e) { throw new GeminiMiss("down", (e as Error).message); }
  const j = (await res.json().catch(() => ({}))) as { error?: { message?: string; status?: string }; candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[]; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number } };
  const usage = { in: j.usageMetadata?.promptTokenCount ?? 0, out: (j.usageMetadata?.candidatesTokenCount ?? 0) + (j.usageMetadata?.thoughtsTokenCount ?? 0) };
  if (!res.ok) {
    const why = res.status === 429 ? "quota" : res.status === 401 || res.status === 403 ? "key" : res.status >= 500 ? "down" : "refused";
    throw new GeminiMiss(why, `${res.status} ${j.error?.status ?? ""} ${(j.error?.message ?? "").slice(0, 160)}`.trim(), usage);
  }
  const c = j.candidates?.[0], text = (c?.content?.parts ?? []).filter((x) => !x.thought).map((x) => x.text ?? "").join("");
  if (!text) throw new GeminiMiss("refused", `no answer (${c?.finishReason ?? "none"})`, usage);
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new GeminiMiss("bad-answer", `not JSON: ${text.slice(0, 80)}`, usage); }
  try { return { answer: task === "describe" ? checkDescribe(raw as never) : checkQuestions(raw as never), usage }; } catch (e) { throw new GeminiMiss("bad-answer", (e as Error).message, usage); }
}
