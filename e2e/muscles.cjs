// The muscle map (owner, 2 Oct): a figure whose muscles fill in the more you train them.
const { chromium, APP, OUT, handle } = require('./harness.cjs');
(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  const pg = await ctx.newPage();
  await pg.clock.install({ time: new Date('2026-10-02T12:00:00') });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  await pg.goto(APP + '#workout'); await pg.waitForTimeout(200);
  check('empty: says it fills in once you train', /Log a workout and your muscles fill in here/.test(await pg.locator('.mm').innerText()));
  const fillOf = (name) => pg.locator(`.mm-fig path[aria-label^="${name}:"]`).first().getAttribute('fill');
  const emptyChest = await fillOf('Chest');
  // This week: 12 bench sets (chest full), 4 squats (quads light); 3 weeks ago lots of deadlifts.
  await pg.evaluate(() => { const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k) || '{}'), now = new Date('2026-10-02T12:00:00').getTime(), D = 864e5; const es = [];
    for (let i = 0; i < 12; i++) es.push({ id: 'b' + i, kind: 'set', at: now - 2 * D + i * 6e4, workoutId: 'w1', exercise: 'Bench press', kg: 60, reps: 8 });
    for (let i = 0; i < 4; i++) es.push({ id: 'q' + i, kind: 'set', at: now - 1 * D + i * 6e4, workoutId: 'w2', exercise: 'Squat', kg: 80, reps: 5 });
    for (let i = 0; i < 10; i++) es.push({ id: 'd' + i, kind: 'set', at: now - 20 * D + i * 6e4, workoutId: 'w3', exercise: 'Deadlift', kg: 120, reps: 5 });
    s.entries = es; s.workouts = [{ id: 'w1', template: 'Upper A', startedAt: now - 2 * D, endedAt: now - 2 * D + 36e5 }, { id: 'w2', template: 'Lower A', startedAt: now - D, endedAt: now - D + 36e5 }, { id: 'w3', template: 'Lower B', startedAt: now - 20 * D, endedAt: now - 20 * D + 36e5 }];
    localStorage.setItem(k, JSON.stringify(s)); });
  await pg.reload(); await pg.waitForSelector('.mm');
  const chest = await fillOf('Chest'), quads = await fillOf('Quads'), glutes = await fillOf('Glutes');
  check(`chest full, quads partly, glutes barely (7 days): ${chest} · ${quads} · ${glutes}`, /100%/.test(chest) && /var\(--gym\) [3-6]\d%/.test(quads) && chest !== emptyChest);
  await pg.locator('.mm-fig path[aria-label^="Chest:"]').first().click();
  check('tap a muscle → its numbers', /Chest · 12 hard sets in the last 7 days · in the growth range/.test(await pg.locator('.mm-say').innerText()));
  await pg.locator('.mm').scrollIntoViewIfNeeded(); await pg.locator('.mm').screenshot({ path: OUT + 'muscles.png' });
  await pg.getByRole('button', { name: '4 weeks' }).click();
  check('4 weeks shows the weekly average (deadlifts 3 weeks ago + squats: (10 + 2) / 4 = 3)', /^Glutes: 3 hard sets$/.test(await pg.locator('.mm-fig path[aria-label^="Glutes:"]').first().getAttribute('aria-label')));
  console.log('errors:', JSON.stringify(errs)); await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
