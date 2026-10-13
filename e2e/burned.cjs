// Calories burned (PLAN 83; owner, 13 Oct: "one would assume calories burned are already in the app…pls include"). The band
// says 1,840 burned so far today and 2,650 yesterday; 1,520 eaten today, 2,310 yesterday. Today's Food card says both and the
// difference; without a band it says nothing about burning.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

const NOW = new Date('2026-10-13T16:00:00').getTime(), H = 3_600_000;
(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  async function open(kcal) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    await ctx.route(/\/api\/band\//, (rt) => {
      const st = kcal ? { connected: true, needsReconnect: false, connectedAt: NOW - 9 * 86_400_000, lastSync: NOW - 60e3, latest: NOW - 5 * 60e3, error: null, gapSec: 60 } : { connected: false, needsReconnect: false, connectedAt: null, lastSync: null, latest: null, error: null };
      const op = new URL(rt.request().url()).pathname.split('/').pop();
      rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(op === 'data' && kcal ? { hr: [[NOW - 5 * 60e3, 70, 68, 72]], sleep: [], rhr: {}, hrv: {}, steps: [], kcal, ...st } : st) });
    });
    const pg = await ctx.newPage();
    await pg.clock.install({ time: NOW });
    pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    await pg.goto(APP);
    await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
    await pg.evaluate((now) => { const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k) || '{}');
      const food = (id, at, kcal) => ({ id, kind: 'food', at, name: 'Meal', grams: 400, macros: { kcal, p: 30, c: 100, f: 30 } });
      s.entries = [food('y1', now - 24 * 3600e3 - 4 * 3600e3, 1310), food('y2', now - 24 * 3600e3 + 2 * 3600e3, 1000), food('t1', now - 6 * 3600e3, 820), food('t2', now - 2 * 3600e3, 700)];
      localStorage.setItem(k, JSON.stringify(s)); }, NOW);
    await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('#fuel');
    await pg.waitForSelector('#fuel .burn', { timeout: 6000 }).catch(() => {});
    return { ctx, pg, text: await pg.locator('#fuel .burn').innerText().catch(() => '') };
  }
  let o = await open({ '2026-10-12': 2650, '2026-10-13': 1840 });
  check(`today: burned so far from the band, and eaten against it (${o.text.split('\n').slice(0, 2).join(' | ')})`, /Burned 1,840 so far · band/.test(o.text) && /Eaten 1,520 — 320 less than burned so far/.test(o.text));
  check(`yesterday's whole day (${o.text.split('\n')[2]})`, /Yesterday: ate 2,310 · burned 2,650 — 340 less than burned/.test(o.text));
  await o.pg.locator('#fuel').screenshot({ path: OUT + 'burned.png' });
  check(`fits the phone (${await o.pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await o.pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
  await o.ctx.close();
  o = await open(null);
  check('no band: nothing about burning', o.text === '');
  await o.ctx.close();
  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
