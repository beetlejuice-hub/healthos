/**
 * The HealthOS Cloudflare Worker. Serves the app's static files, plus one API route:
 *
 *   GET /api/food?q=zabpehely  →  { foods: Food[], sources: { off, usda } }
 *
 * Searching server-side means one call from the phone, no browser cross-site limits, and a
 * 1-day cache so repeat searches are instant. Set a free USDA key with
 * `npx wrangler secret put USDA_KEY` (from https://fdc.nal.usda.gov/api-key-signup); without one it
 * uses USDA's shared DEMO_KEY, which is rate-limited but works.
 */

import { searchAll } from "../src/lib/foodsearch";

type Env = { ASSETS: { fetch: (r: Request) => Promise<Response> }; USDA_KEY?: string };
type Ctx = { waitUntil: (p: Promise<unknown>) => void };
declare const caches: { default: { match: (r: Request) => Promise<Response | undefined>; put: (r: Request, res: Response) => Promise<void> } } | undefined;

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...extra } });

export async function handleFood(req: Request, env: Env, ctx?: Ctx): Promise<Response> {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) return json({ foods: [], sources: { off: "ok", usda: "ok" } });
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const key = new Request(`https://cache.healthos/food/v2?q=${encodeURIComponent(q.toLowerCase())}`);
  const hit = await cache?.match(key);
  if (hit) return hit;
  const result = await searchAll(q, env.USDA_KEY);
  const res = json(result, 200, { "cache-control": "public, max-age=86400" });
  // Only cache complete answers, so a hiccup upstream isn't remembered for a day.
  if (cache && result.sources.off === "ok" && result.sources.usda === "ok") ctx?.waitUntil(cache.put(key, res.clone()));
  return res;
}

export default {
  async fetch(req: Request, env: Env, ctx: Ctx): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/api/food") return handleFood(req, env, ctx);
    if (url.pathname.startsWith("/api/")) return json({ error: "not found" }, 404);
    return env.ASSETS.fetch(req);
  },
};
