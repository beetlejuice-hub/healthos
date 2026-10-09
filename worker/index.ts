/**
 * The HealthOS Cloudflare Worker. Serves the app's static files, plus one API route:
 *
 *   GET /api/food?q=zabpehely  →  { foods: Food[], sources: { off, usda } }
 *   GET /api/food?barcode=5449000014535  →  { status: "found", scanned } | { status: "missing" | "error" }
 *   POST /api/ai, GET /api/ai/usage  →  the in-app AI (worker/ai.ts)
 *   /api/band/*, GET /api/google/callback  →  the Fitbit band via Google (worker/band.ts)
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
import { BandHub, type BandEnv } from "./band";
import { authUrl, readState, signState } from "../src/lib/band";

/** The Durable Object classes must be exported from the Worker's entry point. */
export { PushHub, BandHub };

type DOStub = { fetch: (r: Request) => Promise<Response> };
type DONamespace = { idFromName: (n: string) => unknown; get: (id: unknown) => DOStub };
type Env = AiEnv & BandEnv & { ASSETS: { fetch: (r: Request) => Promise<Response> }; USDA_KEY?: string; PUSH?: DONamespace; BAND?: DONamespace };
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

/**
 * The Fitbit band (PLAN 48), through Google. Signed in only, each account its own BandHub:
 *   POST /api/band/start → { url }: Google's "allow HealthOS to read…" page; the state names you, signed.
 *   GET /api/google/callback?code&state → Google sends you back here; keeps the sign-in, back to Settings.
 *   GET /api/band/status, GET /api/band/data?from&to, POST /api/band/sync, POST /api/band/disconnect.
 */
/** Constant-time string compare, so the key can't be guessed a character at a time. */
function sameKey(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function handleBand(req: Request, env: Env, f: typeof fetch = fetch): Promise<Response> {
  const url = new URL(req.url);
  if (!env.BAND || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return json({ error: "the band isn't set up on this server" }, 503);
  const hub = (id: string) => env.BAND!.get(env.BAND!.idFromName(id));
  const redirect = `${url.origin}/api/google/callback`;
  if (url.pathname === "/api/google/callback") {
    const back = (ok: boolean, why = "") => Response.redirect(`${url.origin}/#settings/band-${ok ? "ok" : "failed"}${why ? `?why=${encodeURIComponent(why)}` : ""}`, 302);
    const user = await readState(url.searchParams.get("state") ?? "", env.GOOGLE_CLIENT_SECRET);
    if (!user) return back(false, "the link expired — try again");
    const code = url.searchParams.get("code");
    if (!code) return back(false, url.searchParams.get("error") === "access_denied" ? "you said no on Google's page" : "Google didn't say yes");
    const r = await hub(user).fetch(new Request("https://band/connect", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code, redirect }) }));
    return r.ok ? back(true) : back(false, ((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Google refused");
  }
  const op = url.pathname.replace(/^\/api\/band\/?/, "");
  if (!["start", "status", "data", "sync", "disconnect", "wake"].includes(op)) return json({ error: "not found" }, 404);
  /**
   * **Tempo asks for last night's wake time (PLAN 56).** Not a signed-in person — Tempo's server,
   * holding the key both apps share. It reads only the owner's band, and only the wake time.
   */
  if (op === "wake") {
    if (!env.TEMPO_KEY || !sameKey(req.headers.get("authorization") ?? "", `Bearer ${env.TEMPO_KEY}`)) return json({ error: "wrong key" }, 401);
    const owner = env.BAND_OWNER || ((await (await hub("_owner").fetch(new Request("https://band/owner"))).json()) as { id: string | null }).id;
    if (!owner) return json({ wokeAt: null });
    return hub(owner).fetch(new Request(`https://band/wake${url.search}`));
  }
  const user = await whoIs(req, env, { fetch: (u, i) => f(u, i), now: Date.now });
  if (!user) return json({ error: "sign in first" }, 401);
  if (op === "start") return json({ url: authUrl(env.GOOGLE_CLIENT_ID, await signState(user.id, env.GOOGLE_CLIENT_SECRET), redirect) });
  if (op === "sync") {
    const r = await hub(user.id).fetch(new Request("https://band/sync", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }));
    // A connected band names its owner for Tempo (first one wins; BAND_OWNER overrides).
    const s = (await r.clone().json().catch(() => ({}))) as { connected?: boolean };
    if (s.connected) await hub("_owner").fetch(new Request("https://band/owner", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: user.id }) }));
    return r;
  }
  return hub(user.id).fetch(new Request(`https://band/${op}${url.search}`, { method: req.method === "POST" ? "POST" : "GET", headers: { "content-type": "application/json" }, body: req.method === "POST" ? "{}" : undefined }));
}

/**
 * /now — the "How now?" check-in on its own. The same app page, but announcing itself as "How now?"
 * (title, icon, manifest), so "Add to Home Screen" from here makes a separate one-tap icon.
 */
export function nowPage(html: string): string {
  return html
    .replace('<title>HealthOS</title>', '<title>How now?</title>')
    .replace('href="/manifest.webmanifest"', 'href="/now.webmanifest"')
    .replace('href="/icon-180.png"', 'href="/now-180.png"')
    .replace('content="HealthOS" />', 'content="How now?" />');
}

export default {
  async fetch(req: Request, env: Env, ctx: Ctx): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/api/food") return handleFood(req, env, ctx);
    if (url.pathname === "/api/ai" || url.pathname === "/api/ai/usage") return handleAi(req, env);
    if (url.pathname.startsWith("/api/push/")) return handlePush(req, env);
    if (url.pathname.startsWith("/api/band/") || url.pathname === "/api/google/callback") return handleBand(req, env);
    if (url.pathname === "/now" || url.pathname === "/now/") {
      const page = await env.ASSETS.fetch(new Request(new URL("/", req.url)));
      return new Response(nowPage(await page.text()), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" } });
    }
    if (url.pathname.startsWith("/api/")) return json({ error: "not found" }, 404);
    return env.ASSETS.fetch(req);
  },
};
