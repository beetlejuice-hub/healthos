// The typo guard (PLAN 145; owner, 20 Oct: "things like i lifted 315 kg per hand - possible misstype from 31,5" — "do
// these"). A lateral raise at ~31 kg: typing 315 asks "Did you mean 31.5?", and Use keeps 31.5. Today's weigh-in after
// 84.6: 48.6 asks; Change it, 84.8 logs. In Log, a real 70 is asked without a fix and kept when he says so. Never blocks.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  const pg = await ctx.newPage();
  const T = new Date('2026-10-20T08:00:00').getTime(), D = 864e5;
  await pg.clock.install({ time: T });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  const KEY = 'healthos.v1:u-test', st = async () => { await pg.waitForTimeout(300); return pg.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}'), KEY); };
  await pg.evaluate(([k, T, D]) => { const s = JSON.parse(localStorage.getItem(k) || '{}');
    s.entries = [{ id: 'wt', kind: 'weight', at: T - D, kg: 84.6 }, ...[0, 1, 2, 3, 4, 5].map((i) => ({ id: 'l' + i, kind: 'set', at: T - (6 - i) * D, workoutId: 'o' + Math.floor(i / 2), exercise: 'Lateral raise', kg: 30 + (i % 2), reps: 12 }))];
    s.workouts = [0, 1, 2].map((j) => ({ id: 'o' + j, template: 'Upper', startedAt: T - (6 - 2 * j) * D - 60e3, endedAt: T - (6 - 2 * j) * D + 3600e3, plan: [] }))
      .concat([{ id: 'w', template: 'Upper', startedAt: T - 60e3, endedAt: null, plan: [{ name: 'Lateral raise', sets: 3, reps: 12, restSec: 60 }] }]);
    localStorage.setItem(k, JSON.stringify(s)); }, [KEY, T, D]);

  // a set: 315 for 31.5
  await pg.goto(APP + '#workout'); await pg.reload(); await pg.waitForSelector('.tile.cur');
  const skip = pg.getByRole('button', { name: 'Skip warm-up' }); if (await skip.count()) { await skip.click(); await pg.waitForTimeout(150); }
  const kgBox = pg.getByLabel('Weight in kg', { exact: true });
  await kgBox.click(); await kgBox.press('Control+a'); await pg.keyboard.type('315', { delay: 30 });
  await pg.getByRole('button', { name: 'Log set' }).click(); await pg.waitForTimeout(200);
  const g = pg.locator('.tile.cur .guard');
  check(`315 kg: asked once, with the likely fix (${(await g.innerText().catch(() => '')).replace(/\s+/g, ' ')})`, /315 kg — far above your best on this \(31 kg\)\. Did you mean 31\.5 kg\?/.test(await g.innerText().catch(() => '')));
  check('…nothing logged yet', !(await st()).entries.some((e) => e.workoutId === 'w'));
  await g.screenshot({ path: OUT + 'guard-set.png' });
  await g.getByRole('button', { name: 'Use 31.5 kg' }).click(); await pg.waitForTimeout(250);
  const set = (await st()).entries.find((e) => e.workoutId === 'w');
  check(`Use 31.5: logged as 31.5 (${set && set.kg})`, set && set.kg === 31.5 && await g.count() === 0);

  // a weigh-in: 48.6 for 84.6 (digits swapped; under 20 or over 400 can't be tapped at all) — asked; Change it; then the right one
  await pg.goto(APP + '#today'); await pg.waitForSelector('.weighin');
  const wbox = pg.locator('.weighin').getByLabel('Weight in kg'), logKg = pg.locator('.weighin').getByRole('button', { name: 'Log kg' });
  await wbox.fill('48.6'); await logKg.click(); await pg.waitForTimeout(200);
  const wg = pg.locator('.guard');
  check(`48.6 kg after 84.6: asked (${(await wg.innerText().catch(() => '')).replace(/\s+/g, ' ')})`, /48\.6 kg — down 43 % from your last weigh-in \(84\.6 kg\)\. Is that right\?/.test(await wg.innerText().catch(() => '')));
  check('…nothing logged yet', !(await st()).entries.some((e) => e.kind === 'weight' && e.at >= T - 60e3));
  await wg.screenshot({ path: OUT + 'guard-weight.png' });
  await wg.getByRole('button', { name: 'Change it' }).click(); await wbox.fill('84.8'); await logKg.click(); await pg.waitForTimeout(250);
  check('Change it, 84.8: logged without asking', (await st()).entries.some((e) => e.kind === 'weight' && e.kg === 84.8) && await pg.locator('.guard').count() === 0);
  // Log → Weight: a real big change (70), asked without a fix, kept when he says so
  await pg.goto(APP + '#log'); await pg.getByRole('button', { name: 'Body' }).click().catch(() => {}); await pg.waitForTimeout(200);
  const lk = pg.locator('.card', { hasText: 'Weight' }).first();
  await lk.getByLabel('kg').first().fill('70'); await lk.getByRole('button', { name: 'Log weight' }).click(); await pg.waitForTimeout(200);
  check(`Log, 70 kg after 84.8: asked, no fix offered (${(await lk.locator('.guard').innerText().catch(() => '')).replace(/\s+/g, ' ')})`, /Is that right\?/.test(await lk.locator('.guard').innerText().catch(() => '')) && await lk.locator('.guard').getByRole('button', { name: /^Use/ }).count() === 0);
  await lk.locator('.guard').getByRole('button', { name: 'Keep 70 kg' }).click(); await pg.waitForTimeout(250);
  check('Keep: logged as typed', (await st()).entries.some((e) => e.kind === 'weight' && e.kg === 70));
  const wide = await pg.evaluate(() => document.documentElement.scrollWidth);
  check(`phone: nothing wider than the screen (${wide} px)`, wide <= 390);

  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
