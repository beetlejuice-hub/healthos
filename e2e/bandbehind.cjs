// Settings → Band says which side is behind (PLAN 69; owner, 13 Oct: "For some reason my last reading from the band came in
// like 9h ago"): checked Google 5 minutes ago but its newest reading is from 07:00 → waiting on the phone (Fitbit app);
// not checked Google for 2 hours → on our side. Fresh readings: no message.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

const MIN = 60_000, NOW = new Date('2026-10-13T16:00:00').getTime();
(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  async function card(lastSync, latest) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    await ctx.route(/\/api\/band\//, (rt) => {
      const st = { connected: true, needsReconnect: false, connectedAt: NOW - 9 * 86_400_000, lastSync, latest, error: null, gapSec: 60 };
      const op = new URL(rt.request().url()).pathname.split('/').pop();
      const hr = []; for (let t = latest - 60 * MIN; t <= latest; t += MIN) hr.push([t, 62, 60, 64]);
      rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(op === 'data' ? { hr, sleep: [], rhr: {}, hrv: {}, steps: [], ...st } : st) });
    });
    const pg = await ctx.newPage();
    await pg.clock.install({ time: NOW });
    pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    await pg.goto(APP);
    await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
    await pg.goto(APP + '#settings'); await pg.reload(); await pg.waitForSelector('#band .band-facts', { timeout: 10000 }).catch(() => {});
    await pg.waitForTimeout(300);
    const note = await pg.locator('#band .band-behind').innerText().catch(() => ''), side = await pg.locator('#band .band-behind').getAttribute('data-behind').catch(() => null);
    return { ctx, pg, note, side };
  }
  let c = await card(NOW - 5 * MIN, new Date('2026-10-13T07:00:00').getTime());
  check(`checked Google 5 min ago, newest from 07:00: waiting on the phone (${c.note.slice(0, 90)})`, c.side === 'phone' && /newer than 07:00/.test(c.note) && /Fitbit app/.test(c.note));
  await c.pg.locator('#band').screenshot({ path: OUT + 'bandbehind.png' }); await c.ctx.close();
  c = await card(NOW - 120 * MIN, NOW - 125 * MIN);
  check(`not checked Google for 2 h: on our side (${c.note.slice(0, 80)})`, c.side === 'us' && /our side/.test(c.note)); await c.ctx.close();
  c = await card(NOW - 3 * MIN, NOW - 20 * MIN);
  check('fresh readings: no message', c.side === null && c.note === ''); await c.ctx.close();
  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
