// Rep ranges (PLAN 144; owner, 20 Oct: "do these" — the step after "Can we make it so workouts are smart, rep and kg tracking
// is smart"). In the day editor "8-12" makes a range; the day card says 3 × 8–12. Last time 40 × 10/9/9: today the same
// 40 kg, aiming for 10. A 12 is "✓ top". Every set at 12 last time → +2 kg and back to 8.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  const pg = await ctx.newPage();
  const T = new Date('2026-10-20T18:00:00').getTime(), D = 864e5;
  await pg.clock.install({ time: T });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  const KEY = 'healthos.v1:u-test', st = async () => { await pg.waitForTimeout(300); return pg.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}'), KEY); };
  const seed = (reps) => pg.evaluate(([k, T, D, reps]) => { const s = JSON.parse(localStorage.getItem(k) || '{}');
    s.templates = [{ id: 'up', name: 'Upper', exercises: [{ name: 'Lateral raise', sets: 3, reps: 10, restSec: 60 }] }];
    s.workouts = [{ id: 'old', template: 'Upper', startedAt: T - 3 * D, endedAt: T - 3 * D + 3600e3, plan: [] }];
    s.entries = reps.map((r, i) => ({ id: 'o' + i, kind: 'set', at: T - 3 * D + i * 60e3, workoutId: 'old', exercise: 'Lateral raise', kg: 40, reps: r }));
    localStorage.setItem(k, JSON.stringify(s)); }, [KEY, T, D, reps]);
  await seed([10, 9, 9]);
  await pg.goto(APP + '#workout'); await pg.reload(); await pg.waitForSelector('.dcard');

  // the editor: "8-12"
  await pg.getByRole('button', { name: 'Edit Upper' }).click();
  const box = pg.getByLabel('Reps for Lateral raise');
  await box.click(); await box.press('Control+a'); await pg.keyboard.type('8-12', { delay: 40 });
  check(`typed as a range, kept as typed (${await box.inputValue()})`, await box.inputValue() === '8-12');
  await pg.getByRole('button', { name: 'Save day' }).click(); await pg.waitForTimeout(200);
  const ex = (await st()).templates.find((t) => t.id === 'up').exercises[0];
  check(`saved as 8 to 12 (${JSON.stringify([ex.reps, ex.repsMax])})`, ex.reps === 8 && ex.repsMax === 12);
  const card = (await pg.locator('.dcard', { hasText: 'Upper' }).innerText()).replace(/\s+/g, ' ');
  check(`the day card: 3 × 8–12 (${card.slice(0, 120)})`, /Lateral raise 3 × 8–12/.test(card));

  // the session: 10/9/9 last time → same 40, aim for 10
  await pg.locator('.dcard', { hasText: 'Upper' }).getByRole('button', { name: /^Start/ }).first().click(); await pg.waitForSelector('.tile.cur');
  const skip = pg.getByRole('button', { name: 'Skip warm-up' }); if (await skip.count()) { await skip.click(); await pg.waitForTimeout(150); }
  const hint = async () => (await pg.locator('.tile.cur .hint').innerText()).replace(/\s+/g, ' ');
  const kg = () => pg.getByLabel('Weight in kg', { exact: true }).inputValue(), reps = () => pg.getByLabel('Reps', { exact: true }).inputValue();
  check(`inside the range: same 40 kg, aim one rep more — 10 (${await kg()} × ${await reps()} · ${await hint()})`, await kg() === '40' && await reps() === '10' && /10\/9\/9 last time, inside 8–12: same 40 kg, aim for 10 a set/.test(await hint()));
  check(`the planned sets say the range (${(await pg.locator('.tile.cur .set.todo').first().innerText()).replace(/\s+/g, ' ')})`, /40 × 10 \(8–12\)/.test(await pg.locator('.tile.cur .set.todo').first().innerText()));
  await pg.getByLabel('Reps', { exact: true }).fill('12'); await pg.getByRole('button', { name: 'Log set' }).click(); await pg.waitForTimeout(200);
  check(`a 12: "✓ top" (${(await pg.locator('.tile.cur .set').first().innerText()).replace(/\s+/g, ' ')})`, /✓ top/.test(await pg.locator('.tile.cur .set').first().innerText()));
  await pg.locator('.tile.cur').screenshot({ path: OUT + 'repranges.png' });

  // every set at the top last time → +2 kg, back to 8 (the newest session is the 12 logged above, synced back, or the seeded 12/12/12)
  await pg.getByRole('button', { name: /^Finish/ }).click(); await pg.getByRole('button', { name: 'Finish', exact: true }).click(); await pg.waitForTimeout(200);
  await seed([12, 12, 12]);
  await pg.evaluate(([k, T]) => { const s = JSON.parse(localStorage.getItem(k)); s.templates[0].exercises[0] = { name: 'Lateral raise', sets: 3, reps: 8, repsMax: 12, restSec: 60 };
    s.workouts.push({ id: 'w2', template: 'Upper', startedAt: T - 60e3, endedAt: null, plan: [{ name: 'Lateral raise', sets: 3, reps: 8, repsMax: 12, restSec: 60 }] }); localStorage.setItem(k, JSON.stringify(s)); }, [KEY, T]);
  await pg.reload(); await pg.waitForSelector('.tile.cur');
  const sk2 = pg.getByRole('button', { name: 'Skip warm-up' }); if (await sk2.count()) { await sk2.click(); await pg.waitForTimeout(150); }
  check(`every set reached 12: +2 kg and back to 8 (${await kg()} × ${await reps()} · ${await hint()})`, await kg() === '42' && await reps() === '8' && /every set reached 12, the top of 8–12 \((12\/12\/12|12)\), so \+2 kg and back to 8/.test(await hint()));
  const wide = await pg.evaluate(() => document.documentElement.scrollWidth);
  check(`phone: nothing wider than the screen (${wide} px)`, wide <= 390);

  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
