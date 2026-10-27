// Insights → Body lab, wound up while still (PLAN 177, body lab 5; owner, 27 Oct: "yes"). 35 fake days from the band:
// awake 07:00–23:00 at ~60 bpm, a walk every day 12:00–12:20 at 95 with steps (must never count). Planted: Tuesdays
// 15:00–16:00 at 80 while still. The card must name Tuesday 15:00, 4 of the last 4 Tuesdays, mark that cell, and fit a
// phone at 390 and 320. Control: the walks alone — nothing wound up, no hour named.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

const MIN = 60_000, HOUR = 3_600_000, D = 86_400_000, NOW = new Date('2026-10-27T12:00:00').getTime();
const ymd = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
function world(plant) {
  const hr = [], sleep = [], steps = [], hrv = {}, rhr = {};
  for (let i = 35; i >= 1; i--) {
    const day0 = new Date(2026, 9, 27 - i).getTime(), T = (h) => day0 + h * HOUR, tue = new Date(day0).getDay() === 2;
    const bed = T(-1), up = T(7);
    sleep.push({ id: 's' + i, start: bed, end: up, asleepMin: 470, awakeMin: 0, toFallAsleepMin: 10, nap: false, stageMin: {}, stages: [{ type: 'light', start: bed + 10 * MIN, end: up }] });
    hrv[ymd(up)] = 50; rhr[ymd(up)] = 55;
    for (let m = 7 * 60; m < 23 * 60; m++) {
      const walk = m >= 12 * 60 && m < 12 * 60 + 20, hot = plant && tue && m >= 15 * 60 && m < 16 * 60;
      const v = walk ? 95 : hot ? 80 : 60 + ((m * 7) % 5) - 2;
      hr.push([T(m / 60), v, v - 1, v + 1]);
    }
    steps.push([T(12), 20, 2000], [T(18), 15, 30]);
  }
  return { hr, sleep, steps, hrv, rhr };
}

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  async function open(w, width) {
    const ctx = await b.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    await ctx.route('**/api/ai**', (rt) => rt.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' }));
    await ctx.route(/\/api\/band\//, (rt) => {
      const u = new URL(rt.request().url()), op = u.pathname.split('/').pop(), from = +u.searchParams.get('from'), to = +u.searchParams.get('to');
      const st = { connected: true, needsReconnect: false, connectedAt: NOW - 90 * D, lastSync: NOW - 3 * MIN, latest: w.hr.at(-1)[0], error: null, gapSec: 60 };
      const inR = (t) => t >= from && t <= to;
      rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(op === 'data' ? { hr: w.hr.filter((m) => inR(m[0])), steps: w.steps.filter((s) => inR(s[0])), sleep: w.sleep.filter((x) => x.end >= from && x.start <= to), rhr: w.rhr, hrv: w.hrv, ...st } : st) });
    });
    const pg = await ctx.newPage();
    await pg.clock.install({ time: NOW });
    pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
    await pg.goto(APP);
    await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
    await pg.evaluate(() => { const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = [{ id: 'f1', kind: 'feel', at: Date.now() - 86_400_000, energy: 6 }]; s.workouts = []; localStorage.setItem(k, JSON.stringify(s)); });
    await pg.goto(APP + '#insights/lab'); await pg.reload();
    await pg.waitForFunction(() => +(document.querySelector('.bl')?.dataset.nights ?? 0) >= 30, null, { timeout: 20000 }).catch(() => {});
    await pg.waitForTimeout(800);
    return { ctx, pg };
  }
  const card = (pg) => pg.locator('[data-card="wound"]');
  const text = async (l) => (await l.innerText().catch(() => '')).replace(/\s+/g, ' ');

  let { ctx, pg } = await open(world(true), 390);
  const h = await text(card(pg).locator('h3'));
  check(`names Tuesday 15:00–16:00, 4 of the last 4 Tuesdays (${h})`, h === 'Your most wound-up hour: Tuesday 15:00–16:00 — 4 of the last 4 Tuesdays.' && await card(pg).getAttribute('data-top') === '1-15');
  const hot = await card(pg).locator('i[data-hot]').getAttribute('title').catch(() => '');
  check(`that cell is marked, with its minutes (${hot})`, /^Tue 15:00–16:00: (5[5-9]|60) min an hour wound up · on 4 of 4 weeks$/.test(hot));
  const noon = await card(pg).locator('.wh-row').nth(1).locator('i').nth(12).getAttribute('title').catch(() => '');
  check(`the walks at noon don't count (${noon})`, /^Tue 12:00–13:00: 0 min an hour wound up/.test(noon));
  check(`fits the phone (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
  await card(pg).screenshot({ path: OUT + 'wound.png' });
  await ctx.close();

  ({ ctx, pg } = await open(world(true), 320));
  check(`320 px: no sideways scroll (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await card(pg).count() === 1 && await pg.evaluate(() => document.documentElement.scrollWidth) <= 320);
  await card(pg).screenshot({ path: OUT + 'wound-320.png' });
  await ctx.close();

  ({ ctx, pg } = await open(world(false), 390));
  const c = await text(card(pg).locator('h3'));
  check(`control (walks only): nothing wound up, no hour named (${c})`, c === 'No minutes wound up while still in the last 4 weeks.' && await card(pg).getAttribute('data-minutes') === '0');
  await ctx.close();

  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
