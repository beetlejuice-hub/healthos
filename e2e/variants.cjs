// The same movement on other equipment (owner, 20 Oct: "On workouts can we have the exercises as like incline bench press
// and the i can choose wheter machine, bench w barbell, bemch w dumbbell etc? Idk if it changes anything tho"). Incline DB
// press, done before at 30 kg a hand; the bar version at 60. The row says Barbell · Dumbbell · Machine · Smith with
// Dumbbell on; Barbell switches today's exercise and the weight to the bar's own (each variant keeps its history); the set
// is logged as the barbell lift; once a working set is in, the row goes (no split sets). The saved day isn't changed.
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
  const st = async () => { await pg.waitForTimeout(400); return pg.evaluate(() => JSON.parse(localStorage.getItem('healthos.v1:u-test') || '{}')); };
  const set = (id, ago, exercise, kg, reps) => ({ id, kind: 'set', at: t - ago * D, workoutId: `old${ago}`, exercise, kg, reps });
  await pg.evaluate((s) => { const k = 'healthos.v1:u-test', o = JSON.parse(localStorage.getItem(k) || '{}'); Object.assign(o, s); localStorage.setItem(k, JSON.stringify(o)); }, {
    entries: [set('a', 7, 'Incline DB press', 30, 10), set('b', 7, 'Incline DB press', 30, 10), set('c', 14, 'Incline bench press', 60, 8), set('d', 14, 'Incline bench press', 60, 8)],
    templates: [{ id: 'up', name: 'Upper', exercises: [{ name: 'Incline DB press', sets: 3, reps: 10, restSec: 120 }, { name: 'Lat pulldown', sets: 3, reps: 10, restSec: 90 }] }],
    workouts: [{ id: 'w1', template: 'Upper', startedAt: t - 60e3, endedAt: null, plan: [{ name: 'Incline DB press', sets: 3, reps: 10, restSec: 120 }, { name: 'Lat pulldown', sets: 3, reps: 10, restSec: 90 }] }],
  });
  await pg.goto(APP + '#workout'); await pg.reload(); await pg.waitForSelector('.tile.cur');
  const skip = pg.getByRole('button', { name: 'Skip warm-up' }); if (await skip.count()) await skip.click();
  const row = pg.getByRole('group', { name: 'Incline press, on' });
  const labels = await row.getByRole('button').allInnerTexts();
  check(`the row: ${labels.join(' · ')}, Dumbbell on`, labels.join('|') === 'Barbell|Dumbbell|Machine|Smith' && await row.getByRole('button', { name: 'Incline DB press' }).getAttribute('aria-pressed') === 'true');
  const kg = () => pg.getByLabel('Weight in kg', { exact: true }).inputValue();
  const kgDb = await kg();
  await pg.locator('.tile.cur').screenshot({ path: OUT + 'variants.png' });
  // found by eye: "32.5" showed as "32" — the input cut it on a phone
  const inp = pg.getByLabel('Weight in kg', { exact: true });
  const fit = async (v) => { await inp.fill(v); return inp.evaluate((el) => el.scrollWidth <= el.clientWidth + 1); };
  const fits = { '32.5': await fit('32.5'), '100': await fit('100'), '102.5': await fit('102.5'), '8': await fit('8') };
  check(`every weight shows whole in its box on a phone (${JSON.stringify(fits)})`, Object.values(fits).every(Boolean));
  await inp.fill(kgDb);
  await row.getByRole('button', { name: 'Incline bench press' }).click(); await pg.waitForTimeout(200);
  const name = (await pg.locator('.tile.cur .ex b').innerText()).trim();
  check(`Barbell: today's exercise is the bar version (${name})`, name === 'Incline bench press' && await row.getByRole('button', { name: 'Incline bench press' }).getAttribute('aria-pressed') === 'true');
  const sk2 = pg.getByRole('button', { name: 'Skip warm-up' }); if (await sk2.count()) await sk2.click();
  const kgBar = await kg();
  check(`…and the weight is the bar's own, not the dumbbell's (${kgDb} → ${kgBar} kg)`, Number(kgDb) === 32 && Number(kgBar) >= 60); // 30 → 32 on a 2 kg dumbbell rack
  await pg.getByRole('button', { name: 'Log set' }).click(); await pg.waitForTimeout(200);
  const s = await st(), today = s.entries.filter((e) => e.kind === 'set' && e.workoutId === 'w1' && !e.warmup);
  check(`the set is logged as the barbell lift (${JSON.stringify(today.map((x) => [x.exercise, x.kg]))})`, today.length === 1 && today[0].exercise === 'Incline bench press' && today[0].kg === Number(kgBar));
  check('a working set is in: the row goes (no sets split across two lifts)', await pg.getByRole('group', { name: 'Incline press, on' }).count() === 0);
  check('the saved day still says Incline DB press — today only, like Swap', s.templates.find((x) => x.id === 'up').exercises[0].name === 'Incline DB press');
  check('an exercise with no other variant has no row', await (async () => { await pg.getByRole('button', { name: /Next|Lat pulldown/ }).first().click().catch(() => {}); await pg.waitForTimeout(200); return (await pg.locator('.tile.cur .ex b').innerText()).trim() !== 'Lat pulldown' || await pg.getByRole('group', { name: 'Lat pulldown, on' }).count() === 1; })());

  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
