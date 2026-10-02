// Workout, taken seriously (owner, 2 Oct): premade workouts; rest that keeps running when you leave;
// "set done" can't finish the workout; finishing shows a summary and asks; new bests are called out.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  const pg = await ctx.newPage();
  await pg.clock.install({ time: new Date('2026-10-02T18:00:00') });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  const st = () => pg.evaluate(() => JSON.parse(localStorage.getItem('healthos.v1:u-test') || '{}'));
  // Last week's push day: bench 60 × 8, 62.5 × 6.
  await pg.evaluate(() => { const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k) || '{}'), t = new Date('2026-09-25T18:00:00').getTime();
    s.workouts = [{ id: 'old', template: 'Push', startedAt: t, endedAt: t + 3600e3 }];
    s.entries = [{ id: 's1', kind: 'set', at: t + 60e3, workoutId: 'old', exercise: 'Bench press', kg: 60, reps: 8 }, { id: 's2', kind: 'set', at: t + 300e3, workoutId: 'old', exercise: 'Bench press', kg: 62.5, reps: 6 }];
    localStorage.setItem(k, JSON.stringify(s)); });
  await pg.goto(APP + '#workout'); await pg.reload(); await pg.waitForSelector('text=Premade workouts');

  // Premade: open Push / Pull / Legs, start Push once.
  await pg.getByRole('button', { name: /Push \/ Pull \/ Legs/ }).click();
  await pg.screenshot({ path: OUT + 'workout-premade.png' });
  await pg.locator('.prog-day', { hasText: 'Push' }).first().getByRole('button', { name: 'Start' }).click(); await pg.waitForTimeout(200);
  check('a premade day starts with its exercises', /Bench press/.test(await pg.locator('.tile.cur').innerText()) && /Lateral raise/.test(await pg.locator('.tile.plan').innerText()));

  // A new best, and rest that survives leaving the app.
  await pg.getByLabel('Weight in kg', { exact: true }).fill('65'); await pg.getByLabel('Reps', { exact: true }).fill('6');
  await pg.getByRole('button', { name: 'Log set' }).click(); await pg.waitForTimeout(150);
  check('65 × 6 beats last week → "New best"', /New best · 65 kg × 6 · est. 1RM 78 kg/.test(await pg.locator('.tile.cur').innerText()));
  check('rest starts at 2:30', /2:30/.test(await pg.locator('.tile.rest').innerText()));
  await pg.clock.setFixedTime(new Date('2026-10-02T18:01:00')); await pg.reload(); await pg.waitForSelector('.tile.rest');
  const r = await pg.locator('.tile.rest output').innerText();
  check(`closed the app for a minute: rest kept counting (${r})`, /^1:3\d$/.test(r));

  // Finish the bench sets; a fast second tap meant for "Log set" doesn't move you on.
  for (let k = 0; k < 3; k++) { await pg.getByRole('button', { name: 'Log set' }).click(); await pg.waitForTimeout(80); }
  await pg.getByRole('button', { name: /^Next: / }).click();
  check('an accidental second tap right after the last set does nothing', /Bench press/.test(await pg.locator('.tile.cur .ex').innerText()));
  await pg.clock.setFixedTime(new Date('2026-10-02T18:01:05'));
  await pg.getByRole('button', { name: /^Next: / }).click();
  check('a deliberate tap moves on', /Overhead press/.test(await pg.locator('.tile.cur .ex').innerText()));

  // Finishing asks, with a summary; "Keep going" goes back.
  await pg.getByRole('button', { name: 'Finish early…' }).click();
  const sheet = await pg.locator('.tile.finish').innerText();
  check(`the summary: sets, kg, the new best (${sheet.replace(/\n/g, ' ').slice(0, 80)}…)`, /\b4\b\s*sets/.test(sheet) && /new bests[\s\S]*Bench press/i.test(sheet));
  await pg.screenshot({ path: OUT + 'workout-finish.png' });
  await pg.getByRole('button', { name: 'Keep going' }).click();
  check('Keep going → back to the session, still open', (await st()).workouts.some((w) => w.endedAt === null) && await pg.getByRole('button', { name: 'Log set' }).count() === 1);

  // The last set of the last exercise: the big spot says "done", it's not a Finish button.
  await pg.evaluate(() => { const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k)); const w = s.workouts.find((x) => x.endedAt === null); w.plan = [{ name: 'Plank', sets: 1, reps: 1, restSec: 45 }]; localStorage.setItem(k, JSON.stringify(s)); });
  await pg.reload(); await pg.waitForSelector('.tile.cur');
  await pg.getByRole('button', { name: 'Log set' }).click(); await pg.waitForTimeout(100);
  const box = await pg.locator('.alldone').boundingBox();
  await pg.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await pg.waitForTimeout(150);
  check('after the last set, tapping the same spot again does not finish the workout', (await st()).workouts.some((w) => w.endedAt === null) && await pg.getByRole('button', { name: /^Finish workout/ }).count() === 1);
  await pg.getByRole('button', { name: 'Finish workout…' }).click(); await pg.getByRole('button', { name: 'Finish', exact: true }).click(); await pg.waitForTimeout(150);
  check('Finish → done, back to the list', (await st()).workouts.every((w) => w.endedAt !== null) && await pg.getByText('Premade workouts').count() === 1);

  // Make a program your split: asks first.
  await pg.getByRole('button', { name: /Upper \/ Lower/ }).click();
  await pg.getByRole('button', { name: 'Make this my split…' }).click();
  check('replacing the split says what goes', /Your 4 days \(Upper A, Lower A, Upper B, Lower B\) are replaced by these 4/.test(await pg.locator('.premade').innerText()));
  await pg.getByRole('button', { name: 'Replace my split' }).click(); await pg.waitForTimeout(150);
  check('the split is now Upper 1 … Lower 2', (await st()).templates.map((t) => t.name).join(',') === 'Upper 1,Lower 1,Upper 2,Lower 2');
  console.log('errors:', JSON.stringify(errs));
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
