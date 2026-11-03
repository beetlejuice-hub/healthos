// Cardio phase 2 (PLAN 191; owner, 3 Nov: "1 and 2"). Three earlier runs with distances (24, 23, 22.5 min for 2 mi) and one
// yesterday with none. Insights → Training: "Add the distance" on yesterday's run, 2 mi → 10:30 a mile, "your fastest run
// yet"; then Today says "New best". The cardio after lifting: a session with Stairmaster started at 18:50; at 19:00 "Next:
// Run"; Done at 19:20 → its phases' distances, Run 2 mi = 10:00 a mile; saved as "Stairmaster → Run"; its calories each at
// its own MET. 320 px.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

const MIN = 60_000, D = 86_400_000, NOW = new Date('2026-11-03T18:00:00').getTime(), MI = 1.609344, KEY = 'healthos.v1:u-test';
const run = (id, daysAgo, min, mi) => { const s = NOW - daysAgo * D, e = s + min * MIN; return { id, kind: 'cardio', template: 'Cardio', startedAt: s, endedAt: e, cardio: { what: 'Run', startedAt: s, done: true, at: e }, ...(mi ? { phases: [{ what: 'Run', start: s, km: mi * MI }] } : {}) }; };
const RUNS = [run('r1', 10, 24, 2), run('r2', 7, 23, 2), run('r3', 4, 22.5, 2), run('r4', 1, 21)];

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 320, height: 760 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  const pg = await ctx.newPage();
  await pg.clock.install({ time: NOW });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  const st = async () => { await pg.waitForTimeout(300); return pg.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}'), KEY); };
  await pg.waitForLoadState('networkidle');
  await pg.evaluate(([k, ws]) => { const s = JSON.parse(localStorage.getItem(k) || '{}'); s.workouts = ws; s.entries = [{ id: 'kg', kind: 'weight', at: new Date('2026-11-03T07:00:00').getTime(), kg: 80 }]; localStorage.setItem(k, JSON.stringify(s)); }, [KEY, RUNS]);

  // a past run: add its distance
  await pg.goto(APP + '#insights/training'); await pg.reload(); await pg.waitForSelector('.tp-cardio', { timeout: 8000 }).catch(() => {});
  const item = pg.locator('.tp-cardio-list li').first();
  check(`the last run, without a distance, offers one (${(await item.innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 90)})`, /Add the distance/.test(await item.innerText().catch(() => '')));
  await item.getByRole('button', { name: 'Add the distance' }).click();
  await item.getByLabel('Run: distance in miles').fill('2'); await pg.waitForTimeout(300);
  const row = (await item.locator('.phase-row').innerText()).replace(/\s+/g, ' ');
  check(`2 mi in 21 min: 10:30 a mile, the fastest yet — 45 s better (${row})`, /10:30 \/mi · 5\.7 mph/.test(row) && /Your fastest run yet — 45 s a mile better than your best/.test(row));
  const saved = (await st()).workouts.find((w) => w.id === 'r4');
  check(`saved on that run (${JSON.stringify(saved.phases)})`, saved.phases?.length === 1 && Math.abs(saved.phases[0].km - 2 * MI) < 0.001 && saved.phases[0].start === saved.startedAt);
  await item.screenshot({ path: OUT + 'cardiophases2-past.png' });
  await item.getByRole('button', { name: 'Done' }).click(); await pg.waitForTimeout(300);
  const card = (await pg.getByRole('article', { name: 'Run: pace and distance' }).innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(`the Run card has it: 4 runs, best 10:30 (${card.slice(0, 90)})`, /4 runs with a distance/.test(card) && /best 10:30/.test(card));

  // Today: the new best
  await pg.goto(APP + '#today'); await pg.waitForSelector('.t2-data', { timeout: 8000 }).catch(() => {});
  const today = (await pg.locator('.t2-data').innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(`Today: "New best" (${today})`, /New best\s*Run at 10:30 a mile — 45 s faster than your best before\./i.test(today));

  // the cardio after lifting, in phases
  const c0 = NOW + 50 * MIN;
  await pg.clock.setFixedTime(new Date(c0 + 10 * MIN)); await pg.goto(APP + '#workout');
  // written as harness seed() does — once the sync has settled, checked after the reload, again if it was lost
  for (let k = 0; k < 3; k++) {
    await pg.waitForLoadState('networkidle');
    // a set in it (a lifting session with none is put away after 30 minutes)
    await pg.evaluate(([k, w, set]) => { const s = JSON.parse(localStorage.getItem(k)); s.workouts = [...s.workouts.filter((x) => x.id !== w.id), w]; s.entries = [...s.entries.filter((e) => e.id !== set.id), set]; localStorage.setItem(k, JSON.stringify(s)); },
      [KEY, { id: 'L1', template: 'Upper A', startedAt: c0 - 15 * MIN, endedAt: null, plan: [{ name: 'Bench press', sets: 1, reps: 8, restSec: 90 }], cardio: { what: 'Stairmaster', startedAt: c0 } }, { id: 'set1', kind: 'set', at: c0 - 10 * MIN, workoutId: 'L1', exercise: 'Bench press', kg: 70, reps: 8 }]);
    await pg.reload(); await pg.waitForLoadState('networkidle'); await pg.waitForTimeout(200);
    if ((await st()).workouts.some((w) => w.id === 'L1')) break;
  }
  await pg.waitForSelector('.tile.cardio', { timeout: 8000 }).catch(() => {});
  await pg.locator('.tile.cardio').getByRole('group', { name: 'Next phase' }).getByRole('button', { name: 'Run' }).click(); await pg.waitForTimeout(300);
  const L1 = (await st()).workouts.find((w) => w.id === 'L1');
  check(`after lifting, "Next: Run" at 19:00: from the cardio's own start (${JSON.stringify(L1.phases?.map((p) => [p.what, (p.start - c0) / MIN]))})`, L1.phases?.length === 2 && L1.phases[0].start === c0 && Math.abs(L1.phases[1].start - (c0 + 10 * MIN)) < 2000);
  await pg.clock.setFixedTime(new Date(c0 + 30 * MIN)); await pg.reload(); await pg.waitForSelector('.tile.cardio');
  await pg.locator('.tile.cardio').getByRole('button', { name: 'Done', exact: true }).click(); await pg.waitForTimeout(300);
  await pg.locator('.tile.cardio').getByLabel('Run: distance in miles').fill('2'); await pg.waitForTimeout(300);
  const rows = (await pg.locator('.tile.cardio .phase-row').allInnerTexts()).map((t) => t.replace(/\s+/g, ' '));
  check(`Done: each phase's distance — Stairmaster 10 min, Run 20 min 2 mi at 10:00 a mile, the fastest yet (${rows.join(' | ')})`, rows.length === 2 && /^Stairmaster · 10 min stairs: its time and heart rate/.test(rows[0]) && /^Run · 20 min.*10:00 \/mi/.test(rows[1]) && /fastest run yet/.test(rows[1]));
  const L2 = (await st()).workouts.find((w) => w.id === 'L1');
  check(`saved: "Stairmaster → Run", the run's distance (${L2.cardio.what} · ${JSON.stringify(L2.phases.map((p) => [p.what, p.km && +p.km.toFixed(2)]))})`, L2.cardio.what === 'Stairmaster → Run' && L2.cardio.done === true && Math.abs(L2.phases[1].km - 2 * MI) < 0.001);
  check(`320: fits (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 320);
  await pg.locator('.tile.cardio').screenshot({ path: OUT + 'cardiophases2-lift.png' });
  // its calories, each at its own MET: 9 × 80 × 10/60 + 8 × 80 × 20/60 = 120 + 213 = 333
  await pg.goto(APP + '#insights/training'); await pg.waitForSelector('.tp-cardio', { timeout: 8000 }).catch(() => {});
  const last = (await pg.locator('.tp-cardio-list li').first().innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(`its calories, each phase at its own MET (${last.slice(0, 100)})`, /Stairmaster → Run/.test(last) && /~333 kcal/.test(last) && /after lifting/.test(last));
  console.log('errors: ' + JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH ' + e.message); process.exit(1); });
