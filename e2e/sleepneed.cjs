// Your sleep need and best bedtime (PLAN 88). Owner, 13 Oct: "Your sleep need and best bedtime window: the hours and
// bedtime that go with your best next days" — picked as 3 of "do 1,2,3". 45 fake nights from the band, hours asleep spread
// 5½–9 h and bedtimes 22:30–01:00, a check-in each next evening. Planted: energy +1.3 after 7–7½ h asleep; mood −1.2
// after a bedtime past midnight. Focus: nothing. The Mind page's "Last night's sleep → that day" must find both windows.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

const MIN = 60_000, HOUR = 3_600_000, NOW = new Date('2026-10-09T21:30:00').getTime();
function rng(seed) {
  let s = seed >>> 0;
  const r = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { r, g: () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()) };
}
const cl = (v) => Math.max(1, Math.min(10, Math.round(v * 2) / 2));
function world() {
  const { r, g } = rng(17), hr = [], sleep = [], entries = [];
  for (let k = 45; k >= 1; k--) {
    // spread evenly over the bands (hours: 7 steps; bedtimes: 5, independent of the hours), with a little jitter
    const day0 = new Date(2026, 9, 9 - k).getTime(), T = (h) => day0 + h * HOUR, bedH = 22.75 + ((k * 3) % 5) * 0.5 + (r() - 0.5) * 0.3, hrs = 5.75 + (k % 7) * 0.5 + (r() - 0.5) * 0.3;
    const bed = T(bedH), onset = bed + 12 * MIN, wake = onset + hrs * HOUR, up = wake + 6 * MIN;
    const stages = [{ type: 'awake', start: bed, end: onset }];
    for (let t = onset, c = 0; t < wake - 10 * MIN; c++) { const e = Math.min(wake, t + 90 * MIN), L = e - t; stages.push({ type: 'light', start: t, end: t + L * 0.45 }, { type: c < 2 ? 'deep' : 'light', start: t + L * 0.45, end: t + L * 0.7 }, { type: 'rem', start: t + L * 0.7, end: e }); t = e; }
    stages.push({ type: 'awake', start: wake, end: up });
    sleep.push({ id: 's' + k, start: bed, end: up, asleepMin: Math.round(hrs * 60), awakeMin: 10, toFallAsleepMin: 12, nap: false, stageMin: {}, stages });
    for (let t = bed - HOUR; t < up; t += 2 * MIN) { const v = Math.round((t > onset && t < wake ? 54 : 64) + g()); hr.push([t, v, v - 2, v + 2]); }
    const next = day0 + 24 * HOUR;
    if (next + 19.5 * HOUR < NOW) entries.push({ id: 'f' + k, kind: 'feel', at: next + 19.5 * HOUR,
      energy: cl(6 + g() * 0.6 + (hrs >= 7 && hrs < 7.5 ? 1.3 : 0)), mood: cl(6.5 + g() * 0.6 - (bedH >= 24 ? 1.2 : 0)), focus: cl(6 + g() * 0.7), stress: cl(4 + g() * 0.6) });
  }
  return { hr: hr.sort((a, b) => a[0] - b[0]), sleep, entries };
}

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const w = world();
  const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  await ctx.route(/\/api\/band\//, (rt) => {
    const u = new URL(rt.request().url()), op = u.pathname.split('/').pop(), from = +u.searchParams.get('from'), to = +u.searchParams.get('to');
    const st = { connected: true, needsReconnect: false, connectedAt: NOW - 60 * 86_400_000, lastSync: NOW - 3 * MIN, latest: w.hr.at(-1)[0], error: null, gapSec: 120 };
    const inR = (t) => t >= from && t <= to;
    rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(op === 'data' ? { hr: w.hr.filter((m) => inR(m[0])), steps: [], sleep: w.sleep.filter((x) => x.end >= from - 86_400_000 && x.start <= to), rhr: {}, hrv: {}, ...st } : st) });
  });
  const pg = await ctx.newPage();
  await pg.clock.install({ time: NOW });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  await pg.evaluate((es) => { const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = es; s.workouts = []; localStorage.setItem(k, JSON.stringify(s)); }, w.entries);
  await pg.goto(APP + '#insights/mind'); await pg.reload(); await pg.waitForSelector('.mp[data-sec]');
  // the 12-week view, so all 45 nights are in
  await pg.getByRole('button', { name: '12 weeks' }).first().click();
  await pg.waitForFunction(() => +document.querySelector('.mp')?.dataset.nights >= 40, null, { timeout: 15000 }).catch(() => {});
  await pg.waitForTimeout(400);
  const sec = pg.locator('.mp-sleep');
  const best = async () => sec.locator('.mp-best').evaluate((e) => [e.dataset.sure, e.dataset.best, e.textContent]);
  let h = await best();
  check(`hours asleep → energy: best after 7–7½ h, planted +1.3, found (${h[2]})`, (h[0] === 'clear' || h[0] === 'likely') && h[1] === '7–7½ h' && /^Energy went best after 7–7½ h asleep: \d\.\d vs \d\.\d on your other days · (clear|likely)\.$/.test(h[2]));
  check('…the best band is shaded, the others not', await sec.locator('.mp-bestband').count() === 1);
  const ns = await sec.locator('g[data-band]').evaluateAll((gs) => gs.map((g) => +g.dataset.n));
  check(`six half-hour bands, every day in one (${ns.join('+')})`, ns.length === 6 && ns.reduce((a, b) => a + b, 0) >= 40);
  await sec.getByRole('button', { name: 'Focus' }).click(); await pg.waitForTimeout(200);
  h = await best();
  check(`focus, nothing planted: no best window (${h[2]})`, h[0] === 'not clear' && await sec.locator('.mp-bestband').count() === 0);
  await sec.getByRole('button', { name: 'Bedtime' }).click(); await sec.getByRole('button', { name: 'Mood' }).click(); await pg.waitForTimeout(200);
  h = await best();
  check(`bedtime → mood: best before 00:00, planted −1.2 after midnight, found (${h[2]})`, (h[0] === 'clear' || h[0] === 'likely') && /^Mood went best on days after a bedtime (before 00:00|before 23:30|23:00–00:00|23:30–00:00|before 23:00): \d\.\d vs \d\.\d/.test(h[2]));
  await sec.scrollIntoViewIfNeeded(); await sec.screenshot({ path: OUT + 'sleepneed-bedtime.png' });
  await sec.getByRole('button', { name: 'Hours asleep' }).click(); await sec.getByRole('button', { name: 'Energy' }).click(); await pg.waitForTimeout(200);
  await sec.screenshot({ path: OUT + 'sleepneed-hours.png' });
  check(`phone: nothing wider than the screen (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
