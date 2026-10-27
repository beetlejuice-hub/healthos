// Insights → Body lab, your body clock (PLAN 177, body lab 6; owner, 27 Oct: "yea"). 30 fake nights from the band —
// asleep 00:40 to 08:20, heart rate lowest around 04:10 — and 30 days of check-ins with focus planted 10:00–12:00 and
// an energy dip 15:00–16:00. The dial and its rows must say so, the ping switch must keep its setting (and say
// notifications are off on this device), and it must fit a phone. Control: check-ins with nothing planted — no window
// named, no ping switch.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

const MIN = 60_000, HOUR = 3_600_000, D = 86_400_000, NOW = new Date('2026-10-27T12:00:00').getTime();
const ymd = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
function rng(seed) { let s = seed >>> 0; const r = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; return { r, g: () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()) }; }
function world(plant) {
  const { r, g } = rng(4), sleep = [], hr = [], hrv = {}, rhr = {}, entries = [];
  for (let i = 30; i >= 1; i--) {
    const day0 = new Date(2026, 9, 27 - i).getTime(), T = (h) => day0 + h * HOUR;
    const onset = T(0 + 40 / 60), wake = T(8 + 20 / 60), bed = onset - 10 * MIN, up = wake + 5 * MIN;
    sleep.push({ id: 's' + i, start: bed, end: up, asleepMin: Math.round((wake - onset) / MIN), awakeMin: 0, toFallAsleepMin: 10, nap: false, stageMin: {}, stages: [{ type: 'awake', start: bed, end: onset }, { type: 'light', start: onset, end: wake }, { type: 'awake', start: wake, end: up }] });
    for (let t = bed; t < up; t += MIN) { const lowish = Math.abs(t - T(4 + 10 / 60)) <= 10 * MIN; const v = lowish ? 47 : 55; hr.push([t, v, v - 1, v + 1]); }
    hrv[ymd(up)] = 50; rhr[ymd(up)] = 54;
    for (let k = 0; k < 6; k++) {
      const m = 8 * 60 + Math.floor(r() * 14 * 60), h = Math.floor(m / 60);
      const focus = Math.round(Math.max(1, Math.min(10, 6 + (plant && h >= 10 && h < 12 ? 2 : 0) + g())));
      const energy = Math.round(Math.max(1, Math.min(10, 6.5 + (plant && h === 15 ? -2.5 : 0) + g())));
      entries.push({ id: `f${i}-${k}`, kind: 'feel', at: T(m / 60), focus, energy });
    }
  }
  return { hr, sleep, hrv, rhr, entries };
}

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  async function open(w, width) {
    const ctx = await b.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    await ctx.route('**/api/ai**', (rt) => rt.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' }));
    await ctx.route(/\/api\/(band|push)\//, (rt) => {
      const u = new URL(rt.request().url()), op = u.pathname.split('/').pop(), from = +u.searchParams.get('from'), to = +u.searchParams.get('to');
      if (u.pathname.includes('/push/')) return rt.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"devices":[],"next":null}' });
      const st = { connected: true, needsReconnect: false, connectedAt: NOW - 90 * D, lastSync: NOW - 3 * MIN, latest: w.hr.at(-1)[0], error: null, gapSec: 60 };
      const inR = (t) => t >= from && t <= to;
      rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(op === 'data' ? { hr: w.hr.filter((m) => inR(m[0])), steps: [], sleep: w.sleep.filter((x) => x.end >= from && x.start <= to), rhr: w.rhr, hrv: w.hrv, ...st } : st) });
    });
    const pg = await ctx.newPage();
    await pg.clock.install({ time: NOW });
    pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
    await pg.goto(APP);
    await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
    await pg.evaluate((es) => { const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = es; s.workouts = []; localStorage.setItem(k, JSON.stringify(s)); }, w.entries);
    await pg.goto(APP + '#insights/lab'); await pg.reload();
    await pg.waitForFunction(() => +(document.querySelector('.bl')?.dataset.nights ?? 0) >= 28, null, { timeout: 20000 }).catch(() => {});
    await pg.waitForTimeout(800);
    return { ctx, pg };
  }
  const card = (pg) => pg.locator('[data-card="clock"]');
  const text = async (l) => (await l.innerText().catch(() => '')).replace(/\s+/g, ' ');

  let { ctx, pg } = await open(world(true), 390);
  const t = await text(card(pg));
  console.log('card:', t.slice(0, 400));
  check('sleep 00:40–08:20, midpoint 04:30', /Sleep midpoint 04:30/.test(t) && /Sleep 00:40–08:20/.test(t));
  check('night low around 04:10', /Your night low \(lowest heart rate\) 04:(0\d|1\d)/.test(t));
  check('focus window 10:00–12:00, how sure', /Focus window · \d\.\d vs \d\.\d (clear|likely) 10:00–12:00/.test(t));
  check('afternoon slump 15:00–16:00, how sure', /Afternoon slump · energy \d\.\d vs \d\.\d (clear|likely) 15:00–16:00/.test(t));
  const ping = card(pg).locator('.bc-ping');
  check(`the ping switch: off by default, at 14:45 (${await text(ping)})`, /Ping me before the slump · at 14:45, 15 min early/.test(await text(ping)) && !(await ping.locator('input').isChecked()));
  await ping.locator('input').check(); await pg.waitForTimeout(300);
  const on = await pg.evaluate(() => JSON.parse(localStorage.getItem('healthos.v1:u-test')).settings.notify?.slump);
  check(`turned on: kept in settings; says notifications are off on this device (${await text(ping)})`, on === true && /notifications are off on this device/.test(await text(ping)));
  check(`fits the phone (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
  await card(pg).screenshot({ path: OUT + 'bodyclock.png' });
  await ctx.close();

  ({ ctx, pg } = await open(world(true), 320));
  check(`320 px: no sideways scroll (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await card(pg).count() === 1 && await pg.evaluate(() => document.documentElement.scrollWidth) <= 320);
  await card(pg).screenshot({ path: OUT + 'bodyclock-320.png' });
  await ctx.close();

  ({ ctx, pg } = await open(world(false), 390));
  const c = await text(card(pg));
  check(`control: no focus window, no slump named, no ping switch (${c.slice(0, 260)})`, /Focus: no window stands out yet/.test(c) && /Slump: no afternoon hour stands out yet/.test(c) && await card(pg).locator('.bc-ping').count() === 0);
  await ctx.close();

  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
