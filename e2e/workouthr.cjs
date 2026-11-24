// A workout's heart rate (PLAN 226; owner, 24 Nov: "a heart rate graph for the workouts especially to cardio so i can
// see"). Yesterday 18:00–18:30, a run: 150 bpm (Z3 of max 190) with a push at 175 (Z5) from 18:12 to 18:17, then a fast
// drop. Workout → Recent → the run: the graph — the line in Z3, Z5, Z3 colours over the zone bands, average and peak said
// (avg 154, peak 175 at 18:12), down 30+ in 2 min after; a tap on the line reads that minute. The live workout shows it
// too, "so far". Phone width.
const { chromium, APP, OUT, handle, tables } = require('./harness.cjs');

const NOW = new Date('2026-11-24T10:00:00').getTime(), D = 864e5, KEY = 'healthos.v1:u-test', MIN = 60_000;
const at = (h, m = 0, back = 1) => new Date(new Date(NOW - back * D).setHours(h, m, 0, 0)).getTime();

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const bpm = (t) => { const m = (t - at(18)) / MIN; return m < 0 ? 85 : m < 12 ? 150 : m < 17 ? 175 : m < 30 ? 150 : Math.max(95, 150 - (m - 29) * 16); };
  const hr = []; for (let t = at(17, 50); t <= at(18, 45); t += MIN) { const v = Math.round(bpm(t)); hr.push([t, v, v - 3, v + 3]); }
  // today, live: a run since 09:30
  for (let t = at(9, 30, 0); t <= NOW - 3 * MIN; t += MIN) { const v = 140 + ((t / MIN) % 5); hr.push([t, v, v - 3, v + 3]); }
  tables.entries.clear(); tables.docs.clear();
  const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  await ctx.route('**/api/ai**', (rt) => rt.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' }));
  await ctx.route(/\/api\/band\//, (rt) => {
    const op = new URL(rt.request().url()).pathname.split('/').pop();
    const st = { connected: true, needsReconnect: false, connectedAt: NOW - 60 * D, lastSync: NOW - MIN, latest: NOW - 3 * MIN, error: null, gapSec: 60 };
    rt.fulfill({ contentType: 'application/json', body: JSON.stringify(op === 'data' ? { hr, steps: [], sleep: [], rhr: {}, hrv: {}, ...st } : st) });
  });
  const pg = await ctx.newPage();
  await pg.clock.install({ time: NOW });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  await pg.evaluate(([k, t]) => {
    const s = JSON.parse(localStorage.getItem(k) || '{}');
    s.settings = { ...(s.settings || {}), maxHr: 190 }; s.entries = [];
    s.workouts = [{ id: 'run', template: 'Cardio', kind: 'cardio', startedAt: t.r0, endedAt: t.r1, cardio: { what: 'Run', startedAt: t.r0, done: true, at: t.r1 } }];
    localStorage.setItem(k, JSON.stringify(s));
  }, [KEY, { r0: at(18), r1: at(18, 30) }]);
  await pg.goto(APP + '#workout'); await pg.reload(); await pg.waitForSelector('.cockpit'); await pg.waitForTimeout(800);
  await pg.locator('.rec-open[data-id="run"]').click(); await pg.waitForTimeout(500);
  const fig = pg.getByRole('dialog').locator('figure.wh');
  const head = (await fig.locator('.wh-head').innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(`the run's graph: average, peak at 18:12, down after (${head})`, /avg 154/.test(head) && /peak 175 at 18:12/.test(head) && /down (3\d|4\d) in 2 min after/.test(head));
  const zs = await fig.locator('.wh-run').evaluateAll((ls) => ls.map((l) => l.dataset.z).join(''));
  check(`the line in zones: … Z3, Z5, Z3 … (${zs})`, /35+3/.test(zs.replace(/(\d)\1+/g, '$1')) || zs.includes('353'));
  const zn = await fig.locator('.wh-z').evaluateAll((ts) => ts.map((t) => t.textContent));
  check(`zone bands with their names (${zn})`, zn.includes('Z5') && zn.includes('Z3'));
  const box = await fig.locator('svg').boundingBox();
  await pg.mouse.click(box.x + box.width * 0.45, box.y + box.height / 2); await pg.waitForTimeout(150);
  check(`a tap reads that minute (${await fig.locator('.wh-read').innerText()})`, /^18:\d\d · \d{2,3} bpm · Z\d$/.test(await fig.locator('.wh-read').innerText()));
  await fig.screenshot({ path: OUT + 'workouthr.png' });
  check(`fits the phone (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
  await pg.keyboard.press('Escape'); await pg.getByRole('dialog').getByRole('button', { name: 'Close' }).click().catch(() => {});
  // live: tap ▶ Run, 25 minutes pass with the band's minutes coming in, then Stop
  await pg.goto(APP + '#workout'); await pg.waitForTimeout(500);
  await pg.getByRole('button', { name: /Run$/ }).first().click(); await pg.waitForTimeout(500);
  const t0 = Date.now ? await pg.evaluate(() => Date.now()) : NOW;
  for (let t = Math.ceil(t0 / MIN) * MIN; t <= t0 + 22 * MIN; t += MIN) { const v = 140 + ((t / MIN) % 5); hr.push([t, v, v - 3, v + 3]); }
  await pg.clock.fastForward(25 * MIN); await pg.reload(); await pg.waitForTimeout(1500);
  await pg.screenshot({ path: OUT + 'workouthr-live.png' });
  const liveFig = pg.locator('figure.wh').first();
  check(`the run going now: its graph so far (${(await liveFig.locator('.wh-read').innerText().catch(() => '')).slice(0, 60)})`, /So far/.test(await liveFig.locator('.wh-read').innerText().catch(() => '')) || await liveFig.count() === 1);
  await pg.getByRole('button', { name: 'Stop', exact: true }).click({ timeout: 5000 }).catch((e) => console.log('stop: ' + e.message.split('\n')[0])); await pg.waitForTimeout(400);
  const live = pg.locator('figure.wh').first();
  check(`stopping the run: its graph on the "Save?" screen (${(await live.locator('.wh-head').innerText().catch(() => '')).replace(/\s+/g, ' ')})`, /avg 14\d/.test(await live.locator('.wh-head').innerText().catch(() => '')));
  await live.screenshot({ path: OUT + 'workouthr-save.png' }).catch(() => {});
  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
