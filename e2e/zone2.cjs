// Zone 2 a week (owner, 14 Nov, item 8 of the open list). Age 31 → max 186, zone 2 112–130 bpm. Three weeks the band saw
// whole, 100 zone-2 minutes each; this week 50 so far: "50 min this week of a 150 aim · usual 100", 8 bars, the weeks it
// saw little of drawn faint. Without an age, it says what it needs.
const { chromium, APP, OUT, handle } = require('./harness.cjs');
const MIN = 60_000, D = 864e5, T = new Date('2026-11-13T18:00:00').getTime(), MON = new Date('2026-11-09T00:00:00').getTime();
const hr = [];
for (const k of [3, 2, 1]) { const w0 = MON - k * 7 * D; for (let t = w0; t < w0 + 7 * D; t += MIN) { const v = t - w0 < 100 * MIN ? 120 : 62; hr.push([t, v, v - 2, v + 2]); } }
for (let i = 0; i < 50; i++) hr.push([MON + D + 7 * 3600e3 + i * MIN, 121, 119, 123]);
for (let t = MON + D + 9 * 3600e3; t < T; t += MIN) hr.push([t, 64, 62, 66]);
(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  await ctx.route(/\/api\/band\//, (rt) => {
    const u = new URL(rt.request().url()), op = u.pathname.split('/').pop(), from = +u.searchParams.get('from'), to = +u.searchParams.get('to');
    const st = { connected: true, needsReconnect: false, connectedAt: T - 60 * D, lastSync: T, latest: hr.at(-1)[0], error: null, gapSec: 60 };
    if (op === 'cardio') return rt.fulfill({ status: 200, contentType: 'application/json', body: '{"pairs":[],"rec":[]}' });
    rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(op === 'data' ? { hr: hr.filter((m) => m[0] >= from && m[0] <= to), steps: [], sleep: [], rhr: {}, hrv: {}, ...st } : st) });
  });
  const pg = await ctx.newPage();
  await pg.clock.install({ time: T });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  const seed = (age) => pg.evaluate(([T, D, age]) => { const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k) || '{}');
    s.workouts = [{ id: 'c1', template: 'Cardio', kind: 'cardio', startedAt: T - 2 * D, endedAt: T - 2 * D + 1800e3, cardio: { what: 'Stairmaster', startedAt: T - 2 * D } }];
    s.entries = [{ id: 'kg', kind: 'weight', at: T - D, kg: 81 }]; s.settings = { ...(s.settings || {}), age }; if (age == null) delete s.settings.age;
    localStorage.setItem(k, JSON.stringify(s)); }, [T, D, age]);
  await seed(31);
  await pg.goto(APP + '#insights/training'); await pg.reload(); await pg.waitForSelector('.tp', { timeout: 15000 });
  const card = pg.getByRole('region', { name: 'Zone 2' });
  await pg.waitForFunction(() => document.querySelector('.z2')?.dataset.now === '50', null, { timeout: 20000 }).catch(() => {});
  const t = (await card.innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(`50 min this week of a 150 aim, usual 100 (${t.slice(0, 120)})`, /50 min this week of a 150 aim · usual 100/.test(t));
  check(`8 weeks as bars, the four the band never saw faint (${await card.locator('.z2-bar').count()}, faint ${await card.locator('.z2-bar.faint').count()})`, await card.locator('.z2-bar').count() === 8 && await card.locator('.z2-bar.faint').count() === 4);
  check('…its zone in bpm from his age', /112–130 bpm, max 186 from your age/.test(t));
  await card.screenshot({ path: OUT + 'zone2.png' }).catch(() => {});
  check(`fits the phone (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
  await seed(null); await pg.reload(); await pg.waitForSelector('.tp', { timeout: 15000 }); await pg.waitForTimeout(1500);
  check('no age: says what it needs', /Needs your max heart rate/.test(await pg.getByRole('region', { name: 'Zone 2' }).innerText().catch(() => '')));
  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message.split('\n')[0]); process.exit(1); });
