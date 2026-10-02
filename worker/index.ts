/**
 * The HealthOS Cloudflare Worker. Serves the app's static files, plus one API route:
 *
 *   GET /api/food?q=zabpehely  →  { foods: Food[], sources: { off, usda } }
 *   GET /api/food?barcode=5449000014535  →  { status: "found", scanned } | { status: "missing" | "error" }
 *   POST /api/ai, GET /api/ai/usage  →  the in-app AI (worker/ai.ts)
 *
 * Searching server-side means one call from the phone, no browser cross-site limits, and a
 * 1-day cache so repeat searches are instant. Set a free USDA key with
 * `npx wrangler secret put USDA_KEY` (from https://fdc.nal.usda.gov/api-key-signup); without one it
 * uses USDA's shared DEMO_KEY, which is rate-limited but works.
 */

import { searchAll } from "../src/lib/foodsearch";
import { lookupBarcode, normalizeGtin } from "../src/lib/barcode";
import { handleAi, whoIs, type AiEnv } from "./ai";
import { PushHub } from "./push";

/** The Durable Object class must be exported from the Worker's entry point. */
export { PushHub };

type DOStub = { fetch: (r: Request) => Promise<Response> };
type Env = AiEnv & { ASSETS: { fetch: (r: Request) => Promise<Response> }; USDA_KEY?: string; PUSH?: { idFromName: (n: string) => unknown; get: (id: unknown) => DOStub } };
type Ctx = { waitUntil: (p: Promise<unknown>) => void };
declare const caches: { default: { match: (r: Request) => Promise<Response | undefined>; put: (r: Request, res: Response) => Promise<void> } } | undefined;

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...extra } });

export async function handleFood(req: Request, env: Env, ctx?: Ctx): Promise<Response> {
  const params = new URL(req.url).searchParams;
  if (params.has("barcode")) return handleBarcode(params.get("barcode") ?? "", ctx);
  const q = (params.get("q") ?? "").trim();
  if (q.length < 2) return json({ foods: [], sources: { off: "ok", usda: "ok" } });
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const key = new Request(`https://cache.healthos/food/v3?q=${encodeURIComponent(q.toLowerCase())}`);
  const hit = await cache?.match(key);
  if (hit) return hit;
  const result = await searchAll(q, env.USDA_KEY);
  const res = json(result, 200, { "cache-control": "public, max-age=86400" });
  // Only cache complete answers, so a hiccup upstream isn't remembered for a day.
  if (cache && result.sources.off === "ok" && result.sources.usda === "ok") ctx?.waitUntil(cache.put(key, res.clone()));
  return res;
}

/** A product by its barcode. Found answers are cached a day; misses an hour (someone may add it). */
async function handleBarcode(raw: string, ctx?: Ctx): Promise<Response> {
  const code = normalizeGtin(raw);
  if (!code) return json({ status: "missing", reason: "not a valid barcode" }, 400);
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const key = new Request(`https://cache.healthos/barcode/v1/${code}`);
  const hit = await cache?.match(key);
  if (hit) return hit;
  const result = await lookupBarcode(code);
  const res = json(result, 200, { "cache-control": `public, max-age=${result.status === "found" ? 86400 : 3600}` });
  if (cache && result.status !== "error") ctx?.waitUntil(cache.put(key, res.clone()));
  return res;
}

/**
 * /api/push/{key,subscribe,unsubscribe,schedule,test,status} — signed in only, each account its own
 * Durable Object (worker/push.ts).
 */
export async function handlePush(req: Request, env: Env, f: typeof fetch = fetch): Promise<Response> {
  if (!env.PUSH) return json({ error: "notifications aren't set up on this server" }, 503);
  const op = new URL(req.url).pathname.replace(/^\/api\/push\/?/, "");
  if (!["key", "subscribe", "unsubscribe", "schedule", "test", "status"].includes(op)) return json({ error: "not found" }, 404);
  // Wrapped: Workers throw "Illegal invocation" if the global fetch is called as another object's method.
  const user = await whoIs(req, env, { fetch: (u, i) => f(u, i), now: Date.now });
  if (!user) return json({ error: "sign in first" }, 401);
  const stub = env.PUSH.get(env.PUSH.idFromName(user.id));
  return stub.fetch(new Request(`https://push/${op}`, { method: req.method, headers: { "content-type": "application/json" }, body: req.method === "POST" ? await req.text() : undefined }));
}

export default {
  async fetch(req: Request, env: Env, ctx: Ctx): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/api/food") return handleFood(req, env, ctx);
    if (url.pathname === "/api/ai" || url.pathname === "/api/ai/usage") return handleAi(req, env);
    if (url.pathname.startsWith("/api/push/")) return handlePush(req, env);
    if (url.pathname.startsWith("/api/")) return json({ error: "not found" }, 404);
    return env.ASSETS.fetch(req);
  },
};
