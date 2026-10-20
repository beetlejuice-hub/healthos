// Owner, 20 Oct, on workouts: (PLAN 140) "db bench press was logged w all kgs, not kg per dumbbel … it makes sense that it
// counts it overall but then dont put kg per dumbbell … lat raise was overall not per hand. So just fix all pls to make it
// matching"; (141) "Cant put things like 40,5 kg duh…pls fix"; (142) "When starting cardio kg tracker for strength workout
// should disappear". A Push with DB bench (his totals: 40 kg last time), lateral raise and goblet squat, cardio after.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  const pg = await ctx.newPage();
  const t = new Date('2026-10-20T18:00:00').getTime(), D = 864e5;
  await pg.clock.install({ time: t });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  const KEY = 'healthos.v1:u-test', st = async () => { await pg.waitForTimeout(300); return pg.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}'), KEY); };
  const plan = [{ name: 'DB bench press', sets: 2, reps: 8, restSec: 90 }, { name: 'Lateral raise', sets: 2, reps: 12, restSec: 60 }, { name: 'Goblet squat', sets: 2, reps: 10, restSec: 90 }];
  await pg.evaluate(([k, t, D, plan]) => { const s = JSON.parse(localStorage.getItem(k) || '{}');
    s.entries = [{ id: 'o1', kind: 'set', at: t - 4 * D, workoutId: 'old', exercise: 'DB bench press', kg: 40, reps: 8 }, { id: 'o2', kind: 'set', at: t - 4 * D + 1, workoutId: 'old', exercise: 'Lateral raise', kg: 16, reps: 12 }];
    s.workouts = [{ id: 'old', template: 'Push', startedAt: t - 4 * D - 60e3, endedAt: t - 4 * D + 3600e3, plan }, { id: 'w', template: 'Push', startedAt: t - 60e3, endedAt: null, plan, cardio: { what: '20 min stairmaster' } }];
    localStorage.setItem(k, JSON.stringify(s)); }, [KEY, t, D, plan]);
  await pg.goto(APP + '#workout'); await pg.reload(); await pg.waitForSelector('.tile.cur');
  const skip = async () => { const s = pg.getByRole('button', { name: 'Skip warm-up' }); if (await s.count()) { await s.click(); await pg.waitForTimeout(100); } };
  await skip();
  const lbl = async () => (await pg.locator('.steppers .lbl').first().innerText()).replace(/\s+/g, ' ');
  const kgBox = pg.getByLabel('Weight in kg', { exact: true });

  // 140: the total in his hands, with the pair to pick up
  const l1 = await lbl();
  check(`DB bench: "kg total", not "per dumbbell" — and the pair for the rack (${l1})`, /^kg total · 2 × \d/i.test(l1) && !/per dumbbell/i.test(l1));
  // 141: typed like on his phone, a key at a time
  await kgBox.click(); await kgBox.press('Control+a'); await pg.keyboard.type('40,5', { delay: 40 });
  check(`"40,5" stays "40,5" while typed (${await kgBox.inputValue()})`, await kgBox.inputValue() === '40,5');
  check(`…and the pair follows: 2 × 20.25 (${await lbl()})`, /2 × 20\.25/.test(await lbl()));
  await pg.locator('.tile.cur').screenshot({ path: OUT + 'workoutfix-db.png' });
  await pg.getByRole('button', { name: 'Log set' }).click(); await pg.waitForTimeout(200);
  const set = (await st()).entries.find((e) => e.kind === 'set' && e.workoutId === 'w' && !e.warmup);
  check(`logged as 40.5 kg (${set && set.kg})`, set && set.kg === 40.5);
  const vol = (await pg.locator('.tile', { hasText: 'Volume' }).first().innerText()).replace(/\s+/g, ' ');
  check(`kg lifted counts it once: 40.5 × 8 = 324, not 648 (${vol})`, /Volume 324 ?kg/i.test(vol));
  // the dot works too, and + still steps from there
  await kgBox.click(); await kgBox.press('Control+a'); await pg.keyboard.type('42.5', { delay: 40 });
  check(`a dot works too (${await kgBox.inputValue()})`, await kgBox.inputValue() === '42.5');

  await pg.locator('.tile.plan').getByRole('button', { name: 'Lateral raise' }).click(); await pg.waitForTimeout(200); await skip();
  const l2 = await lbl();
  check(`lateral raise: also the total, with its pair (${l2})`, /^kg total · 2 × \d/i.test(l2));
  await pg.locator('.tile.plan').getByRole('button', { name: 'Goblet squat' }).click(); await pg.waitForTimeout(200); await skip();
  await kgBox.click(); await kgBox.press('Control+a'); await pg.keyboard.type('24', { delay: 30 });
  const l3 = await lbl();
  check(`goblet squat, one dumbbell: the total, no "2 ×" (${l3})`, /^kg total$/i.test(l3));

  // 142: cardio started — the lifting steps aside; Done brings it back
  await pg.locator('.tile.plan').getByRole('button', { name: 'Start now' }).click(); await pg.waitForTimeout(200);
  check('cardio started: no set to log, no rest, no volume', await pg.locator('.tile.cur').count() === 0 && await pg.locator('.tile.rest').count() === 0 && await pg.locator('.tile', { hasText: 'Volume' }).count() === 0 && await kgBox.count() === 0);
  check('…its clock instead', await pg.locator('.tile.cardio.running .cardio-clock').count() === 1);
  await pg.screenshot({ path: OUT + 'workoutfix-cardio.png' });
  await pg.clock.setFixedTime(new Date(t + 21 * 60e3)); await pg.waitForTimeout(1100);
  await pg.locator('.tile.cardio').getByRole('button', { name: 'Done' }).click(); await pg.waitForTimeout(200);
  check('Done: the sets left are back', await pg.locator('.tile.cur').count() === 1 && await kgBox.count() === 1 && /✓ Done/.test(await pg.locator('.tile.cardio').innerText()));
  const wide = await pg.evaluate(() => document.documentElement.scrollWidth);
  check(`phone: nothing wider than the screen (${wide} px)`, wide <= 390);

  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
