// Experiments that end themselves (PLAN 225; owner, 17 Nov: "5"). "No drinks for 14 days", started 10 days ago: food
// logged every day and no drinks, so the log answers each day — the morning doesn't ask; energy ~5 in the 14 days
// before and ~8 since, so on its daily look the app finds it already clear and ends it early: Today's strip says "it
// helped — clear by day N, so it ended there". Control: the same with energy flat — still running, day 11 of 14,
// nothing asked about the days the log answered.
const { chromium, APP, OUT, handle, forYou } = require('./harness.cjs');

const D = 86_400_000, NOW = new Date('2026-11-17T09:00:00').getTime(), KEY = 'healthos.v1:u-test';
const START = '2026-11-07';
const world = (lift) => {
  const es = [];
  for (let k = 24; k >= 1; k--) {
    const day0 = new Date(NOW - k * D); day0.setHours(0, 0, 0, 0); const t = day0.getTime(), during = k <= 10;
    es.push({ id: 'f' + k, kind: 'food', at: t + 13 * 36e5, name: 'e2e lunch', grams: 500, macros: { kcal: 2200, p: 120, c: 250, f: 70 } });
    es.push({ id: 'm' + k, kind: 'feel', at: t + 18 * 36e5, energy: (during && lift ? 8 : 5) + (k % 3 === 0 ? 1 : k % 3 === 1 ? -1 : 0), mood: 6 });
  }
  return es;
};

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  const pg = await ctx.newPage();
  await pg.clock.install({ time: NOW });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  const seed = (lift) => pg.evaluate(([k, es, start]) => { const s = JSON.parse(localStorage.getItem(k) || '{}');
    s.entries = [...(s.entries || []).filter((e) => !/^[fm]\d+$/.test(e.id)), ...es];
    s.ai = { ...(s.ai || {}), experiments: [{ id: 'x', name: 'No drinks for 14 days', how: 'No alcohol, everything else as usual', days: 14, measure: 'energy', start }] };
    localStorage.setItem(k, JSON.stringify(s)); }, [KEY, world(lift), START]);
  const xp = () => pg.evaluate((k) => JSON.parse(localStorage.getItem(k)).ai.experiments[0], KEY);
  const strip = async () => { await pg.reload(); await forYou(pg, 'experiment'); await pg.waitForSelector('.xp-strip', { timeout: 5000 }).catch(() => {}); await pg.clock.runFor(1500);
    return (await pg.locator('.xp-strip li').first().innerText().catch(() => '')).replace(/\s+/g, ' '); };

  // control first: flat energy — running, its days answered by the log
  await seed(false); await pg.goto(APP + '#today');
  let line = await strip(), x = await xp();
  check(`flat energy: still running (${line})`, /day 11 of 14/.test(line) && !x.early && !x.ended);
  check(`the log answered its days — 10 of them, none asked (${Object.keys(x.auto || {}).length})`, Object.keys(x.auto || {}).length === 10 && Object.values(x.auto).every((v) => v === true));
  check('no "did you do it?" card', await pg.locator('.xpdid').count() === 0);

  // planted: energy up 3 since the start — clear before its 14 days, so it ends itself
  await seed(true); await pg.goto(APP + '#today');
  line = await strip(); x = await xp();
  check(`energy up since the start: ended early (${x.early})`, !!x.early && x.ended === x.early);
  check(`the strip says it in plain words (${line})`, /No drinks for 14 days it helped — clear by day \d+, so it ended there/.test(line));
  await pg.locator('.xp-strip').screenshot({ path: OUT + 'xpauto.png' });
  check(`fits the phone (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
