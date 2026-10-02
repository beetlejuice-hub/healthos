// Insights → Your week: waits for two weeks (says when), then this week vs last and the top connection.
const { chromium, APP, OUT, handle } = require('./harness.cjs');
const month = require('./fixtures/between-month.json');

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  const pg = await ctx.newPage();
  await pg.clock.install({ time: new Date('2026-10-02T09:00:00') });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  const load = (entries, workouts) => pg.evaluate(([e, w]) => { const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k) || '{}'); localStorage.setItem(k, JSON.stringify({ ...s, entries: e, workouts: w })); }, [entries, workouts]);

  // Three days of check-ins: not yet, and when.
  const recent = month.entries.filter((e) => e.kind === 'feel' && e.at > new Date('2026-09-29T00:00:00').getTime());
  await load(recent, []); await pg.reload(); await pg.waitForSelector('text=Settings');
  await pg.goto(APP + '#insights'); await pg.waitForTimeout(400);
  check('before two weeks: says when it starts', /Your week[\s\S]*Starts .*after two weeks of check-ins/.test(await pg.locator('.weekly').innerText()));

  // The whole month (the gym really lifts mood in it).
  await load(month.entries, month.workouts); await pg.reload(); await pg.waitForSelector('text=Settings');
  await pg.goto(APP + '#insights'); await pg.waitForTimeout(600);
  const wk = await pg.locator('.weekly').innerText();
  check('this week vs last for each feeling', /mood[\s\S]*was \d\.\d/i.test(wk) && /energy/i.test(wk));
  check('best and lowest time of day', /Mood was best in the \w+ \(\d\.\d\) and lowest in the \w+/.test(wk));
  check('top connection: the gym', /Clearest connection so far: after the gym your mood rises about \d\.\d points/.test(wk));
  await pg.locator('.weekly').screenshot({ path: OUT + 'weekly.png' });
  console.log('errors:', JSON.stringify(errs));
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
