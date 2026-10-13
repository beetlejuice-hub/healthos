// Tonight (PLAN 88): in the evening, what your own nights say about nights like this one. The Sleep page's fake month
// (sleepfood.cjs): dinner within 2 h of bed went with 20 min longer to fall asleep; magnesium days with more deep sleep.
// At 21:30 with dinner at 21:00 and no magnesium logged, Today's evening card says both; with dinner at 18:30 and
// magnesium taken, only magnesium; in the afternoon, nothing.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

const MIN = 60_000, HOUR = 3_600_000, NOW = new Date('2026-10-09T16:30:00').getTime();
function rng(seed) {
  let s = seed >>> 0;
  const r = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { r, g: () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()) };
}
function world() {
  const { r, g } = rng(5), hr = [], sleep = [], entries = [];
  for (let k = 30; k >= 1; k--) {
    const day0 = new Date(2026, 9, 9 - k).getTime(), T = (h) => day0 + h * HOUR; // the evening's day
    const bed = T(23.2 + g() * 0.15), dinner = T(18 + r() * 4.8), late = bed - dinner < 2 * HOUR;
    const ans = r(), mag = ans < 0.5;
    entries.push({ id: 'f' + k, kind: 'food', at: dinner, name: 'Dinner', grams: 450, macros: { kcal: 750, p: 40, c: 80, f: 25 } });
    if (ans < 0.5) entries.push({ id: 'm' + k, kind: 'supp', at: T(21.5), suppId: 'mag', status: 'taken', slot: 'evening' });
    else if (ans < 0.85) entries.push({ id: 'm' + k, kind: 'supp', at: T(21.5), suppId: 'mag', status: 'skipped', slot: 'evening' });
    const onset = bed + (12 + Math.abs(g() * 3) + (late ? 20 : 0)) * MIN, up = T(31 + g() * 0.2), wake = up - 6 * MIN;
    const stages = [{ type: 'awake', start: bed, end: onset }];
    for (let t = onset, c = 0; t < wake - 20 * MIN; c++) { const e = Math.min(wake, t + 90 * MIN), L = e - t; stages.push({ type: 'light', start: t, end: t + L * 0.45 }, { type: c < (mag ? 3 : 2) ? 'deep' : 'light', start: t + L * 0.45, end: t + L * 0.7 }, { type: 'rem', start: t + L * 0.7, end: e }); t = e; }
    stages.push({ type: 'awake', start: wake, end: up });
    sleep.push({ id: 's' + k, start: bed, end: up, asleepMin: Math.round((wake - onset) / MIN), awakeMin: 20, toFallAsleepMin: Math.round((onset - bed) / MIN), nap: false, stageMin: {}, stages });
    for (let t = bed - HOUR; t < up; t += MIN) { const v = Math.round((t > onset && t < wake ? 54 : 64) + g()); hr.push([t, v, v - 2, v + 2]); }
    entries.push({ id: 'r' + k, kind: 'sleep', at: up + 30 * MIN, rating: 7 });
  }
  return { hr: hr.sort((a, b) => a[0] - b[0]), sleep, entries: entries.sort((a, b) => a.at - b.at) };
}

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const w = world();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  await ctx.route(/\/api\/band\//, (rt) => {
    const u = new URL(rt.request().url()), op = u.pathname.split('/').pop(), from = +u.searchParams.get('from'), to = +u.searchParams.get('to');
    const st = { connected: true, needsReconnect: false, connectedAt: NOW - 40 * 86_400_000, lastSync: NOW - 3 * MIN, latest: w.hr.at(-1)[0], error: null, gapSec: 60 };
    const inR = (t) => t >= from && t <= to;
    rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(op === 'data' ? { hr: w.hr.filter((m) => inR(m[0])), steps: [], sleep: w.sleep.filter((x) => x.end >= from - 86_400_000 && x.start <= to), rhr: {}, hrv: {}, ...st } : st) });
  });
  const pg = await ctx.newPage();
  await pg.clock.install({ time: new Date('2026-10-09T21:30:00') });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  const T = (h, m = 0) => new Date(2026, 9, 9, h, m).getTime();
  const seed = (today) => pg.evaluate((es) => { const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = es; s.workouts = [];
    s.settings = { ...(s.settings || {}), bedMinute: 1380 }; s.supplements = [{ id: 'mag', name: 'Magnesium', dose: '200 mg', slot: 'evening', at: 1290, active: true }]; localStorage.setItem(k, JSON.stringify(s)); }, [...w.entries, ...today]);
  const at = async (iso) => { await pg.clock.setFixedTime(new Date(iso)); await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('.t2-head'); };
  const lines = async () => { await pg.waitForSelector('.t2-tonight', { timeout: 12000 }).catch(() => {}); return pg.locator('.t2-tonight p').evaluateAll((els) => els.map((e) => [e.dataset.factor, e.dataset.kind, e.textContent])); };

  // 21:30, dinner at 21:15, magnesium not logged
  await seed([{ id: 'd0', kind: 'food', at: T(21, 15), name: 'Dinner', grams: 450, macros: { kcal: 750, p: 40, c: 80, f: 25 } }]);
  await at('2026-10-09T21:30:00');
  let L = await lines();
  const meals = L.filter((l) => l[0] === 'meal2h' || l[0] === 'late'), meal = meals[0], mag = L.find((l) => l[0] === 'supp:mag');
  check(`21:30, dinner at 21:15: one line for the late meal (the surer of "after 21:00" / "within 2 h of bed") — nights like that slept worse (${meal && meal[2]})`, meals.length === 1 && meal[1] === 'holds' && /^Ate (after 21:00|within 2 h of bed): nights like that went with \d+ min (longer to fall asleep|less asleep) · (clear|likely)$/.test(meal[2]));
  check(`…magnesium not logged yet: its nights went with more deep sleep (${mag && mag[2]})`, mag && mag[1] === 'missing' && /^Magnesium isn't logged today — nights with it went with \d+ min more deep sleep · (clear|likely)$/.test(mag[2]));
  check(`at most three lines, never "will" (${L.length})`, L.length >= 2 && L.length <= 3 && L.every((l) => !/\bwill\b/.test(l[2])));
  await pg.locator('.t2-tonight').evaluate((el) => el.scrollIntoView({ block: 'center' })); await pg.waitForTimeout(100);
  await pg.screenshot({ path: OUT + 'tonight.png' });
  check(`phone: nothing wider than the screen (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);

  // dinner at 18:30 and magnesium taken: no meal line; magnesium holds
  await seed([{ id: 'd0', kind: 'food', at: T(18, 30), name: 'Dinner', grams: 450, macros: { kcal: 750, p: 40, c: 80, f: 25 } }, { id: 'm0', kind: 'supp', at: T(21, 15), suppId: 'mag', status: 'taken', slot: 'evening' }]);
  await at('2026-10-09T21:30:00');
  L = await lines();
  check(`dinner at 18:30, magnesium taken: no meal line, magnesium "holds" (${JSON.stringify(L.map((l) => [l[0], l[1]]))})`, !L.some((l) => l[0] === 'meal2h') && L.some((l) => l[0] === 'supp:mag' && l[1] === 'holds'));

  // the afternoon: not shown
  await at('2026-10-09T14:00:00');
  check('14:00: no Tonight', await pg.locator('.t2-tonight').count() === 0);
  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
