// The owner's 13 Oct screenshots: the heart-rate band ("is this supposed to be the average band? … i just want explanation
// like why we have this", PLAN 78) and the nights table ("can we get some eli5 explanations or comparisons here", PLAN 79).
// Fake band: 8 nights and a reading every 5 minutes through the day (sparse, like a band between workouts). The Heart page
// and the Timeline explain the band and say how much of the day has one; the Sleep page says the opened night in words.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

const MIN = 60_000, HOUR = 3_600_000, NOW = new Date('2026-10-13T15:00:00').getTime();
function world() {
  const hr = [], sleep = [];
  for (let k = 8; k >= 0; k--) {
    const day = new Date(2026, 9, 13 - k).getTime(), bed = day - 0.5 * HOUR, hrs = k === 0 ? 6.0 : 7 + (k % 3) * 0.15, up = bed + (hrs * 60 + 25) * MIN, on = bed + 15 * MIN;
    sleep.push({ id: 'n' + k, start: bed, end: up, asleepMin: Math.round(hrs * 60), awakeMin: k === 0 ? 60 : 10, toFallAsleepMin: 15, nap: false, stageMin: {},
      stages: [{ type: 'awake', start: bed, end: on }, { type: 'light', start: on, end: on + 2 * HOUR }, { type: 'deep', start: on + 2 * HOUR, end: on + 3.2 * HOUR }, { type: 'rem', start: on + 3.2 * HOUR, end: up - 10 * MIN }, { type: 'awake', start: up - 10 * MIN, end: up }] });
    for (let t = day + 8 * HOUR; t < day + 22 * HOUR && t <= NOW; t += 5 * MIN) { const v = 66 + Math.round(Math.sin(t / 4e6) * 4); hr.push([t, v, v - 2, v + 3]); }
  }
  return { hr, sleep };
}
(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const w = world();
  const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  await ctx.route(/\/api\/band\//, (rt) => {
    const u = new URL(rt.request().url()), op = u.pathname.split('/').pop(), from = +u.searchParams.get('from'), to = +u.searchParams.get('to');
    const st = { connected: true, needsReconnect: false, connectedAt: NOW - 20 * 86_400_000, lastSync: NOW - 3 * MIN, latest: w.hr.at(-1)[0], error: null, gapSec: 300 };
    rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(op === 'data' ? { hr: w.hr.filter((m) => m[0] >= from && m[0] <= to), sleep: w.sleep, rhr: {}, hrv: {}, steps: [], ...st } : st) });
  });
  const pg = await ctx.newPage();
  await pg.clock.install({ time: NOW });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  await pg.evaluate((now) => { const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k) || '{}');
    s.entries = [{ id: 'c1', kind: 'drink', at: now - 6 * 3600e3, name: 'Coffee', ml: 250, caffeineMg: 95, alcoholG: 0, kcal: 2 }, { id: 'f1', kind: 'feel', at: now - 3 * 3600e3, mood: 6, energy: 6 }];
    localStorage.setItem(k, JSON.stringify(s)); }, NOW);
  // Heart page: the explainer, and a band through the day even with a reading every 5 minutes
  await pg.goto(APP + '#insights/heart'); await pg.reload(); await pg.waitForSelector('.hp-day');
  const why = pg.locator('.hp-day details.usual-why');
  await why.locator('summary').click();
  const t = await why.innerText(), have = +(await why.locator('[data-have]').getAttribute('data-have'));
  check(`Heart: "What's the grey band" says what it is and how it's made (${t.slice(0, 60)}…)`, /Your usual for that time of day/.test(t) && /middle 60 %/.test(t) && /last 14 days/.test(t));
  check(`Heart: with a reading every 5 min the band covers the day, not just the night (${have} of 96 quarter hours)`, have >= 50);
  await why.screenshot({ path: OUT + 'explain-band.png' });
  // Sleep page: the opened night in plain words
  await pg.goto(APP + '#insights/sleep'); await pg.waitForSelector('.sl[data-nights]'); await pg.waitForSelector('.night-words', { timeout: 10000 }).catch(() => {});
  const words = await pg.locator('.night-words').innerText().catch(() => '');
  check(`Sleep: last night in plain words, against the usual (${words.split('\n').slice(1, 3).join(' | ').slice(0, 120)})`, /Asleep 6 h 00 — less than your usual/.test(words) && /Deep/.test(words) && /repairs/.test(words));
  await pg.locator('.night-words').screenshot({ path: OUT + 'explain-night.png' });
  check(`fits the phone (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
