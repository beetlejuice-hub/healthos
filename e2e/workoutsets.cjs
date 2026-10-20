// Sets the way the owner does them (PLAN 80; 13 Oct: "warm up plus 2-3 sets but i should be able to log another set").
// A new exercise starts on a warm-up (20 Oct), "Skip warm-up" one tap away; a warm-up is lighter, shown as W, never counted; after the planned sets the next
// exercise is suggested but "+ Set 4" sits beside it; once warming up is the habit on an exercise, it starts as a warm-up,
// and "Skip warm-up" is one tap.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  const pg = await ctx.newPage();
  let t = new Date('2026-10-13T18:00:00').getTime();
  await pg.clock.install({ time: t });
  const tick = async (ms = 1200) => { t += ms; await pg.clock.setFixedTime(t); };
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  const st = async () => { await pg.waitForTimeout(500); return pg.evaluate(() => JSON.parse(localStorage.getItem('healthos.v1:u-test') || '{}')); };
  const seed = (s) => pg.evaluate((s) => { const k = 'healthos.v1:u-test', o = JSON.parse(localStorage.getItem(k) || '{}'); Object.assign(o, s); localStorage.setItem(k, JSON.stringify(o)); }, s);
  const cur = () => pg.locator('.tile.cur');
  const kgNow = () => pg.getByLabel('Weight in kg', { exact: true }).inputValue();

  // 1 · a new exercise starts on a warm-up (owner, 20 Oct: "By default the warmup set should be first.."); skip it, and
  // "Warm-up first" brings it back; a warm-up, then the working sets
  await seed({ entries: [], workouts: [{ id: 'w1', template: 'Push', startedAt: t - 60e3, endedAt: null, plan: [{ name: 'Bench press', sets: 3, reps: 8, restSec: 90 }, { name: 'Overhead press', sets: 3, reps: 8, restSec: 90 }] }] });
  await pg.goto(APP + '#workout'); await pg.reload(); await pg.waitForSelector('.tile.cur');
  check('a new exercise starts on a warm-up, with "Skip warm-up" offered', await pg.getByRole('button', { name: 'Log warm-up' }).count() === 1 && await pg.getByRole('button', { name: 'Skip warm-up' }).count() === 1);
  await pg.getByRole('button', { name: 'Skip warm-up' }).click();
  check('skipped: a working set, "Warm-up first" offered', await pg.getByRole('button', { name: 'Log set' }).count() === 1 && await pg.getByRole('button', { name: 'Warm-up first' }).count() === 1);
  await pg.getByLabel('Weight in kg', { exact: true }).fill('60');
  await pg.getByRole('button', { name: 'Warm-up first' }).click();
  check(`"Warm-up first": the button says so and the weight halves (${await kgNow()} kg)`, await pg.getByRole('button', { name: 'Log warm-up' }).count() === 1 && await kgNow() === '30' && /Warm-up/.test(await cur().locator('.ex').innerText()));
  await pg.getByRole('button', { name: 'Log warm-up' }).click(); await tick();
  const w1 = (await st()).entries.filter((e) => e.kind === 'set');
  check(`the warm-up is saved as one (${JSON.stringify(w1.map((s) => [s.kg, s.reps, !!s.warmup]))})`, w1.length === 1 && w1[0].warmup === true && w1[0].kg === 30);
  check(`then back to the working sets: "Set 1 of 3" at the working weight (${await kgNow()} kg)`, /Set 1 of 3/.test(await cur().locator('.ex').innerText()) && await kgNow() === '60' && /W\s*30 × 10\s*warm-up/.test(await cur().locator('.sets').innerText()));
  for (let k = 0; k < 3; k++) { await pg.getByRole('button', { name: 'Log set' }).click(); await tick(); }
  // 2 · planned sets done: Next is suggested, "+ Set 4" right beside it
  check(`3 of 3 done: "Next: Overhead press" and "+ Set 4" side by side (${(await cur().locator('.ex').innerText()).replace(/\n/g, ' ')})`, await pg.getByRole('button', { name: 'Next: Overhead press' }).count() === 1 && await pg.getByRole('button', { name: '+ Set 4' }).count() === 1 && /3 of 3 done/.test(await cur().locator('.ex').innerText()));
  await cur().screenshot({ path: OUT + 'workoutsets.png' });
  await pg.getByRole('button', { name: '+ Set 4' }).click(); await tick();
  const work = (await st()).entries.filter((e) => e.kind === 'set' && !e.warmup);
  check(`"+ Set 4" logs a 4th set and stays on Bench press (${work.length} working sets; ${(await cur().locator('.ex').innerText()).replace(/\n/g, ' ')})`, work.length === 4 && /Bench press/.test(await cur().locator('.ex').innerText()) && await pg.getByRole('button', { name: '+ Set 5' }).count() === 1);
  check('the progress bar counts working sets only (4 lit, not 5)', await pg.locator('.prog i.on').count() === 4);
  await pg.getByRole('button', { name: 'Next: Overhead press' }).click(); await tick();
  check('Next moves on when you choose', /Overhead press/.test(await cur().locator('.ex').innerText()));
  // 3 · warming up is the habit on squats (2 of the last 3 sessions): it starts as a warm-up; "Skip warm-up" is one tap
  const d = (n) => new Date(`2026-10-${n}T18:00:00`).getTime();
  const old = (id, at, warm) => [...(warm ? [{ id: id + 'w', kind: 'set', at, workoutId: id, exercise: 'Squat', kg: 50, reps: 10, warmup: true }] : []), { id: id + 's', kind: 'set', at: at + 60e3, workoutId: id, exercise: 'Squat', kg: 100, reps: 5 }];
  await seed({ entries: [...(await st()).entries, ...old('a', d('06'), true), ...old('b', d('08'), false), ...old('c', d('10'), true)],
    workouts: [...(await st()).workouts.map((x) => ({ ...x, endedAt: x.endedAt ?? t })), { id: 'a', template: 'Legs', startedAt: d('06'), endedAt: d('06') + 3600e3 }, { id: 'b', template: 'Legs', startedAt: d('08'), endedAt: d('08') + 3600e3 }, { id: 'c', template: 'Legs', startedAt: d('10'), endedAt: d('10') + 3600e3 },
      { id: 'w2', template: 'Legs', startedAt: t, endedAt: null, plan: [{ name: 'Squat', sets: 3, reps: 5, restSec: 150 }] }] });
  await pg.reload(); await pg.waitForSelector('.tile.cur');
  check(`your habit on squats: it starts as a warm-up, about half your working weight (${await kgNow()} kg)`, await pg.getByRole('button', { name: 'Log warm-up' }).count() === 1 && ['50', '52.5'].includes(await kgNow()));
  await pg.getByRole('button', { name: 'Skip warm-up' }).click();
  check(`"Skip warm-up" (sometimes just 3): straight to set 1 at the working weight (${await kgNow()} kg)`, await pg.getByRole('button', { name: 'Log set' }).count() === 1 && /Set 1 of 3/.test(await cur().locator('.ex').innerText()) && Number(await kgNow()) >= 100);
  check(`last time ignores the warm-up (${(await cur().locator('.hint').innerText()).split('\n')[0]})`, /Last time: 100 × 5/.test(await cur().locator('.hint').innerText()));
  check(`fits the phone (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
