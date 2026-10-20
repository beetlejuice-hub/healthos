// Smart tracking and the overall strength line (PLAN 143; owner, 20 Oct: "Can we make it so workouts are smart, rep and kg
// tracking is smart and can we add more tracking to it so possibly a graph of my overall strength computed from kgs lifted
// and reps how its evolving? Make it smart"). 10 weeks of three lifts, planted +1 % a week: the Workout screen's line is up
// about 9 % and says "Getting stronger". Last DB bench session had reps to spare (12/12/11 against 8): today's suggestion
// jumps two steps. A 12-rep set today moves the next set up one step, saying why.
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
  await pg.evaluate(([k, T, D]) => {
    const s = JSON.parse(localStorage.getItem(k) || '{}'), entries = [], workouts = [];
    let seed = 5; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
    for (let d = 69; d >= 3; d -= 3.5) {
      const wk = (69 - d) / 7, id = 'h' + d, at = T - d * D;
      workouts.push({ id, template: 'Push', startedAt: at - 60e3, endedAt: at + 3600e3, plan: [] });
      for (const [ex, kg] of [['Bench press', 80], ['Squat', 100], ['Lat pulldown', 60]]) entries.push({ id: id + ex, kind: 'set', at, workoutId: id, exercise: ex, kg: Math.round(kg * 1.01 ** wk * (1 + r() / 100) * 2) / 2, reps: 8 });
    }
    // DB bench last time: reps to spare
    workouts.push({ id: 'db', template: 'Push', startedAt: T - 2 * D, endedAt: T - 2 * D + 3600e3, plan: [] });
    [12, 12, 11].forEach((reps, i) => entries.push({ id: 'db' + i, kind: 'set', at: T - 2 * D + i * 60e3, workoutId: 'db', exercise: 'DB bench press', kg: 40, reps }));
    s.entries = entries; s.workouts = workouts; localStorage.setItem(k, JSON.stringify(s));
  }, [KEY, T, D]);
  await pg.goto(APP + '#workout'); await pg.reload(); await pg.waitForSelector('.tile.strength');

  const card = pg.getByRole('region', { name: 'Overall strength' });
  const txt = (await card.innerText()).replace(/\s+/g, ' ');
  const pct = Number((txt.match(/([+−])(\d+\.\d) %/) || [])[2]) * ((txt.match(/([+−])\d/) || [])[1] === '−' ? -1 : 1);
  check(`the line: up about 9 % over 10 weeks (planted +1 % a week) — ${txt.slice(0, 160)}`, pct > 5 && pct < 13);
  check('…and the verdict: getting stronger, clear', /Getting stronger: about \+[01]\.\d % a week across 3 lifts/.test(txt));
  check('the chart and kg lifted a week are drawn', await card.getByRole('img', { name: /^Overall strength by week/ }).count() === 1 && await card.getByRole('img', { name: 'Kg lifted a week' }).count() === 1);
  await card.evaluate((el) => el.scrollIntoView({ block: 'center' })); await pg.waitForTimeout(150); await card.screenshot({ path: OUT + 'strength-card.png' });
  const wide = await pg.evaluate(() => document.documentElement.scrollWidth);
  check(`phone: nothing wider than the screen (${wide} px)`, wide <= 390);

  // a session: DB bench, reps to spare last time → two steps up
  await pg.evaluate(([k, T]) => { const s = JSON.parse(localStorage.getItem(k)); s.workouts.push({ id: 'w', template: 'Push', startedAt: T - 60e3, endedAt: null, plan: [{ name: 'DB bench press', sets: 3, reps: 8, restSec: 90 }] }); localStorage.setItem(k, JSON.stringify(s)); }, [KEY, T]);
  await pg.reload(); await pg.waitForSelector('.tile.cur');
  const skip = pg.getByRole('button', { name: 'Skip warm-up' }); if (await skip.count()) { await skip.click(); await pg.waitForTimeout(150); }
  const kgBox = pg.getByLabel('Weight in kg', { exact: true });
  const hint = async () => (await pg.locator('.tile.cur .hint').innerText()).replace(/\s+/g, ' ');
  check(`reps to spare last time (12/12/11 against 8): two steps up, 44 (${await kgBox.inputValue()} · ${await hint()})`, await kgBox.inputValue() === '44' && /reps to spare last time \(12\/12\/11 against 8\), so \+4 kg/.test(await hint()));
  // today's first set: 12 reps → the next set a step up, saying why
  const repsBox = pg.getByLabel('Reps', { exact: true }); await repsBox.fill('12');
  await pg.getByRole('button', { name: 'Log set' }).click(); await pg.waitForTimeout(250);
  check(`a 12-rep set: the next set moves up a step, and says why (${await kgBox.inputValue()} · ${await hint()})`, await kgBox.inputValue() === '46' && /Next set 46 kg: 12 reps at 44 kg — that was light, so a step up/.test(await hint()));
  const logged = (await st()).entries.filter((e) => e.workoutId === 'w' && !e.warmup);
  check(`what was done is kept as done (${JSON.stringify(logged.map((e) => [e.kg, e.reps]))})`, logged.length === 1 && logged[0].kg === 44 && logged[0].reps === 12);
  await pg.locator('.tile.cur').screenshot({ path: OUT + 'strength-adapt.png' });

  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
