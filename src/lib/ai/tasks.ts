/**
 * The in-app AI: what each task asks, the shape its answer must have, and the checks an answer
 * must pass before the app uses it. Shared by the Worker (which calls the model) and the app
 * (which sends the request and saves the result), so both agree on one contract.
 *
 * The rule from the proposal: **the engines compute, the AI explains and fills gaps.** Anything
 * it estimates is saved as data (a food, a drink, a supplement profile) and marked as an AI
 * estimate, so it's used once and free after that.
 */

export type Task = "describe" | "supplement" | "chat" | "questions" | "digest" | "night";
export type ModelChoice = "opus" | "sonnet" | "haiku";
/** Everyday = food, chat, questions (many small calls). Research = supplement look-ups and the morning digest (few, with web search). */
export type Tier = "everyday" | "research";

export const MODELS: Record<ModelChoice, { id: string; label: string; inUsd: number; outUsd: number; web: "web_search_20260209" | "web_search_20250305"; thinking: boolean }> = {
  opus: { id: "claude-opus-5-5", label: "Claude Opus 5.5", inUsd: 4, outUsd: 20, web: "web_search_20260209", thinking: true },
  sonnet: { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", inUsd: 2, outUsd: 10, web: "web_search_20260209", thinking: true },
  haiku: { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", inUsd: 1, outUsd: 5, web: "web_search_20250305", thinking: false },
};
/** Web search is billed per search on top of tokens. */
export const WEB_SEARCH_USD = 0.01;

export const TIER: Record<Task, Tier> = { describe: "everyday", chat: "everyday", questions: "everyday", supplement: "research", digest: "research", night: "research" };

export type Usage = { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null; server_tool_use?: { web_search_requests?: number } | null };

/** What a call cost, at list prices. Cache reads are ~0.1×, cache writes ~1.25× the input price. */
export function costUsd(model: ModelChoice, u: Usage): number {
  const m = MODELS[model];
  const input = u.input_tokens + 0.1 * (u.cache_read_input_tokens ?? 0) + 1.25 * (u.cache_creation_input_tokens ?? 0);
  return (input * m.inUsd + u.output_tokens * m.outUsd) / 1e6 + (u.server_tool_use?.web_search_requests ?? 0) * WEB_SEARCH_USD;
}

/* ------------------------------------------------------------------ answers */

export type Macros100 = { kcal: number; p: number; c: number; f: number };
export type DescribedItem = {
  kind: "food" | "drink";
  name: string;
  /** How much was described: "2 slices", "1 large cup". */
  amount: string;
  /** Food: values per 100 g, the unit it's counted in and how many. */
  per100?: Macros100;
  unit?: { name: string; g: number };
  count?: number;
  /** Drink: one serving as described. */
  drink?: { ml: number; caffeineMg: number; alcoholG: number; kcal: number };
  confidence: "high" | "medium" | "low";
  /** One short line on what it assumed ("assumed a 300 ml cup with a double shot"). */
  note: string;
};
export type DescribeAnswer = { items: DescribedItem[] };

export type Interaction = { with: string; verdict: "avoid" | "caution" | "timing" | "may-help" | "none"; say: string };
export type SupplementAnswer = {
  name: string; what: string; usualDose: string; timing: string;
  evidence: "strong" | "moderate" | "weak" | "very weak";
  uses: string[]; cautions: string[]; interactions: Interaction[];
  sources: { title: string; url: string }[];
};

export type ChatAnswer = { reply: string; remember: string[] };

export type Question = { id: string; text: string; why: string; options: string[]; /** Short key for a repeated question whose answers become a daily signal ("lunch_size"). */ key: string; repeat: "daily" | "once" };
export type QuestionsAnswer = { questions: Question[] };

export type DigestItem = { type: "fact" | "study" | "pattern" | "protocol"; title: string; text: string; source?: { title: string; url: string }; protocol?: { name: string; how: string; days: number; measure: string } };
export type DigestAnswer = { greeting: string; items: DigestItem[] };

/** The nightly read-back of your day (owner, 2 Oct: "summarizing what happened, what i should change"). */
export type NightAnswer = { summary: string; happened: string[]; notes: string; change: { what: string; why: string }[] };

/* ------------------------------------------------------------------ schemas (JSON Schema for structured output) */

const str = { type: "string" } as const, num = { type: "number" } as const;
const obj = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: "object", properties, required, additionalProperties: false });
const arr = (items: unknown) => ({ type: "array", items });

export const SCHEMAS: Record<Exclude<Task, "supplement" | "digest">, unknown> = {
  describe: obj({
    items: arr(obj({
      kind: { type: "string", enum: ["food", "drink"] }, name: str, amount: str,
      per100: obj({ kcal: num, p: num, c: num, f: num }), unit: obj({ name: str, g: num }), count: num,
      drink: obj({ ml: num, caffeineMg: num, alcoholG: num, kcal: num }),
      confidence: { type: "string", enum: ["high", "medium", "low"] }, note: str,
    }, ["kind", "name", "amount", "confidence", "note"])),
  }),
  chat: obj({ reply: str, remember: arr(str) }),
  questions: obj({ questions: arr(obj({ id: str, text: str, why: str, options: arr(str), key: str, repeat: { type: "string", enum: ["daily", "once"] } })) }),
  night: obj({ summary: str, happened: arr(str), notes: str, change: arr(obj({ what: str, why: str })) }),
};

/* ------------------------------------------------------------------ prompts */

const VOICE = `You are the AI inside HealthOS, a personal health tracker used by one person. Talk like a friend who knows the science: casual, short, specific, never preachy, never guilt-tripping. The user may have ADHD: make things feel easy and rewarding, one small next step at a time.
Hard rules: you are not a doctor. Never tell the user to stop, start or change a prescribed medication — say "ask your doctor/dermatologist" instead. Don't invent numbers the app's engines measure; use the numbers given in the context. If you aren't sure, say so.`;

const NIGHT = `${VOICE}
Task: read the user's day back to them at night. Use "## Today, as it happened" and the rest of the context.
- summary: 2–3 sentences on how the day went, with specifics (times, numbers) from the context.
- happened: 2–4 short bullets — what mattered today (meals, caffeine, alcohol, gym, how they felt and when).
- notes: the user's own notes on their check-ins say WHY they felt a way ("stressed — deadline"). Take them seriously: reflect what they said, connect it to the data only where the data supports it, never dismiss or explain it away. One or two sentences; empty string if there were no notes.
- change: 1–2 small, concrete things to try tomorrow, each with a one-line "why" tied to today's data or notes. Options, not orders; no guilt, no "you should have". If the day went well, say what to keep doing.
Use "goes with", never "causes". No medical advice; anything health-worrying → "worth asking a doctor".`;

export const SYSTEM: Record<Task, string> = {
  night: NIGHT,
  describe: `${VOICE}
Task: turn a description and/or photo of food or drink into items with nutrition values. Rules:
- Split a meal into its parts when they're logged separately (toast and butter), keep a dish whole when it's one thing (lasagne).
- Food: give values per 100 g from typical reference data (USDA-style), the everyday unit the user would count it in (slice, piece, cup, plate…) with its weight in grams, and how many units were described. kcal must be close to 4·protein + 4·carbs + 9·fat.
- Drink: one serving as described: ml, caffeine mg, alcohol grams (ml × ABV × 0.789), kcal. Café drinks vary a lot — assume the typical café size in Hungary/Europe unless told otherwise, and say what you assumed in the note.
- Photo: estimate portions from plate/cup size; say what you assumed. Use "low" confidence when portions are guesses.
- Omit per100/unit/count for drinks and drink for foods.`,
  supplement: `${VOICE}
Task: research a supplement the user just added. Search the web for current evidence (prefer systematic reviews, NIH ODS, Examine-style summaries, drug-interaction references). Check it against the user's conditions, medications, the rest of their stack, caffeine and alcohol.
Answer with ONLY a JSON object, no prose, in this shape:
{"name":"","what":"one line","usualDose":"","timing":"only if timing actually matters, else 'any regular time'","evidence":"strong|moderate|weak|very weak","uses":[""],"cautions":[""],"interactions":[{"with":"","verdict":"avoid|caution|timing|may-help|none","say":"one line"}],"sources":[{"title":"","url":""}]}
Every interaction and caution must be backed by one of the sources. Keep each line short.`,
  chat: `${VOICE}
Task: chat with the user about their health data. Use the context (their numbers, patterns, stack, about-me) — refer to specifics. Keep replies under 120 words unless they ask for detail. If you learn a lasting fact about them (habits, preferences, "usual coffee is a long coffee"), add it to "remember" as one short line; otherwise leave it empty. Never put guesses in "remember".`,
  questions: `${VOICE}
Task: ask 1–3 genuinely useful questions that help the app find patterns faster. Base each on something specific in the context: a dip at a time of day, a pattern that might be explained by something not logged, a gap in what's tracked. Good: "Your energy is often low around 4pm — did you have a big lunch today?" with options. Bad: generic wellness questions.
Each question: tappable options (2–5, short), a one-line "why" that says what it would help find, a short snake_case key, and repeat="daily" if asking it every day would build a useful signal, else "once". Don't repeat questions listed as already asked.`,
  digest: `${VOICE}
Task: write the user's morning read — what they'll see when they wake up. Search the web for 1–2 recent studies or findings relevant to THIS user (their stack, goals, conditions, patterns). Mix: an interesting pattern from their data (from the context, don't invent), a study or fun fact with its source, and optionally one protocol to try as an experiment (concrete: what to do, for how many days, what the app will measure).
Answer with ONLY a JSON object, no prose:
{"greeting":"one short line","items":[{"type":"fact|study|pattern|protocol","title":"","text":"2–3 sentences","source":{"title":"","url":""},"protocol":{"name":"","how":"","days":14,"measure":"energy|mood|focus|stress|sleep|weight"}}]}
3–5 items. "source" is required for facts and studies. "protocol" only on protocol items. Don't repeat titles listed as already shown.`,
};


/* ------------------------------------------------------------------ checks */

/** Pull the JSON object out of a text answer (for the web-search tasks, which answer in text). */
export function jsonFrom(text: string): unknown {
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON in the answer");
  return JSON.parse(text.slice(start, end + 1));
}

const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const labelOk = (m: Macros100) => {
  if (![m.kcal, m.p, m.c, m.f].every((v) => isNum(v) && v >= 0) || m.kcal > 900 || m.p + m.c + m.f > 105) return false;
  const est = 4 * m.p + 4 * m.c + 9 * m.f;
  return est === 0 ? m.kcal < 40 : Math.abs(est - m.kcal) <= Math.max(40, 0.3 * m.kcal);
};

/**
 * Keep only items that make physical sense: a food's label must add up and its unit weigh
 * 1 g–1.5 kg; a drink's caffeine must be under 600 mg and its alcohol possible for its volume.
 * What's dropped is reported back so nothing disappears silently.
 */
export function checkDescribe(a: DescribeAnswer): { items: DescribedItem[]; dropped: string[] } {
  const items: DescribedItem[] = [], dropped: string[] = [];
  for (const it of a.items ?? []) {
    if (it.kind === "food") {
      const ok = it.per100 && labelOk(it.per100) && it.unit && isNum(it.unit.g) && it.unit.g >= 1 && it.unit.g <= 1500 && isNum(it.count) && it.count > 0 && it.count <= 50;
      (ok ? items.push(it) : dropped.push(it.name));
    } else {
      const d = it.drink;
      const ok = d && isNum(d.ml) && d.ml > 0 && d.ml <= 2000 && isNum(d.caffeineMg) && d.caffeineMg >= 0 && d.caffeineMg <= 600 && isNum(d.alcoholG) && d.alcoholG >= 0 && d.alcoholG <= d.ml * 0.6 * 0.789 + 0.5 && isNum(d.kcal) && d.kcal >= 0 && d.kcal <= 2000;
      (ok ? items.push(it) : dropped.push(it.name));
    }
  }
  return { items, dropped };
}

const VERDICTS = ["avoid", "caution", "timing", "may-help", "none"];
export function checkSupplement(a: SupplementAnswer): SupplementAnswer {
  if (!a || typeof a.name !== "string" || typeof a.what !== "string") throw new Error("supplement answer is missing its name");
  const sources = (a.sources ?? []).filter((s) => typeof s?.url === "string" && /^https?:\/\//.test(s.url));
  return {
    ...a,
    evidence: (["strong", "moderate", "weak", "very weak"] as const).includes(a.evidence) ? a.evidence : "weak",
    uses: (a.uses ?? []).filter((x) => typeof x === "string"), cautions: (a.cautions ?? []).filter((x) => typeof x === "string"),
    interactions: (a.interactions ?? []).filter((i) => typeof i?.with === "string" && VERDICTS.includes(i.verdict)),
    sources,
  };
}

export function checkDigest(a: DigestAnswer): DigestAnswer {
  const items = (a.items ?? []).filter((i) => typeof i?.title === "string" && typeof i?.text === "string")
    // A fact or study without a real link isn't shown: no source, no claim.
    .filter((i) => !(i.type === "fact" || i.type === "study") || (i.source && /^https?:\/\//.test(i.source.url)))
    .map((i) => (i.type === "protocol" && i.protocol ? { ...i, protocol: { ...i.protocol, days: Math.min(42, Math.max(7, Math.round(i.protocol.days || 14))) } } : i));
  return { greeting: typeof a.greeting === "string" ? a.greeting : "Morning!", items };
}

export function checkNight(a: NightAnswer): NightAnswer {
  const line = (x: unknown, n: number) => (typeof x === "string" ? x.trim().slice(0, n) : "");
  if (!line(a?.summary, 800)) throw new SyntaxError("night answer has no summary");
  return {
    summary: line(a.summary, 800),
    happened: (a.happened ?? []).map((x) => line(x, 200)).filter(Boolean).slice(0, 4),
    notes: line(a.notes, 500),
    change: (a.change ?? []).filter((c) => line(c?.what, 200)).slice(0, 2).map((c) => ({ what: line(c.what, 200), why: line(c.why, 240) })),
  };
}

export function checkQuestions(a: QuestionsAnswer): QuestionsAnswer {
  return { questions: (a.questions ?? []).filter((q) => q.text && q.options?.length >= 2 && q.options.length <= 6).slice(0, 3).map((q) => ({ ...q, key: q.key.toLowerCase().replace(/[^a-z0-9_]+/g, "_").slice(0, 40) || "q" })) };
}

export function checkChat(a: ChatAnswer): ChatAnswer {
  return { reply: typeof a.reply === "string" ? a.reply : "", remember: (a.remember ?? []).filter((x) => typeof x === "string" && x.length > 3 && x.length < 200).slice(0, 3) };
}

/* ------------------------------------------------------------------ requests */

export type AiRequest =
  | { task: "describe"; text?: string; image?: { mediaType: "image/jpeg" | "image/png" | "image/webp"; data: string } }
  | { task: "supplement"; name: string; dose?: string; context: string }
  | { task: "chat"; messages: { role: "user" | "assistant"; text: string }[]; context: string }
  | { task: "questions"; context: string; asked: string[] }
  | { task: "digest"; context: string; shown: string[] }
  | { task: "night"; day: string; context: string };

export type AiAnswer<T extends Task> = T extends "describe" ? { items: DescribedItem[]; dropped: string[] } : T extends "supplement" ? SupplementAnswer : T extends "chat" ? ChatAnswer : T extends "questions" ? QuestionsAnswer : T extends "night" ? NightAnswer : DigestAnswer;

/** What the Worker keeps per account (doc "ai_usage", written only by the Worker). */
export type UsageDoc = { day: string; calls: number; dayUsd: number; month: string; monthUsd: number; byModel: Partial<Record<ModelChoice, number>> };
export const DAILY_CAP = 50;

/**
 * A typical month, for the estimate in Settings (and the doc's model comparison): per day, ~10
 * everyday calls (food the parser didn't know, a photo, chat, questions; ~1.8k tokens in, ~0.7k
 * out incl. thinking) and the research tier's morning read (~25k in with search results, ~3k out,
 * 3 searches) plus a supplement look-up every few days. Real spend is measured and shown next to it.
 */
export const TYPICAL_DAY = {
  everyday: { calls: 10, input_tokens: 1800, output_tokens: 700 },
  research: { calls: 1.2, input_tokens: 25000, output_tokens: 3000, searches: 3 },
};
export function estimateMonthUsd(models: { everyday: ModelChoice; research: ModelChoice }): { everyday: number; research: number; total: number } {
  const e = TYPICAL_DAY.everyday, r = TYPICAL_DAY.research;
  const everyday = 30 * e.calls * costUsd(models.everyday, { input_tokens: e.input_tokens, output_tokens: e.output_tokens });
  const research = 30 * r.calls * costUsd(models.research, { input_tokens: r.input_tokens, output_tokens: r.output_tokens, server_tool_use: { web_search_requests: r.searches } });
  return { everyday, research, total: everyday + research };
}
