/**
 * Shared bits for the browser suites: Playwright, the app URL, where screenshots go, and a fake
 * Supabase (auth + the two tables, rows private per user like RLS) served by request interception,
 * so the suites run with no network and no real accounts. Run all suites: `bun run e2e`.
 */
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const APP = process.env.APP_URL || 'http://localhost:4321/';
const OUT = process.env.E2E_OUT || path.join(__dirname, 'out') + path.sep;
require('node:fs').mkdirSync(OUT, { recursive: true });
// ---- fake Supabase: auth + two tables, rows private per user (like RLS) ----
const users = { 'lukacsarnold9+healthtest@gmail.com': 'u-test', 'lukacsarnold9@gmail.com': 'u-me' };
const tables = { entries: new Map(), docs: new Map() };
let clock = 0; const stamp = () => new Date(Date.UTC(2026, 8, 29, 12, 0, 0) + (++clock)).toISOString();
const uidOf = (req) => { const t = (req.headers()['authorization'] || '').replace('Bearer ', ''); return t.startsWith('tok-') ? t.slice(4) : null; };
async function handle(route) {
  const req = route.request(), url = new URL(req.url()), p = url.pathname, m = req.method();
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
  const json = (status, body) => route.fulfill({ status, contentType: 'application/json', headers: cors, body: body == null ? '' : JSON.stringify(body) });
  if (m === 'OPTIONS') return route.fulfill({ status: 200, headers: cors });
  if (p === '/auth/v1/token') {
    const b = req.postDataJSON();
    // Token refresh (the app's clock may be moved ahead in a test): hand out a fresh token.
    const refreshed = url.searchParams.get('grant_type') === 'refresh_token' && b.refresh_token?.startsWith('r-') ? b.refresh_token.slice(2) : null;
    if (refreshed) { const email = Object.keys(users).find((k) => users[k] === refreshed); return json(200, { access_token: 'tok-' + refreshed, token_type: 'bearer', expires_in: 3600 * 24 * 365, expires_at: Math.floor(Date.now() / 1000) + 3600 * 24 * 365, refresh_token: 'r-' + refreshed, user: { id: refreshed, email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-09-29T00:00:00Z' } }); }
    const id = users[b.email];
    if (!id || b.password !== 'secret123') return json(400, { error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials', code: 'invalid_credentials' });
    return json(200, { access_token: 'tok-' + id, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r-' + id, user: { id, email: b.email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-09-29T00:00:00Z' } });
  }
  if (p === '/auth/v1/user') { const id = uidOf(req); const email = Object.keys(users).find(k => users[k] === id); return json(200, { id, email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} }); }
  if (p === '/auth/v1/logout') return route.fulfill({ status: 204, headers: cors });
  const tm = p.match(/^\/rest\/v1\/(entries|docs)$/);
  if (tm) {
    const t = tables[tm[1]], uid = uidOf(req); if (!uid) return json(401, { message: 'no auth' });
    const keyCols = tm[1] === 'entries' ? ['user_id', 'id'] : ['user_id', 'key'];
    if (m === 'POST') { for (const r of req.postDataJSON()) { if (r.user_id !== uid) return json(403, { message: 'RLS violation' }); t.set(keyCols.map(k => r[k]).join('|'), { ...r, updated_at: stamp() }); } return json(201, null); }
    let rows = [...t.values()].filter(r => r.user_id === uid);
    for (const [k, v] of url.searchParams) { if (v.startsWith('gt.')) rows = rows.filter(r => r[k] > v.slice(3)); if (v.startsWith('eq.')) rows = rows.filter(r => String(r[k]) === v.slice(3)); if (v.startsWith('not.in.(')) { const l = v.slice(8, -1).split(','); rows = rows.filter(r => !l.includes(String(r[k]))); } }
    if (m === 'DELETE') { for (const r of rows) t.delete(keyCols.map(k => r[k]).join('|')); return json(204, null); }
    rows.sort((a, b) => a.updated_at < b.updated_at ? -1 : 1);
    const off = +(url.searchParams.get('offset') || 0), lim = +(url.searchParams.get('limit') || 1e9);
    return json(200, rows.slice(off, off + lim));
  }
  return json(404, { message: 'fake: ' + m + ' ' + p });
}

module.exports = { chromium, APP, OUT, handle, users, tables };
