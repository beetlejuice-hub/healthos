// Between check-ins: a month where the gym really lifts mood (bench fixture, +2.5, a month with no other finding) shows as a
// Noticed card on Insights, with its evidence; an empty account says what's missing instead.
const { chromium, APP, OUT, handle, rate } = require('./harness.cjs');
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
  // One check-in so far: Insights says what it still needs.
  await pg.goto(APP + '#today');
  await rate(pg, 'mood', 6); await pg.waitForTimeout(200);
  await pg.goto(APP + '#insights/connections'); await pg.waitForTimeout(400);
  check('one check-in: "still checking" says to rate a few times a day', /What changes how you feel during the day\?/.test(await pg.locator('body').innerText()));

  // Load the month (as if logged on this phone) and look again.
  await pg.evaluate((m) => { const k = 'healthos.v1:u-test'; const s = JSON.parse(localStorage.getItem(k) || '{}'); localStorage.setItem(k, JSON.stringify({ ...s, entries: m.entries, workouts: m.workouts })); }, month);
  await pg.reload(); await pg.waitForSelector('text=Settings', { timeout: 10000 }).catch(() => {});
  await pg.goto(APP + '#insights/connections'); await pg.waitForTimeout(600);
  const body = await pg.locator('body').innerText();
  check('Insights: the gym lifts mood, in words', /After the gym, your mood rises about \d\.\d points more than it otherwise does/.test(body));
  check('with its evidence: how often it held and the range', /gaps with the gym · \d+ of \d+ beat what was expected · 95% range/.test(body));
  check('and nothing else is claimed from this month', (body.match(/After (a meal|caffeine|a drink with alcohol)/g) || []).length === 0);
  check('says it allows for the rebound', /allowing for a low mood lifting by itself/.test(body));
  const card = pg.locator('text=After the gym').first();
  await card.scrollIntoViewIfNeeded().catch(() => {});
  await pg.screenshot({ path: OUT + 'between-insights.png', fullPage: false });
  console.log('errors:', JSON.stringify(errs));
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
