/**
 * The in-app AI: what each task asks, the shape its answer must have, and the checks an answer
 * must pass before the app uses it. Shared by the Worker (which calls the model) and the app
 * (which sends the request and saves the result), so both agree on one contract.
 *
 * The rule from the proposal: **the engines compute, the AI explains and fills gaps.** Anything
 * it estimates is saved as data (a food, a drink, a supplement profile) and marked as an AI
 * estimate, so it's used once and free after that.
 */

export type Task = "describe" | "supplement" | "chat" | "questions" | "digest" | "night" | "review" | "dive" | "verdict";
export type ModelChoice = "opus" | "sonnet" | "haiku";
/**
 * Light = food, photos and quick questions (many small calls); everyday = the chat; reads = the morning and night reads
 * and the week read; research = the deep dive, verdicts and supplement look-ups. Owner, 15 Oct: "for harder or more
 * important request can leave a better model but for food or simple everyday things can add a cheaper one - $20 should
 * be enough for around a month".
 */
export type Tier = "light" | "everyday" | "reads" | "research";

export const MODELS: Record<ModelChoice, { id: string; label: string; inUsd: number; outUsd: number; web: "web_search_20260209" | "web_search_20250305"; thinking: boolean }> = {
  opus: { id: "claude-opus-5-5", label: "Claude Opus 5.5", inUsd: 4, outUsd: 20, web: "web_search_20260209", thinking: true },
  sonnet: { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", inUsd: 2, outUsd: 10, web: "web_search_20260209", thinking: true },
  haiku: { id: "claude-haiku-5-5", label: "Claude Haiku 5.5", inUsd: 0.1, outUsd: 0.5, web: "web_search_20250305", thinking: true },
};
/** Web search is billed per search on top of tokens. */
export const WEB_SEARCH_USD = 0.01;

export const TIER: Record<Task, Tier> = { describe: "light", chat: "everyday", questions: "light", supplement: "research", digest: "reads", night: "reads", review: "reads", dive: "research", verdict: "research" };
export type Models = Record<Tier, ModelChoice>;
/**
 * Cheap where it's simple, the strongest where it matters. Owner, 27 Oct ("ai is in fact spending around 50 cent to 1
 * dollar a day so we can tune it down just a liitle bit or make cheaper models run more often" — then "4 ok"): the daily
 * reads and the chat on Sonnet 5.5, half Opus's price, studies and things to try kept; Opus for the weekly deep dive,
 * verdicts and supplement look-ups.
 */
export const DEFAULT_MODELS: Models = { light: "haiku", everyday: "sonnet", reads: "sonnet", research: "opus" };
/** Picks saved before the reads had their own (v1) move once: the chat and the reads to the new default, the rest kept. */
export const MODELS_V = 2;
export function modelsNow(m: Partial<Models> | undefined, v: number | undefined): Models {
  if ((v ?? 1) >= MODELS_V) return { ...DEFAULT_MODELS, ...m };
  return { ...DEFAULT_MODELS, ...(m?.light ? { light: m.light } : {}), ...(m?.research ? { research: m.research } : {}) };
}
/** A month's spend after which every task runs on the cheapest model until the 1st (the 50-a-day stop still holds). */
export const MONTHLY_USD = 20;
/** The model a task runs on: yours for its tier (older synced docs have no light tier — its default then), Haiku past the month's budget. */
export function modelFor(task: Task, models: Partial<Models> | undefined, monthUsd: number, budget = MONTHLY_USD): ModelChoice {
  if (monthUsd >= budget) return "haiku";
  const pick = models?.[TIER[task]];
  return pick && pick in MODELS ? pick : DEFAULT_MODELS[TIER[task]];
}

/** One sampling attempt's tokens; a `fallback_message` names the model that ran it (a refusal's server-side fallback). */
export type Iteration = { type: string; model?: string | null; input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null };
export type Usage = { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null; server_tool_use?: { web_search_requests?: number } | null; iterations?: Iteration[] | null };

/**
 * List prices per million tokens, cache reads as their own price (Opus 5.5's are $0.20 — 0.05×, not 0.1×). The models a
 * refusal falls back to are here too: they bill at their own rates (claude-api pricing, checked 27 Oct).
 */
export const PRICES: Record<string, { in: number; out: number; read: number }> = {
  "claude-opus-5-5": { in: 4, out: 20, read: 0.2 }, "claude-sonnet-5-5": { in: 2, out: 10, read: 0.2 }, "claude-haiku-5-5": { in: 0.1, out: 0.5, read: 0.01 },
  "claude-opus-5": { in: 5, out: 25, read: 0.5 }, "claude-opus-4-8": { in: 5, out: 25, read: 0.5 }, "claude-sonnet-5": { in: 2, out: 10, read: 0.2 },
};
const tokensUsd = (p: { in: number; out: number; read: number }, t: Omit<Iteration, "type">) =>
  (t.input_tokens * p.in + (t.cache_read_input_tokens ?? 0) * p.read + 1.25 * (t.cache_creation_input_tokens ?? 0) * p.in + t.output_tokens * p.out) / 1e6;

/**
 * What a call cost, at list prices. Cache writes are 1.25× the input price. With a server-side fallback the top-level
 * usage covers only the attempt that answered — the declined one is billed too — so then each attempt in `iterations`
 * is priced at its own model (27 Oct: the app said $11 where the account said $18).
 */
export function costUsd(model: ModelChoice, u: Usage): number {
  const own = PRICES[MODELS[model].id] ?? PRICES["claude-opus-5"], searches = (u.server_tool_use?.web_search_requests ?? 0) * WEB_SEARCH_USD;
  const its = u.iterations ?? [];
  if (its.some((i) => i.type === "fallback_message"))
    return its.reduce((a, i) => a + (i.type === "message" ? tokensUsd(own, i) : i.type === "fallback_message" ? tokensUsd(PRICES[i.model ?? ""] ?? PRICES["claude-opus-5"], i) : 0), 0) + searches;
  return tokensUsd(own, u) + searches;
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
  /** Food: per 100 g, for its Nutri-Score in the food score (PLAN 139) — sugar, saturated fat, salt, fibre in g, `fvl` % that's
   *  fruit/veg/legumes. Left out for oils, butter, nuts and seeds (their own table in the formula). */
  nutri?: { sugar: number; satFat: number; salt: number; fiber: number; fvl: number; redMeat: boolean; cheese: boolean };
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
  /** `checked`: the server opened it and it matched (PLAN 160). */
  sources: { title: string; url: string; checked?: boolean }[];
};

/**
 * A chat answer: the reply, or — mid-message — the tools the AI wants run (PLAN 67) with the AI's turns from this call,
 * which the app sends back exactly as they came, one message each (Opus 5.5 ties its thinking to the conversation as sent).
 */
export type ChatTurn = { role: "user" | "assistant"; content: unknown[] };
export type ChatAnswer = { reply: string; remember: string[]; calls?: ToolCall[]; turn?: ChatTurn[] };
export type ToolCall = { id: string; name: ChatToolName; input: Record<string, unknown> };

/** What `series` and `show_chart` can draw: the At a glance measures and the band's. */
export const SERIES_KEYS = ["mood", "energy", "focus", "stress", "sleep", "kcal", "protein", "cafBed", "drinks", "weight", "rhr", "hrv", "burned", "steps"] as const;
export type SeriesKey = (typeof SERIES_KEYS)[number];
const date = { type: "string", format: "date" } as const;
/** What `compare` can split days by. */
export const COMPARE_THINGS = ["drinks", "trained", "late_caffeine", "late_meal", "big_meal", "weekend", "supplement"] as const;
export type CompareThing = (typeof COMPARE_THINGS)[number];
/** What `propose` can change (lib/ai/propose, PLAN 98). */
export const PROPOSE_CHANGES = ["add_supplement", "dose", "supplement_status", "log_supplement", "goals", "experiment", "delete_entry", "log_food", "log_drink", "log_feel", "log_weight", "edit_entry"] as const;
export type ProposeChange = (typeof PROPOSE_CHANGES)[number];
/** What an experiment can measure — the same list the morning read's protocols use. */
export const EXPERIMENT_MEASURES = ["energy", "mood", "focus", "stress", "sleep", "weight"] as const;
export const PACE_NAMES = ["slow", "steady", "fast"] as const;
/**
 * The chat's tools (PLAN 67; owner, 9 Oct: "pull data based on what i ask and answer it nicely"). The app runs them on its
 * own data with the engines the pages use (lib/ai/chattools) — every number the AI quotes comes from here or the summary.
 */
export const CHAT_TOOLS = [
  { name: "day", description: "Everything logged on one date, in order — food, drinks, supplements, check-ins with notes, training, sleep rating — plus that day's averages and, when the band was worn, its resting heart rate, HRV, steps and calories burned. Use for any question about a specific day.", input_schema: { type: "object", properties: { date }, required: ["date"], additionalProperties: false } },
  { name: "series", description: "One measure day by day over a span (at most 120 days), with its average, lowest and highest. Measures: mood, energy, focus, stress (1–10 check-in averages), sleep (morning rating /10), kcal and protein (eaten), cafBed (caffeine at bedtime, mg), drinks, weight, rhr and hrv (band, mornings), burned (band kcal), steps.", input_schema: { type: "object", properties: { measure: { type: "string", enum: SERIES_KEYS }, from: date, to: date }, required: ["measure", "from", "to"], additionalProperties: false } },
  { name: "find", description: "Where a word shows up in the last 180 days: food and drink names, supplements, check-in notes and tags, answers to questions, workout names. Returns the dates and times, newest first. Use for \"when did I last…\", \"how often do I…\".", input_schema: { type: "object", properties: { text: { type: "string" } }, required: ["text"], additionalProperties: false } },
  { name: "show_chart", description: "Attach a chart of one measure over a span to your reply; the app draws it from its own data. Use when a trend over days or weeks says it better than words — at most two per reply.", input_schema: { type: "object", properties: { measure: { type: "string", enum: SERIES_KEYS }, from: date, to: date, title: { type: "string" } }, required: ["measure", "from", "to", "title"], additionalProperties: false } },
  { name: "compare", description: "One measure on days with a thing against days without it, with the difference and its 95% range — the app's own test (clear only when the range doesn't cross zero; goes with, not proof of cause). when: same_day, or next_day for what shows the morning after (sleep rating, rhr, hrv after drinks or a late meal). thing: drinks, trained, late_caffeine (after 14:00), late_meal (after 21:00), big_meal (900+ kcal in one go), weekend, or supplement (name it in supplement; taken against answered not taken). Days with nothing logged are left out, never counted as without. At most 120 days.", input_schema: { type: "object", properties: { measure: { type: "string", enum: SERIES_KEYS }, thing: { type: "string", enum: COMPARE_THINGS }, supplement: { type: "string" }, when: { type: "string", enum: ["same_day", "next_day"] }, from: date, to: date }, required: ["measure", "thing", "supplement", "when", "from", "to"], additionalProperties: false } },
  { name: "nights", description: "The band's nights over a span (at most 60): for each, bed and wake times, time asleep, deep, REM and light sleep, minutes awake, lowest and average heart rate, HRV, a nap that day. A night is filed under the morning it ended.", input_schema: { type: "object", properties: { from: date, to: date }, required: ["from", "to"], additionalProperties: false } },
  { name: "sessions", description: "Training sessions over a span (at most 120 days): when, which workout, working sets, volume, strength against your trend (%), and each lift's best set.", input_schema: { type: "object", properties: { from: date, to: date }, required: ["from", "to"], additionalProperties: false } },
  { name: "propose", description: "Propose one change to the user's setup; the app shows it under your reply as a card with Apply, and nothing changes until they tap it. Use when they give you a protocol or plan, or ask you to set something up — one call per change, several calls for a plan with several steps. change: add_supplement (supplement, dose, slots), dose (supplement, the new dose), supplement_status (supplement; status taking, stopped or out), log_supplement (supplement; amount when they said how much, e.g. '2000 IU'; time 'HH:MM' today when they said when, else now) for something they took — also one they ran out of or one that isn't theirs (borrowed): it only logs the intake, never restocks or adds it to the stack, so don't propose supplement_status alongside unless they ask, goals (kcal set by hand, protein in g, or pace slow / steady / fast — the fat-loss pace the calorie goal follows from their burn; kcal and pace don't go together), experiment (experiment name, how, days 3–60, measure), delete_entry (entry: the [id:…] the day or find look-up shows after it — owner, 22 Oct: \"i asked to delete 2 entries, it found them but cant delete them\"; one call per entry, only ones they asked to delete or said were logged by mistake). Logging from the chat (owner, 28 Oct: \"give ai more tools, so it can reach and do more inside app\") — one call per item, so '2 eggs and a flat white at 8' is two: log_food (name, grams, kcal, protein, carbs, fat — your best estimate for that amount, and say so in why), log_drink (name, ml, caffeine_mg, alcohol_g, kcal), log_feel (any of mood, energy, focus, stress 1–10, note), log_weight (kg); each takes time 'HH:MM' and day 'today' (the default) or 'yesterday', never later than now. edit_entry (entry: the [id:…] a look-up shows; then time 'HH:MM' on the same day, and/or grams for a food or ml for a drink — its kcal, macros, caffeine and alcohol scale with it — and/or name) for one they logged wrong. why: one short line shown on the card. Supplements only — never prescribed medication.", input_schema: { type: "object", properties: { change: { type: "string", enum: PROPOSE_CHANGES }, why: { type: "string" }, entry: { type: "string" }, supplement: { type: "string" }, dose: { type: "string" }, slots: { type: "array", items: { type: "string", enum: ["morning", "midday", "evening"] } }, status: { type: "string", enum: ["taking", "stopped", "out"] }, amount: { type: "string" }, time: { type: "string" }, day: { type: "string", enum: ["today", "yesterday"] }, kcal: { type: "integer" }, protein: { type: "integer" }, carbs: { type: "integer" }, fat: { type: "integer" }, name: { type: "string" }, grams: { type: "integer" }, ml: { type: "integer" }, caffeine_mg: { type: "integer" }, alcohol_g: { type: "number" }, mood: { type: "integer" }, energy: { type: "integer" }, focus: { type: "integer" }, stress: { type: "integer" }, note: { type: "string" }, kg: { type: "number" }, pace: { type: "string", enum: PACE_NAMES }, experiment: { type: "string" }, how: { type: "string" }, days: { type: "integer" }, measure: { type: "string", enum: EXPERIMENT_MEASURES } }, required: ["change", "why"], additionalProperties: false } },
  { name: "remember", description: "Keep one lasting fact about the user in memory (a habit, a preference, \"usual coffee is a long coffee\"). Never guesses, never one-off events.", input_schema: { type: "object", properties: { text: { type: "string" } }, required: ["text"], additionalProperties: false } },
] as const;
export type ChatToolName = (typeof CHAT_TOOLS)[number]["name"];
/** Tool rounds in one message, at most. */
export const CHAT_ROUNDS = 6;
/**
 * The reads' look-ups (PLAN 160; owner, 21 Oct: "do 2, 1, 3, 4" — 1: the reads compute): the chat's read-only tools, so a
 * "pattern" or "noticed" item quotes numbers the app worked out (its tested engines) instead of reading them off the summary.
 */
export const READ_TOOL_NAMES = ["compare", "series", "nights", "day", "find", "sessions"] as const;
export const READ_TOOLS = CHAT_TOOLS.filter((t) => (READ_TOOL_NAMES as readonly string[]).includes(t.name));
/** Look-up rounds in one read, at most; the round after must answer. */
export const READ_ROUNDS = 2;

/** What a question is for (PLAN 156; lib/ai/asking). */
export const Q_KINDS = ["tracking", "investigate", "study", "check", "followup", "checkup"] as const;
export type QKind = (typeof Q_KINDS)[number];
export const isQKind = (k: unknown): k is QKind => (Q_KINDS as readonly unknown[]).includes(k);
export type Question = { id: string; text: string; why: string; options: string[]; /** Short key; a tracking question keeps its key across days so the answers add up ("lunch_size"). */ key: string;
  /** "daily" is from before 21 Oct (asked word for word every day) — no longer shown that way. */ repeat: "daily" | "once"; kind?: QKind; /** A study question's source. */ source?: { title: string; url: string; checked?: boolean } };
export type QuestionsAnswer = { questions: Question[] };

/** The numbers a morning-read item can point at; the app draws that one's last 14 days beside it (PLAN 150). */
export const DIGEST_MEASURES = ["sleep", "protein", "kcal", "mood", "energy", "focus", "stress", "caffeine", "alcohol", "weight", "lifting", "skin", "breathing", "oxygen", "vo2"] as const;
export type DigestMeasure = (typeof DIGEST_MEASURES)[number];
export const isDigestMeasure = (k: unknown): k is DigestMeasure => (DIGEST_MEASURES as readonly unknown[]).includes(k);
/**
 * How sure a claim is (owner, 22 Oct: "make ai more smarter and cautious"): the app's own test on their data, strong
 * studies (meta-analyses, several good trials), some studies (one trial, small or observational), or anecdote (forums,
 * personal reports, an expert's say-so).
 */
export const SURE = ["yours", "strong", "some", "anecdote"] as const;
export type Sure = (typeof SURE)[number];
export const isSure = (x: unknown): x is Sure => (SURE as readonly unknown[]).includes(x);
/** What an item keeps of the app's tested link it explains (PLAN 176, lib/ai/lead): the two signals and the lag. */
export type LeadRef = { id: string; a: string; b: string; lag: 0 | 1 };
export type DigestItem = { type: "fact" | "study" | "pattern" | "protocol" | "try" | /** the evening's investigation (PLAN 157) */ "noticed"
  /** what they do → a number that moves → what it goes with (owner, 22 Oct: "making the ai come up w connections like this on its own") */ | "connection"; title: string; text: string;
  sure?: Sure; /** A connection's links, each with how sure it is. */ chain?: { step: string; sure: Sure }[]; /** `checked`: the server opened it and it matched (PLAN 160). */ source?: { title: string; url: string; checked?: boolean }; protocol?: { name: string; how: string; days: number; measure: string };
  /** One thing to do today (owner, 21 Oct: "I like that its adding tips and advices"). */ tip?: string; measure?: DigestMeasure;
  /** The app's tested link this item explains (PLAN 176): set by the app, not the AI — its two-row chart is drawn from it. */ lead?: LeadRef };
/**
 * Something new enough to message about (owner, 16 Oct: "it should only send message when it has a new finding, a new
 * sttudy or whatever but if its displayed on today page then nonsensee"): sent to the chat, not shown on Today. Most days none.
 */
export type DigestNews = { title: string; text: string; source: { title: string; url: string; checked?: boolean } };
export type DigestAnswer = { greeting: string; items: DigestItem[]; news?: DigestNews | null; /** 1–2, the kinds the app picked (PLAN 156). */ questions?: Question[] };
/**
 * The weekly deep dive (PLAN 160): the question it picked and why (from their data), what their own numbers say (from the
 * app's look-ups), 2–3 studies with their links, the verdict and how sure, and one experiment to try.
 */
export type DiveStudy = { title: string; text: string; source: { title: string; url: string; checked?: boolean } };
export type DiveAnswer = { topic: string; why: string; yourData: string; found: DiveStudy[]; verdict: string; sure: "strong" | "moderate" | "weak";
  experiment?: { name: string; how: string; days: number; measure: (typeof EXPERIMENT_MEASURES)[number] } };
export function checkDive(a: DiveAnswer): DiveAnswer {
  const str = (x: unknown, n: number) => (typeof x === "string" ? x.trim().slice(0, n) : "");
  const topic = str(a?.topic, 140), verdict = str(a?.verdict, 700);
  if (!topic || !verdict) throw new SyntaxError("a deep dive needs its question and its verdict");
  const found = (Array.isArray(a.found) ? a.found : []).filter((f) => f && str(f.title, 1) && /^https:\/\//.test(f.source?.url ?? "")).slice(0, 3)
    .map((f) => ({ title: str(f.title, 120), text: str(f.text, 400), source: { title: str(f.source.title, 160) || str(f.title, 120), url: f.source.url } }));
  const x = a.experiment, okX = x && str(x.name, 1) && str(x.how, 1) && Number.isFinite(x.days) && x.days >= 3 && x.days <= 60 && (EXPERIMENT_MEASURES as readonly string[]).includes(x.measure);
  return { topic, why: str(a.why, 400), yourData: str(a.yourData, 600), found, verdict, sure: a.sure === "strong" || a.sure === "moderate" ? a.sure : "weak",
    ...(okX ? { experiment: { name: str(x!.name, 80), how: str(x!.how, 300), days: Math.round(x!.days), measure: x!.measure } } : {}) };
}

/** An experiment's verdict (PLAN 160): the AI's words on the app's result — the app decides whether it worked, never the AI. */
export type VerdictAnswer = { text: string; next: string; found: DiveStudy[] };
export function checkVerdict(a: VerdictAnswer): VerdictAnswer {
  const str = (x: unknown, n: number) => (typeof x === "string" ? x.trim().slice(0, n) : "");
  const text = str(a?.text, 500);
  if (!text) throw new SyntaxError("a verdict needs its words");
  const found = (Array.isArray(a.found) ? a.found : []).filter((f) => f && str(f.title, 1) && /^https:\/\//.test(f.source?.url ?? "")).slice(0, 2)
    .map((f) => ({ title: str(f.title, 120), text: str(f.text, 300), source: { title: str(f.source.title, 160) || str(f.title, 120), url: f.source.url } }));
  return { text, next: str(a.next, 240), found };
}

/** A read mid-way: the look-ups it wants the app to run, and its turns to send back as they were (PLAN 160). */
export type ReadLooks = { calls: ToolCall[]; turn: ChatTurn[] };
export const isLooks = (a: unknown): a is ReadLooks => !!a && typeof a === "object" && Array.isArray((a as ReadLooks).calls) && (a as ReadLooks).calls.length > 0;
/** Only the reads' own look-ups, well formed. */
export function checkReadCalls(calls: unknown[], turn: unknown): ReadLooks {
  const ok = (calls ?? []).filter((c): c is ToolCall => !!c && typeof (c as ToolCall).id === "string" && (READ_TOOL_NAMES as readonly string[]).includes((c as ToolCall).name) && !!(c as ToolCall).input && typeof (c as ToolCall).input === "object");
  return { calls: ok, turn: Array.isArray(turn) ? (turn as ChatTurn[]) : [] };
}

/** The nightly read-back of your day (owner, 2 Oct: "summarizing what happened, what i should change"). */
export type NightAnswer = { summary: string; happened: string[]; notes: string; change: { what: string; why: string }[]; /** Lasting patterns worth remembering (kept in AI memory). */ remember: string[];
  /** On a day with a workout (PLAN 129): how it went against last time, what went up, one thing for next time. */
  workout?: { summary: string; better: string[]; next: string };
  /** The evening's three (PLAN 157; owner, 21 Oct: "the same studt, try, and notiiced session at Eod"), and its questions (PLAN 156). */
  items?: DigestItem[]; questions?: Question[] };
/** The week or month read (PLAN 65). `measure`: the [key] of the app's measure a notice is about, so its chart can be drawn ("" for none). */
export type ReviewAnswer = { title: string; summary: string; notices: { title: string; text: string; measure: string }[]; next: { what: string; why: string }[]; remember: string[];
  /** The month read's overall check (PLAN 137): findings on show that look like noise or plain sense, by their [id]. */
  checks?: { id: string; verdict: "noise" | "obvious"; why: string }[] };

/* ------------------------------------------------------------------ schemas (JSON Schema for structured output) */

const str = { type: "string" } as const, num = { type: "number" } as const;
const obj = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: "object", properties, required, additionalProperties: false });
const arr = (items: unknown) => ({ type: "array", items });

export const SCHEMAS: Record<Exclude<Task, "supplement" | "digest" | "chat" | "night" | "dive" | "verdict">, unknown> = {
  describe: obj({
    items: arr(obj({
      kind: { type: "string", enum: ["food", "drink"] }, name: str, amount: str,
      per100: obj({ kcal: num, p: num, c: num, f: num }), unit: obj({ name: str, g: num }), count: num,
      nutri: obj({ sugar: num, satFat: num, salt: num, fiber: num, fvl: num, redMeat: { type: "boolean" }, cheese: { type: "boolean" } }),
      drink: obj({ ml: num, caffeineMg: num, alcoholG: num, kcal: num }),
      confidence: { type: "string", enum: ["high", "medium", "low"] }, note: str,
    }, ["kind", "name", "amount", "confidence", "note"])),
  }),
  questions: obj({ questions: arr(obj({ id: str, text: str, why: str, options: arr(str), key: str, repeat: { type: "string", enum: ["daily", "once"] }, kind: { type: "string", enum: [...Q_KINDS] } })) }),
  review: obj({ title: str, summary: str, notices: arr(obj({ title: str, text: str, measure: str })), next: arr(obj({ what: str, why: str })), remember: arr(str),
    checks: arr(obj({ id: str, verdict: { type: "string", enum: ["noise", "obvious"] }, why: str })) }, ["title", "summary", "notices", "next", "remember"]),
};

/* ------------------------------------------------------------------ prompts */

const VOICE = `You are the AI inside HealthOS, a personal health tracker used by one person — and you're their friend, not a wellness app. Voice (owner, 22 Oct: "make ai talking style a bit more fun … let it be a bit more wild, it can land funny/harmless jokes too or joke like friends, it shouldnt be afraid to hurt my feelings … sometimes funny, somtimes mean, etc. but should land the info/data clearly"): talk like a real person who knows the science — casual, short, with opinions. Tease them like a mate would: roast the third coffee at 16:00, the "one beer" that was four, the skipped leg day — dry, deadpan, blunt when it fits. Vary it: some days funny, some days straight, now and then a bit savage; never the same joke twice. No fake sweetness, no hearts or emoji confetti (an emoji now and then is fine), no cheerleading, no wellness-speak, never preachy or guilt-tripping. The joke never hides the point: the number, the finding and the next step stay clear and right. Roast choices, never their body, looks or worth; nothing that sounds like a health worry is a joke. The user may have ADHD: one small next step at a time.
Hard rules: you are not a doctor. Never tell the user to stop, start or change a prescribed medication — say "ask your doctor/dermatologist" instead. Don't invent numbers the app's engines measure; use the numbers given in the context. If you aren't sure, say so.
Dates (owner, 16 Oct: the morning read took yesterday for today): the context's first line says what today is. "Last 14 days" ends yesterday — call those days yesterday or by their date, never "today"; today is only "Today so far" and "This morning". "Last night" is the night that ended this morning (the newest night).
Timing rule (owner, 13 Oct): something taken or eaten can't change how they feel within minutes — a supplement, a meal or a drink needs time to absorb (caffeine ~20–45 min, most supplements an hour or more, many work over days or weeks). Never link a check-in to something logged less than 30 minutes before it, and for supplements not less than an hour; a day without a supplement is a day they said "didn't take" or used the app without logging it (owner, 20 Oct: not logged = not taken); a day with nothing logged at all, and today until it's over, are unknown, not days without.
Goals (owner, 20 Oct: "give me suggestions based on my goals"): when About me lists "My goals", tie every suggestion — a change, a next step, a tip — to one of them and name it ("for losing fat: …"); never push a goal they didn't name.
Never the obvious (owner, 27 Oct: "ai seems to say the obvious … bit boring" · "Rn it just summarizes my day and tells me to eat more protein and sleep better basically"): they know protein matters, sleep matters, water, less caffeine late, move more, less stress. Never say one of those unless it arrives with something they didn't know — their own number that shows it ("your 3 best focus days all had 40 g+ protein before 10"), the mechanism, or a specific dose, timing or form from a study. Before you answer, ask: would a friend who listens to health podcasts already know this? If yes, cut it or go one level deeper. Connections between two things in their data, and what research says about why, beat any summary of their day.`;

/** How every question is asked (PLAN 156; owner, 21 Oct). */
const ASK_RULES = `How to ask (owner, 21 Oct: "make them actually usable, clever, creative, can be playfully worded sometimes, but it should still have a reason"): one line, under 140 characters, about THEM — a number, a time, a food, a note of theirs. "why" is one line: what it tracks or investigates, and what the answer would change. Playful when it fits ("Is the 3 pm slump a lunch thing or a Slack thing?"), never at the cost of the reason. A tracking question is re-worded every time it comes back (same key, new words). Never generic wellness ("how are you feeling?"), never about how they log ("before the bathroom?"), never words already asked, never a diagnosis. A supplement idea is "goes with … ever tried it?", with how sure the evidence is — never about a medication.
Things they noticed (owner, 20 Oct: "the app can … ask me about that, dive deep into it and see why that happens"): when "Things I noticed about myself" has one that came up more than once, or recently, one question may dig into it — what usually comes before it, when in the day, how often — informal and curious, with options; never a diagnosis.
Check-up (owner, 20 Oct: "a checkup from time to time, like how you been, have u experienced X, also ask based on my health markers"): when "## Check-up due" is at the end of the context, the first question is the check-up — how they've been this week, or, when a marker there moved, whether they've noticed it (resting heart rate up: "felt run down or like you're fighting something off?"), with the marker's numbers in "why"; its key starts "checkup_".`;

/** The reads' look-ups, in their prompts (PLAN 160). */
/** How sure, and connections (owner, 22 Oct: "make ai more smarter and cautious … come up w connections like this on its own"). */
const SURE_RULES = `HOW SURE (owner: "make ai more smarter and cautious"): every item carries "sure" — "yours" when it rests on the app's own test of their data (a look-up that came back clear), "strong" for meta-analyses or several good trials, "some" for one trial or small or observational studies, "anecdote" for forum posts, personal reports or someone's say-so without trials. Pick the lowest that fits; never word "some" or "anecdote" as settled. Nothing unsafe, ever: no prescription-only drugs, no megadoses, nothing that clashes with their stack, medications or conditions (About me) — check before you suggest.`;
const CONNECTION_RULES = `A "connection" item (owner: "i noticed when im drinking, my heart rate variability drops to 20 ms … connected to psoriasis flare ups. wondering what else is connected … not just psoriasis but everything else, me feeling tired, not focused"): a chain of 2–4 links from something they do (drinks, late caffeine, a late or big meal, training, short sleep, a supplement) through a number that moves in their data (HRV, resting heart rate, sleep, the night check) to something they care about — a condition in About me, feeling tired, focus, mood, sleep, skin, training. "chain": each link one short step (under 90 characters) with its own "sure". Check the link in their data with a look-up first (compare, e.g. hrv next_day after drinks) and put its numbers in the step; a link not tested on them says so in its own words ("… — not tested on you"), keeping its "sure" for what the studies show. "text" says in plain words what the chain means for them; "source" for the studies link. Goes with, never causes; never a diagnosis — a health worry → "worth asking a doctor".`;
const LOOK_RULES = `THE APP'S NUMBERS (owner, 21 Oct: make the AI smarter — numbers must be proven): you can ask the app for exact numbers with its tools: compare (a measure on days with a thing against days without, with the app's own test), series (a measure day by day), nights (the band's nights), day, find, sessions. Before a "pattern" or "noticed" item says two things go together, check it with compare (or series / nights) and put the app's numbers in its text ("sleep 6.1 after drinks vs 7.4 without — clear"). If the app's test says it isn't clear, say so plainly or pick another. At most 2 rounds of look-ups, several in a round when you need them; then answer.`;

const NIGHT = `${VOICE}
Task: read the user's day back to them. Use "## The day being read back" and the rest of the context. Its header says when that day is: today (read back tonight), tonight past midnight (still the same evening — lines marked "after midnight" are part of it), or yesterday (read back the next morning because the app wasn't opened that evening — then say "yesterday", never "today", and "tomorrow" in change means today).
- summary: 2–3 sentences on how the day went, with specifics (times, numbers) from the context.
- happened: 2–4 short bullets — what mattered today (meals, caffeine, alcohol, gym, how they felt and when).
- noticed (owner, 20 Oct: "mental and physical notices i see and realize … see why that happens … not like being my doctor"): a "noticed about myself" line in the day is theirs, like a note — in notes, say what that day held around it (sleep, caffeine, stress) where the data has it, and if "Things I noticed about myself" shows it before, how those times compare. Curious and informal, never a diagnosis.
- notes: the user's own notes on their check-ins say WHY they felt a way ("stressed — deadline"). Take them seriously: reflect what they said, connect it to the data only where the data supports it, never dismiss or explain it away. One or two sentences; empty string if there were no notes.
- change: 1–2 small, concrete things to try tomorrow, each with a one-line "why" tied to today's data or notes. Options, not orders; no guilt, no "you should have". If the day went well, say what to keep doing.
- Food (owner: "AI can reflect on this at EOD, letting me know what i should change"): when "## Plates that day" is there, one "happened" bullet may name the plate that fit his goal best, with its score; and when a plate scored under 60, one "change" may be the single swap that would lift it most, read from its parts (more protein, a better Nutri-Score, or earlier) — a real food swap, with the score's numbers. Never call a food bad; say how it fits the goal.
- workout (owner: "ai look at the workout at eod and make a summary, suggestions, compare how i am improving etc … like a health couach"): only when "## The workout that day" is in the context; leave it out otherwise. summary: 1–2 sentences on how the session went against the last one, with its numbers. better: 0–3 short lines — lifts that went up or a new best, with kg × reps and the %. next: one concrete thing for the next session from these numbers — a weight or rep target for a lift that hit its reps, or holding a lift that dropped (sleep, food or stress that day may say why — "goes with"). For cardio (its "Cardio:" lines — owner: "Cardio is important for my weight loss"): its minutes and the band's heart rate against the last of its kind, and the week's cardio minutes against the weeks before; next may be a minutes target. The kcal is an estimate (MET × weight) — say "about". Use the app's numbers only; no programme changes.
- remember: 0–2 lasting patterns about what goes with this user's mood, energy, focus, stress or sleep, only when the mood journal shows it on several days (not just today) and it isn't already in "What you remember about me". One short line each, e.g. "Stress runs high on deadline days; it eases after time outside." Empty if nothing new.
- items (owner, 21 Oct: "we should have the same studt, try, and notiiced session at Eod, not just in the morning, its interesting and cool"): exactly 3, the morning read's look and rules, never repeating it or anything already shown ("## Already shown"):
  - one "study": search the web for a recent study (last 12 months when you can) on something in THIS day — a food they ate, their caffeine or alcohol, their session, a supplement they took, how they slept — with its source;
  - one "try": the kind "## Tonight" names, for tomorrow, searched, with its source; never in their stack or already shown;
  - one "noticed": an investigation of something in the day — a "noticed about myself" line, or two things in the day that went together (a dip after a big lunch, a calm evening after training) — from the context, never invented; no source needed. When the day holds one (drinks tonight, a late coffee, a hard session), it may be a "connection" instead (type "connection", with its "chain").
  Each: "title" (hooks, under 60 characters), "text" (at most 2 short sentences, under 200 characters), "tip" (one line for tomorrow, starting with a verb), "measure" (the one number it's about: ${DIGEST_MEASURES.join(", ")}; the app draws its 14 days), "source" for study and try.
${SURE_RULES}
${CONNECTION_RULES}
${LOOK_RULES}
- questions: 1–2 about this day, the kinds "## Questions this time" names; for a study, its "source" (searched, https).
${ASK_RULES}
Use "goes with", never "causes". No medical advice; anything health-worrying → "worth asking a doctor".
Answer with ONLY a JSON object, no prose:
{"summary":"","happened":[""],"notes":"","change":[{"what":"","why":""}],"remember":[],"workout":{"summary":"","better":[""],"next":""},"items":[{"type":"study|try|noticed|connection","title":"","text":"","sure":"${SURE.join("|")}","chain":[{"step":"","sure":""}],"tip":"","measure":"","source":{"title":"","url":""}}],"questions":[{"kind":"${Q_KINDS.join("|")}","text":"","options":["",""],"why":"","key":"","source":{"title":"","url":""}}]}
Leave "workout" out on a day without one.`;

export const SYSTEM: Record<Task, string> = {
  night: NIGHT,
  dive: `${VOICE}
Task: this week's deep dive (owner, 21 Oct: make the AI smarter, "do more research"; the AI picks the topic). "## This week's deep dive" says how to pick: ONE question from THEIR data, never a past topic. Then dig:
- their own numbers first — use the app's look-ups (compare, series, nights, day, find, sessions) and put what they say in "yourData", with the numbers ("sleep 6.4 after magnesium vs 6.6 without over 40 nights — not clear");
- search the web for the best 2–3 studies or reviews on it (recent where you can; a meta-analysis beats one small trial), each in "found" with what it found in one or two sentences and its real https link;
- "verdict": answer the question for THEM in 2–4 sentences — what the studies say against what their data shows, plainly, including "the evidence is thin" or "your data can't tell yet" when that's the truth. Goes with, never causes; no medical advice;
- "sure": strong, moderate or weak — how sure the verdict is;
- "experiment": one to settle it on them, when one fits: name, how (concrete), days (7–28), measure (${EXPERIMENT_MEASURES.join(", ")}).
"topic" is the question itself, under 100 characters ("Is magnesium doing anything for your sleep?"); "why" one sentence on why it came up in their data.
${LOOK_RULES}
Answer with ONLY a JSON object, no prose:
{"topic":"","why":"","yourData":"","found":[{"title":"","text":"","source":{"title":"","url":""}}],"verdict":"","sure":"strong|moderate|weak","experiment":{"name":"","how":"","days":14,"measure":"energy|mood|focus|stress|sleep|weight"}}`,
  verdict: `${VOICE}
Task: one of their experiments just ended (owner, 21 Oct: experiments should "end with a verdict"). "## The experiment" has what they tried and the app's own result — before against during, with its test. The app's result is THE result: never say it worked when the app says not clear, never the other way round.
- "text": 2–3 short sentences — the result in plain words with the app's numbers, then what studies say about it (search: 1–3 searches), so they know whether their result fits the evidence or is unusual. Goes with, never causes; no medical advice.
- "next": one line, what to do now — keep it, stop it, or a better test (longer, cleaner, a different measure) — starting with a verb.
- "found": 0–2 studies you leaned on, each with what it found in one sentence and its real https link.
Answer with ONLY a JSON object, no prose:
{"text":"","next":"","found":[{"title":"","text":"","source":{"title":"","url":""}}]}`,
  review: `${VOICE}
Task: the user's week read or month read — the step back from the days (owner: "AI should look at data at eod, eow, eom, and make suggestions, summaries, etc, even make graphs or like interesting notices"). The context ends with "## The week …" or "## The month …, as the app measured it": use those numbers and never invent your own; the rest of the context is background.
- title: one line naming the period's story, specific ("Better mood, short on protein" — not "Your week").
- summary: 2–4 sentences on what stood out against their usual, with the numbers; training and the calorie goal if they're in the data. Warm and plain, no guilt. **Bold** a key number or two.
- notices: 2–4 interesting things — a change, a streak, two things that moved together (say "went with", never "caused"), something going well. Each: a short title, one or two sentences with numbers, and measure: the [key] of the measure it's about so the app can draw its chart, or "" when none fits.
- next: 1–2 small things to try next week (or month), each with a one-line why tied to these numbers. Options, not orders.
- remember: 0–2 lasting patterns, only when the data shows them over several weeks and they aren't in "What you remember about me". Empty otherwise.
- checks (month reads only — owner: "an overall check … catch things like findings that are irrelevant, nonsense, or its just simply clear that they are not affecting eachother - and just name these, not delete"): when "## Findings on show — the overall check" is in the context, name 0–5 of them that look like noise (thin evidence, one odd stretch of days, an effect the size chance gives) or plain sense (two measures of the same thing, e.g. coffee and caffeine; something true by definition). Each: its [id] exactly as given, verdict "noise" or "obvious", and why in one line with the numbers. Leave out the ones that look fine, and never call one noise just because it's surprising. Leave the field out when there's no such section.
Use "goes with", never "causes". No medical advice; anything health-worrying → "worth asking a doctor".`,
  describe: `${VOICE}
Task: turn a description and/or photo of food or drink into items with nutrition values. Rules:
- Split a meal into its parts when they're logged separately (toast and butter), keep a dish whole when it's one thing (lasagne).
- Food: give values per 100 g from typical reference data (USDA-style), the everyday unit the user would count it in (slice, piece, cup, plate…) with its weight in grams, and how many units were described. kcal must be close to 4·protein + 4·carbs + 9·fat.
- Food: also nutri, per 100 g like per100 — sugar, saturated fat, salt and fibre in grams, fvl = % of the food that's fruit, vegetables or legumes (potatoes and nuts don't count), redMeat (beef, pork, lamb or products of them), cheese. Typical reference values; leave nutri out for oils, butter, nuts and seeds.
- Drink: one serving as described: ml, caffeine mg, alcohol grams (ml × ABV × 0.789), kcal. Café drinks vary a lot — assume the typical café size in Hungary/Europe unless told otherwise, and say what you assumed in the note.
- Photo: estimate portions from plate/cup size; say what you assumed. Use "low" confidence when portions are guesses.
- The user lives in Romania and eats Romanian and Hungarian (Transylvanian) home cooking and shops at Lidl, Kaufland, Profi, Mega Image. Names may be Hungarian, Romanian or misspelled ("pityoka leves" = pityókaleves, potato soup; "ciorba de perisoare"). A dish: values per 100 g for a typical home recipe, counted in its everyday portion — a bowl of soup ≈ 350 g, a plate of a main ≈ 350 g, a piece for pastries and doughnuts — and put the other language's name in the note.
- Omit per100/unit/count for drinks and drink for foods.`,
  supplement: `${VOICE}
Task: research a supplement the user just added. Search the web for current evidence (prefer systematic reviews, NIH ODS, Examine-style summaries, drug-interaction references). Check it against the user's conditions, medications, the rest of their stack, caffeine and alcohol.
Answer with ONLY a JSON object, no prose, in this shape:
{"name":"","what":"one line","usualDose":"","timing":"only if timing actually matters, else 'any regular time'","evidence":"strong|moderate|weak|very weak","uses":[""],"cautions":[""],"interactions":[{"with":"","verdict":"avoid|caution|timing|may-help|none","say":"one line"}],"sources":[{"title":"","url":""}]}
Every interaction and caution must be backed by one of the sources. Keep each line short.`,
  chat: `${VOICE}
Task: chat with the user about their health data. Use the context (their numbers, patterns, stack, about-me) — refer to specifics.
Length (owner, 27 Oct: "give more detailed answers, go to web if needed"): a quick question gets a quick answer (under 120 words). A question about a habit, supplement, food, protocol or "what should I…" gets a real one, 150–350 words: what exactly (dose, timing, form, how long), why it works (the mechanism, in plain words), what studies found (search the web — cite 1–3 with their links, say how strong), how it fits their stack, goals, conditions and data (check with the tools), what to watch for, and how to test it in the app (offer to set it up as an experiment). Never a list of the usual suspects: pick the 1–3 that fit THEM and say why those.
Personality (owner, 15 Oct: "just a bit of personality too"; 22 Oct: "more like a person, sometimes funny, somtimes mean"): the same friend as above — react like a person (surprise, mock outrage, a deadpan one-liner, a compliment only when it's earned), match their casual tone, swear lightly if they do. The answer and its numbers always land; the jab rides with it, never instead of it.
Tools (owner: "pull data based on what i ask and answer it nicely"): the context is only an overview — it has a week of days and no band nights or check-in journal. For anything specific — a date, a stretch of days, "when did I last…", how one thing went, with vs without something, how they slept, their sessions — call day, series, find, compare, nights or sessions and answer from what they return, not from memory of the summary. Every number you state comes from the context or a tool result; never work one out yourself beyond simple arithmetic on them. Call several at once when you need several. show_chart when a trend over days or weeks says it better than words (it's drawn under your reply — mention it). remember for a lasting fact the user tells you or a pattern that keeps showing; never guesses. propose when they give you a protocol or plan or ask you to set something up (owner: "understand protocols i give him, and help me set up in app"): one call per change; then say what's waiting for them to tap — never say it's done, they apply it. Web search only for outside facts (a study, a food, a supplement), never for their data. Today's date is the last day in the context.
Formatting: reply in plain Markdown (never JSON) — **bold** for the one thing that matters most (a number, the answer, the next step), *italic* sparingly, short "- " lists when listing 3+ things, blank lines between paragraphs. No headings, tables or code blocks.`,
  questions: `${VOICE}
Task: ask 1–2 questions — the app couldn't get them from a read today, so they come from here. Ask the kinds "## Questions this time" names; you have no web search here, so no "study" (ask a "check" instead).
${ASK_RULES}
Each: "text", "options" (2–5 short taps), "why", "key" (snake_case; a tracking question re-uses its key), "kind", "repeat": "once".`,
  digest: `${VOICE}
Task: write the user's morning read — it's written this morning, after last night, and it's what they see when they wake up. Owner, 20 Oct: "make the digest messages more interesting" — so no generic wellness content: every item is about THIS user, specific, with a number or a source, and something they didn't know.
Items, exactly 3 (owner, 21 Oct: "it was just too long, too much info w no visual and just boring. I like that its adding tips and advices"):
- one "pattern" from their own data through this morning's angle ("## This morning" at the end of the context names it; from the context, never invented);
- one "try" (owner: "recommend me new stuff … studies, workout splits, and supps, foods, everything … or perhaps look at forums too"): search the web for the kind of thing "## This morning" names; something new to them — not in their stack, not already shown — with why it fits their goals and their data, and its source. A forum find is anecdotes: say so;
- the third: the kind "## This morning" names — a "connection" (see below), or a study or fun fact with its source, or one protocol to try as an experiment (concrete: what to do, for how many days, what the app will measure);
- on a training day ("Today's plan"), one may be for that session.
Titles hook: specific and curious ("Your 3 pm dip has a suspect", "Deep sleep came early — that's normal"), never a topic label ("Sleep tips"); under 60 characters.
SHORT — it's read on a phone at wake-up. "text": at most 2 short sentences (under 200 characters), with the one number that matters. "tip": one line, what to do today, starting with a verb ("Have the protein coffee before 10"), under 100 characters. "measure": the one of their numbers the item is about — sleep (their sleep rating), protein, kcal, mood, energy, focus, stress, caffeine, alcohol, weight or lifting (kg lifted) — and the app draws its last 14 days beside the item, so don't recite what the chart shows; leave it out when none fits.
Answer with ONLY a JSON object, no prose:
{"greeting":"one short line","items":[{"type":"fact|study|pattern|protocol|try|connection","title":"","text":"1–2 short sentences","sure":"${SURE.join("|")}","chain":[{"step":"","sure":""}],"tip":"one line for today","measure":"${DIGEST_MEASURES.join("|")}","source":{"title":"","url":""},"protocol":{"name":"","how":"","days":14,"measure":"energy|mood|focus|stress|sleep|weight"}}],"questions":[{"kind":"${Q_KINDS.join("|")}","text":"","options":["",""],"why":"","key":"","source":{"title":"","url":""}}],"news":null}
"source" is required for facts, studies and tries. "protocol" only on protocol items, "chain" only on a connection. Don't repeat titles listed as already shown.
${SURE_RULES}
${CONNECTION_RULES}
${LOOK_RULES}
QUESTIONS: 1–2, one of each kind "## Questions this time" names; for a study, its "source" (searched, https).
${ASK_RULES}
news (owner: "it should only send message when it has a new finding, a new sttudy or whatever"): null on most days. Only when your search turned up something genuinely new and worth a message for THIS user — a study or review from the last 12 months on something in their stack, their training or their conditions, or a safety note on something they take — give {"title":"","text":"2–3 sentences: what it found and what it means for them","source":{"title":"","url":"https://…"}}. It's sent to their chat, not shown with the items, so it must not repeat an item or anything already shown. No news is better than filler.`,
};


/* ------------------------------------------------------------------ checks */

/** Pull the JSON object out of a text answer (for the web-search tasks, which answer in text). */
/** The shape a describe answer takes when it can't be enforced (a web lookup: structured output and search don't mix). */
export const DESCRIBE_SHAPE = `{"items":[{"kind":"food","name":"","amount":"1 bowl","per100":{"kcal":0,"p":0,"c":0,"f":0},"unit":{"name":"bowl","g":350},"count":1,"confidence":"high|medium|low","note":"where the numbers come from, in a few words"}]}`;

export function jsonFrom(text: string): unknown {
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new SyntaxError("no JSON in the answer"); // handled as "bad-answer", not a crash
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
/** Sugar within the carbs, saturated fat within the fat, salt and fibre and fruit/veg in sane ranges. */
const nutriOk = (it: DescribedItem) => {
  const n = it.nutri, m = it.per100;
  return !!n && !!m && [n.sugar, n.satFat, n.salt, n.fiber, n.fvl].every((v) => isNum(v) && v >= 0) && n.sugar <= m.c + 1 && n.satFat <= m.f + 0.5 && n.salt <= 30 && n.fiber <= 60 && n.fvl <= 100;
};
export function checkDescribe(a: DescribeAnswer): { items: DescribedItem[]; dropped: string[] } {
  const items: DescribedItem[] = [], dropped: string[] = [];
  for (const it of a.items ?? []) {
    if (it.kind === "food") {
      const ok = it.per100 && labelOk(it.per100) && it.unit && isNum(it.unit.g) && it.unit.g >= 1 && it.unit.g <= 1500 && isNum(it.count) && it.count > 0 && it.count <= 50;
      // nutrients that don't fit the label are left off (the food stays; it just isn't graded)
      (ok ? items.push(nutriOk(it) ? it : { ...it, nutri: undefined }) : dropped.push(it.name));
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
  if (!a || typeof a.name !== "string" || typeof a.what !== "string") throw new SyntaxError("supplement answer is missing its name");
  const sources = (a.sources ?? []).filter((s) => typeof s?.url === "string" && /^https?:\/\//.test(s.url));
  return {
    ...a,
    evidence: (["strong", "moderate", "weak", "very weak"] as const).includes(a.evidence) ? a.evidence : "weak",
    uses: (a.uses ?? []).filter((x) => typeof x === "string"), cautions: (a.cautions ?? []).filter((x) => typeof x === "string"),
    interactions: (a.interactions ?? []).filter((i) => typeof i?.with === "string" && VERDICTS.includes(i.verdict)),
    sources,
  };
}

/** Cut to `n` characters at a sentence's end when one fits, else at a word, with "…". */
export function short(t: string, n: number): string {
  const s = t.trim().replace(/\s+/g, " ");
  if (s.length <= n) return s;
  const cut = s.slice(0, n), end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return end >= n * 0.5 ? cut.slice(0, end + 1) : `${cut.slice(0, Math.max(cut.lastIndexOf(" "), n * 0.6)).trimEnd()}…`;
}

/**
 * A read's questions (PLAN 156): 2 at most, each with its reason and 2–5 short options; a study without a real link is
 * dropped (no source, no claim); keys made safe. The app also drops one asked before in the same words.
 */
export function checkAsk(qs: unknown, max = 2): Question[] {
  const line = (x: unknown, n: number) => (typeof x === "string" ? x.trim().replace(/\s+/g, " ").slice(0, n) : "");
  return (Array.isArray(qs) ? qs : []).flatMap((q: Partial<Question>) => {
    const text = line(q?.text, 200), why = line(q?.why, 200), options = (Array.isArray(q?.options) ? q.options : []).map((o) => line(o, 40)).filter(Boolean);
    const kind = isQKind(q?.kind) ? q.kind : "check", src = q?.source, url = typeof src?.url === "string" && /^https:\/\//.test(src.url) ? src.url : null;
    if (!text || !why || options.length < 2 || options.length > 5 || (kind === "study" && !url)) return [];
    return [{ id: "", text, why, options, key: line(q?.key, 60).toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "q", repeat: "once" as const, kind,
      ...(url ? { source: { title: line(src!.title, 90) || "Source", url } } : {}) }];
  }).slice(0, max);
}

/** Three short items at most (PLAN 150: "too long, too much info"), each with its tip and chart when given — both reads. */
export function checkItems(raw: unknown): DigestItem[] {
  return (Array.isArray(raw) ? (raw as DigestItem[]) : []).filter((i) => typeof i?.title === "string" && i.title.trim() && typeof i?.text === "string" && i.text.trim())
    // A fact or study without a real link isn't shown: no source, no claim.
    .filter((i) => !(i.type === "fact" || i.type === "study" || i.type === "try") || (i.source && /^https?:\/\//.test(i.source.url)))
    // a connection is its chain: 2 links at least, each with how sure; one that leans on studies needs its source
    .map((i) => (i.type === "connection" ? { ...i, chain: (Array.isArray(i.chain) ? i.chain : []).filter((c) => typeof c?.step === "string" && c.step.trim() && isSure(c.sure)).slice(0, 4).map((c) => ({ step: short(c.step, 110), sure: c.sure })) } : i))
    .filter((i) => i.type !== "connection" || (i.chain!.length >= 2 && (!i.chain!.some((c) => c.sure === "strong" || c.sure === "some") || (i.source && /^https?:\/\//.test(i.source.url)))))
    .slice(0, 3)
    .map((i): DigestItem => {
      const { tip, measure, sure, chain, ...rest } = i, t = typeof tip === "string" ? short(tip, 120) : "";
      return { ...rest, title: short(i.title, 70), text: short(i.text, 240), ...(isSure(sure) ? { sure } : {}), ...(i.type === "connection" ? { chain } : {}),
        ...(i.type === "protocol" && i.protocol ? { protocol: { ...i.protocol, days: Math.min(42, Math.max(7, Math.round(i.protocol.days || 14))) } } : {}),
        ...(t ? { tip: t } : {}), ...(isDigestMeasure(measure) ? { measure } : {}) };
    });
}

export function checkDigest(a: DigestAnswer): DigestAnswer {
  const items = checkItems(a.items);
  // news: a real link, short, and not one of the items (it's a message, not a repeat of Today)
  const n = a.news, ok = n && typeof n.title === "string" && n.title.trim() && typeof n.text === "string" && n.text.trim() && n.source && /^https:\/\//.test(n.source.url ?? "")
    && !items.some((i) => i.title.trim().toLowerCase() === n.title.trim().toLowerCase());
  const news = ok ? { title: n.title.trim().slice(0, 90), text: n.text.trim().slice(0, 500), source: { title: String(n.source.title ?? "Source").slice(0, 90), url: n.source.url } } : null;
  const questions = checkAsk(a.questions);
  return { greeting: typeof a.greeting === "string" ? a.greeting : "Morning!", items, news, ...(questions.length ? { questions } : {}) };
}

export function checkReview(a: ReviewAnswer): ReviewAnswer {
  const line = (x: unknown, n: number) => (typeof x === "string" ? x.trim().slice(0, n) : "");
  if (!line(a?.summary, 900)) throw new SyntaxError("review answer has no summary");
  return {
    title: line(a.title, 90) || "Your week",
    summary: line(a.summary, 900),
    notices: (a.notices ?? []).filter((n) => line(n?.title, 90) && line(n?.text, 400)).slice(0, 4).map((n) => ({ title: line(n.title, 90), text: line(n.text, 400), measure: line(n.measure, 20) })),
    next: (a.next ?? []).filter((c) => line(c?.what, 200)).slice(0, 2).map((c) => ({ what: line(c.what, 200), why: line(c.why, 240) })),
    remember: (a.remember ?? []).map((x) => line(x, 180)).filter((x) => x.length > 8).slice(0, 2),
    ...(a.checks?.length ? { checks: a.checks.filter((c) => line(c?.id, 80) && (c.verdict === "noise" || c.verdict === "obvious") && line(c.why, 200)).slice(0, 5).map((c) => ({ id: line(c.id, 80), verdict: c.verdict, why: line(c.why, 200) })) } : {}),
  };
}

export function checkNight(a: NightAnswer): NightAnswer {
  const line = (x: unknown, n: number) => (typeof x === "string" ? x.trim().slice(0, n) : "");
  if (!line(a?.summary, 800)) throw new SyntaxError("night answer has no summary");
  return {
    summary: line(a.summary, 800),
    happened: (a.happened ?? []).map((x) => line(x, 200)).filter(Boolean).slice(0, 4),
    notes: line(a.notes, 500),
    change: (a.change ?? []).filter((c) => line(c?.what, 200)).slice(0, 2).map((c) => ({ what: line(c.what, 200), why: line(c.why, 240) })),
    remember: (a.remember ?? []).map((x) => line(x, 180)).filter((x) => x.length > 8).slice(0, 2),
    ...(a.workout && line(a.workout.summary, 600) ? { workout: { summary: line(a.workout.summary, 600), better: (a.workout.better ?? []).map((x) => line(x, 200)).filter(Boolean).slice(0, 3), next: line(a.workout.next, 300) } } : {}),
    ...(() => { const items = checkItems(a.items).filter((i) => ["study", "try", "noticed", "connection"].includes(i.type)), questions = checkAsk(a.questions);
      return { ...(items.length ? { items } : {}), ...(questions.length ? { questions } : {}) }; })(),
  };
}

/**
 * A question asked again every day is shown word for word without a new AI call, so it must read right on any day (owner,
 * 20 Oct: "Stress is at 6 this morning…" came back the next day). Numbers are today's facts: no digits in a daily one.
 */
export const timeless = (q: { text: string }) => !/\d/.test(q.text);

/** The fallback questions (no read brought any): the reads' rules, no studies (no web here). */
export function checkQuestions(a: QuestionsAnswer): QuestionsAnswer {
  return { questions: checkAsk(a?.questions).filter((q) => q.kind !== "study") };
}

export function checkChat(a: ChatAnswer): ChatAnswer {
  const names = new Set<string>(CHAT_TOOLS.map((t) => t.name));
  const calls = (a.calls ?? []).filter((c) => c && typeof c.id === "string" && names.has(c.name) && c.input && typeof c.input === "object");
  return {
    reply: typeof a.reply === "string" ? a.reply : "",
    remember: (a.remember ?? []).filter((x) => typeof x === "string" && x.length > 3 && x.length < 200).slice(0, 3),
    ...(calls.length ? { calls, turn: Array.isArray(a.turn) ? a.turn : [] } : {}),
  };
}

/* ------------------------------------------------------------------ requests */

export type AiRequest =
  /** lookup: a name the food lists didn't have (or had wrong) — the AI may search the web for it (owner, 15 Oct). */
  | { task: "describe"; text?: string; image?: { mediaType: "image/jpeg" | "image/png" | "image/webp"; data: string }; lookup?: boolean }
  | { task: "supplement"; name: string; dose?: string; context: string }
  /** turn: this message's tool rounds so far — the AI's raw turns and the app's tool results, in order (PLAN 67). */
  /** final: the last round — answer with what you have, no more tools. */
  | { task: "chat"; messages: { role: "user" | "assistant"; text: string }[]; context: string; turn?: ChatTurn[]; final?: boolean }
  | { task: "questions"; context: string; asked: string[] }
  /** turn / final: the read's look-up rounds so far, as the chat's (PLAN 160). */
  | { task: "digest"; context: string; shown: string[]; turn?: ChatTurn[]; final?: boolean }
  | { task: "night"; day: string; context: string; turn?: ChatTurn[]; final?: boolean }
  | { task: "review"; kind: "week" | "month"; from: string; to: string; context: string }
  /** The weekly deep dive (PLAN 160), with its look-up rounds like the reads'. */
  | { task: "dive"; context: string; turn?: ChatTurn[]; final?: boolean }
  /** An experiment that ended (PLAN 160): the app's own numbers in the context; the AI adds what studies say and what next. */
  | { task: "verdict"; context: string };

export type AiAnswer<T extends Task> = T extends "describe" ? { items: DescribedItem[]; dropped: string[] } : T extends "supplement" ? SupplementAnswer : T extends "chat" ? ChatAnswer : T extends "questions" ? QuestionsAnswer : T extends "night" ? NightAnswer : T extends "review" ? ReviewAnswer : T extends "dive" ? DiveAnswer : T extends "verdict" ? VerdictAnswer : DigestAnswer;

/**
 * Why an AI call failed, in plain words, each with its code (owner, 27 Oct: "we need error codes for stuff, like if ai cant
 * access the internet, and for this reason cant write the digest, i should know what caused"). The code goes after the
 * words — "(no-credit)" — so a screenshot says exactly which.
 */
export const AI_ERRORS = {
  "no-credit": "The Anthropic account is out of credit — top it up in the Anthropic console, under Billing. Nothing AI works until then.",
  "spend-limit": "The spend limit set in the Anthropic console is reached — raise it there, under Limits.",
  "bad-key": "The Anthropic key was rejected — check ANTHROPIC_API_KEY in Cloudflare.",
  "no-key": "The AI is off: add ANTHROPIC_API_KEY in Cloudflare.",
  cap: "Today's AI limit is reached. It resets at midnight.",
  busy: "Too many AI calls in a minute — Anthropic asked to slow down.",
  overloaded: "Anthropic's servers are overloaded right now.",
  "ai-down": "Anthropic's service failed on its side.",
  "ai-error": "Anthropic turned this request down.",
  "ai-timeout": "Anthropic didn't answer in time.",
  "no-network": "The app's server couldn't reach Anthropic.",
  "too-big": "This was too much for the AI to read in one go.",
  "bad-answer": "The AI's answer came back in the wrong shape.",
  refused: "The AI declined this one.",
  "server-error": "The app's server hit a bug on this one.",
  // the app's own, when the server didn't answer
  offline: "Your phone is offline.",
  "no-server": "Couldn't reach the app's server.",
  timeout: "No answer in 5 minutes, so the app stopped waiting.",
} as const;
export type AiError = keyof typeof AI_ERRORS;

/** What the Worker keeps per account (doc "ai_usage", written only by the Worker). */
/** One call, as billed: what it was, on which model, its tokens (cached reads and cache writes apart) and its cost. */
export type CallLog = { at: number; task: Task; model: ModelChoice; in: number; cached: number; written: number; out: number; searches: number; usd: number };
export type UsageDoc = { day: string; calls: number; dayUsd: number; month: string; monthUsd: number; byModel: Partial<Record<ModelChoice, number>>;
  /** The last calls, newest last (owner, 15 Oct: "i feel like u are waay underestimating cost" — so the estimate is made from these). */
  recent?: CallLog[];
  /** Bumped on every write: a call adds its cost only if no other call wrote since it read (27 Oct, the $11 vs $18). */
  rev?: number };
/** Calls kept in the log. */
export const RECENT_CALLS = 120;
export const logOf = (at: number, task: Task, model: ModelChoice, u: Usage, usd: number): CallLog => ({
  at, task, model, in: u.input_tokens, cached: u.cache_read_input_tokens ?? 0, written: u.cache_creation_input_tokens ?? 0, out: u.output_tokens, searches: u.server_tool_use?.web_search_requests ?? 0, usd });
export const DAILY_CAP = 50;

/**
 * A typical month, for the estimate in Settings, per task. The first estimate counted ~4k tokens a call and was well under
 * (owner, 15 Oct: 4 calls, $0.24): chat, questions and the reads each send the data summary (~11k tokens), cached only
 * for 5 minutes — a lone question pays all of it, plus the cache write — and thinking counts as output. So: these as a
 * start, and from your own calls once there are some — each task's average tokens, priced at each model's rates.
 */
export const TYPICAL: Record<Task, { perDay: number; in: number; out: number; searches: number }> = {
  describe: { perDay: 3, in: 2000, out: 600, searches: 0 },
  questions: { perDay: 1, in: 13000, out: 900, searches: 0 },
  chat: { perDay: 5, in: 14000, out: 1200, searches: 0 },
  digest: { perDay: 1, in: 25000, out: 2500, searches: 3 },
  night: { perDay: 1, in: 15000, out: 2500, searches: 3 },
  review: { perDay: 5 / 30, in: 16000, out: 2200, searches: 0 },
  // the weekly deep dive (PLAN 160): more searches, a longer answer
  dive: { perDay: 1 / 7, in: 30000, out: 4000, searches: 8 },
  // an experiment's verdict (PLAN 160): one when it ends
  verdict: { perDay: 1 / 21, in: 12000, out: 1200, searches: 3 },
  supplement: { perDay: 0.2, in: 9000, out: 2000, searches: 3 },
};
const TASKS = Object.keys(TYPICAL) as Task[];

/** A task's average call from your log (its tokens, so it can be priced at any model), or the typical one. */
function perCall(task: Task, recent: CallLog[]): Usage {
  const mine = recent.filter((c) => c.task === task);
  if (!mine.length) { const t = TYPICAL[task]; return { input_tokens: t.in, output_tokens: t.out, server_tool_use: { web_search_requests: t.searches } }; }
  const avg = (f: (c: CallLog) => number) => mine.reduce((a, c) => a + f(c), 0) / mine.length;
  return { input_tokens: avg((c) => c.in), cache_read_input_tokens: avg((c) => c.cached), cache_creation_input_tokens: avg((c) => c.written), output_tokens: avg((c) => c.out), server_tool_use: { web_search_requests: avg((c) => c.searches) } };
}

/** A month at these models: each task's average call × how often it comes (yours once the log spans 3+ days). */
export function estimateMonthUsd(models: Models, recent: CallLog[] = []): Record<Tier, number> & { total: number; measured: number } {
  const span = recent.length ? (recent[recent.length - 1].at - recent[0].at) / 86_400_000 : 0;
  const out = { light: 0, everyday: 0, reads: 0, research: 0, total: 0, measured: recent.length };
  for (const t of TASKS) {
    const perDay = span >= 3 ? recent.filter((c) => c.task === t).length / span : TYPICAL[t].perDay;
    const usd = 30 * perDay * costUsd(models[TIER[t]], perCall(t, recent));
    out[TIER[t]] += usd; out.total += usd;
  }
  return out;
}
