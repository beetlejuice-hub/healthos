// Workout → heart rate (PLAN 68; owner, 13 Oct: "wearable is connected but it says connect wearable"). A session running
// for 20 minutes: with the band connected and its minutes in, the tile shows them (latest, average, peak), never "connect";
// readings that stop 15 minutes ago say how old they are; with no band it asks to connect it.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

const MIN = 60_000, NOW = new Date('2026-10-13T18:20:00').getTime(), START = NOW - 20 * MIN;
const hrUntil = (end) => { const out = []; for (let t = NOW - 90 * MIN; t <= end; t += MIN) { const v = t < START ? 64 : 110 + Math.round(Math.sin(t / 3e5) * 12); out.push([t, v, v - 4, v + 6]); } return out; };

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  async function open(band) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    await ctx.route(/\/api\/band\//, (rt) => {
      const st = band ? { connected: true, needsReconnect: false, connectedAt: NOW - 9 * 86_400_000, lastSync: NOW - 2 * MIN, latest: band.at(-1)[0], error: null, gapSec: 60 } : { connected: false, needsReconnect: false, connectedAt: null, lastSync: null, latest: null, error: null };
      const op = new URL(rt.request().url()).pathname.split('/').pop();
      rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(op === 'data' && band ? { hr: band, sleep: [], rhr: {}, hrv: {}, steps: [], ...st } : st) });
    });
    const pg = await ctx.newPage();
    await pg.clock.install({ time: NOW });
    pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    await pg.goto(APP);
    await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
    await pg.evaluate((start) => { const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k) || '{}');
      s.workouts = [{ id: 'w1', template: 'Push', startedAt: start, endedAt: null, plan: [{ name: 'Bench press', sets: 3, reps: 8, restSec: 90 }] }]; s.entries = [];
      localStorage.setItem(k, JSON.stringify(s)); }, START);
    await pg.goto(APP + '#workout'); await pg.reload(); await pg.waitForSelector('.tile.cur');
    await pg.waitForFunction(() => [...document.querySelectorAll('.tile')].some((t) => /^Heart rate/.test(t.innerText) && !/checking/.test(t.innerText)), null, { timeout: 8000 }).catch(() => {});
    const tile = await pg.locator('.tile', { hasText: 'Heart rate' }).first().innerText();
    return { ctx, pg, tile: tile.replace(/\n/g, ' ') };
  }
  let o = await open(hrUntil(NOW - MIN));
  check(`band connected, minutes in: the session's heart rate, not "connect" (${o.tile})`, /Heart rate \d{2,3}\s*bpm avg \d{2,3} · peak \d{3}$/i.test(o.tile) && !/connect/i.test(o.tile));
  await o.pg.locator('.tile', { hasText: 'Heart rate' }).first().screenshot({ path: OUT + 'workoutheart.png' }); await o.ctx.close();
  o = await open(hrUntil(NOW - 15 * MIN));
  check(`readings 15 min old: says how old (${o.tile})`, /as of 18:05/.test(o.tile) && !/connect/i.test(o.tile)); await o.ctx.close();
  o = await open(hrUntil(START - 10 * MIN));
  check(`nothing from this session yet: says when the last one was and why (${o.tile.slice(0, 90)})`, /no reading this session yet · last 17:50/.test(o.tile)); await o.ctx.close();
  o = await open(null);
  check(`no band: asks to connect it (${o.tile})`, /Connect the band in Settings/.test(o.tile)); await o.ctx.close();
  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
