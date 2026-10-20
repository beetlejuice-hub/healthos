// Cardio on the Training page (PLAN 146; owner, 20 Oct: "Cardio is important for my weight loss" — "do these"). Three weeks
// of stairmaster and bike, the band's heart rate planted at 142 on the latest: the card says this week's minutes against
// the 3 weeks before, draws 8 weeks, and lists the last sessions with their heart rate and kcal (his 81 kg weigh-in).
// And with only cardio logged (no lifting yet), the page still shows it.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

const MIN = 60_000, D = 864e5, T = new Date('2026-10-20T20:00:00').getTime();
const last = new Date('2026-10-20T07:00:00').getTime();
const hr = [];
for (let t = last - 30 * MIN; t < last + 70 * MIN; t += MIN) { const v = t >= last && t < last + 40 * MIN ? 142 : 64; hr.push([t, v, v - 3, v + 6]); }

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  await ctx.route(/\/api\/band\//, (rt) => {
    const u = new URL(rt.request().url()), op = u.pathname.split('/').pop(), from = +u.searchParams.get('from'), to = +u.searchParams.get('to');
    const st = { connected: true, needsReconnect: false, connectedAt: T - 40 * D, lastSync: T, latest: hr.at(-1)[0], error: null, gapSec: 60 };
    rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(op === 'data' ? { hr: hr.filter((m) => m[0] >= from && m[0] <= to), steps: [], sleep: [], rhr: {}, hrv: {}, ...st } : st) });
  });
  const pg = await ctx.newPage();
  await pg.clock.install({ time: T });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  const cardio = (id, what, start, min) => ({ id, template: 'Cardio', kind: 'cardio', startedAt: start, endedAt: start + min * MIN, cardio: { what, startedAt: start, done: true, at: start + min * MIN } });
  const seed = (lifting) => pg.evaluate(([lifting, ws, T, D]) => { const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k) || '{}');
    s.workouts = [...ws, ...(lifting ? [{ id: 'l1', template: 'Push', startedAt: T - 2 * D, endedAt: T - 2 * D + 3600e3, plan: [] }] : [])];
    s.entries = [{ id: 'kg', kind: 'weight', at: T - D, kg: 81 }, ...(lifting ? [{ id: 's1', kind: 'set', at: T - 2 * D, workoutId: 'l1', exercise: 'Bench press', kg: 80, reps: 8 }] : [])];
    localStorage.setItem(k, JSON.stringify(s)); }, [lifting, [
      cardio('c1', 'Stairmaster', T - 16 * D, 30), cardio('c2', 'Bike', T - 9 * D, 45), cardio('c3', 'Stairmaster', T - 3 * D, 30),
      cardio('c4', 'Bike', T - 1 * D - 13 * 3600e3, 35), cardio('c5', 'Stairmaster', last, 40)], T, D]);

  await seed(true);
  await pg.goto(APP + '#insights/training'); await pg.reload(); await pg.waitForSelector('.tp', { timeout: 15000 });
  const card = pg.getByRole('region', { name: 'Cardio' });
  await card.waitFor({ timeout: 8000 }).catch(() => {});
  await pg.waitForFunction(() => /avg 142 bpm/.test(document.querySelector('.tp-cardio')?.textContent || ''), null, { timeout: 8000 }).catch(() => {});
  const txt = (await card.innerText().catch(() => '')).replace(/\s+/g, ' ');
  // this week (from Mon 19): bike 35 + stairmaster 40 = 75 min, 2 sessions; kcal 35×7×81/60 + 40×9×81/60 = 331 + 486 = 817
  check(`this week: 75 min, 2 sessions, about 817 kcal (${txt.slice(0, 140)})`, /75 min this week · 2 sessions · about 817 kcal/.test(txt));
  // the 3 weeks before: 30 (wk of 28 Sep: none… ) — weeks of 28 Sep, 5 Oct, 12 Oct: 30 (4 Oct is Sun → wk 28 Sep), 45, 30 → usual 35
  check(`…against his usual (${(txt.match(/usual \d+ min a week/) || [''])[0]})`, /usual 35 min a week/.test(txt));
  check('8 weeks drawn', await card.getByRole('img', { name: 'Cardio minutes a week, the last 8 weeks' }).count() === 1);
  check(`the last sessions, the newest with the band's heart rate (${(await card.locator('li').first().innerText().catch(() => '')).replace(/\s+/g, ' ')})`, /^Stairmaster Tue 20 Oct · 40 min · avg 142 bpm · ~486 kcal( |$)/.test((await card.locator('li').first().innerText().catch(() => '')).replace(/\s+/g, ' ')) && await card.locator('li').count() === 3);
  await card.evaluate((el) => el.scrollIntoView({ block: 'center' })).catch(() => {}); await pg.waitForTimeout(150); await card.screenshot({ path: OUT + 'cardio-training.png' }).catch(() => {});
  const wide = await pg.evaluate(() => document.documentElement.scrollWidth);
  check(`phone: nothing wider than the screen (${wide} px)`, wide <= 390);

  // heart-rate zones (owner: "go"): no age yet → it says what it needs; age 31 in Settings → max 186; the planted 142 bpm
  // is 76 % of max → all 40 min in Z3
  check(`no age yet: the zones say what they need (${(await card.locator('.zones-need').first().innerText().catch(() => '')).trim()})`, /add your age \(or max heart rate\) in Settings/.test(await card.locator('.zones-need').first().innerText().catch(() => '')));
  await pg.goto(APP + '#settings'); await pg.getByLabel('Age', { exact: true }).fill('31'); await pg.waitForTimeout(300);
  check(`Settings: max heart rate offered from the age (${await pg.getByLabel('Max heart rate').getAttribute('placeholder')})`, /about 186 from your age/.test(await pg.getByLabel('Max heart rate').getAttribute('placeholder')));
  await pg.goto(APP + '#insights/training'); await pg.waitForSelector('.tp-cardio');
  await pg.waitForFunction(() => /Z3/.test(document.querySelector('.tp-cardio li')?.textContent || ''), null, { timeout: 8000 }).catch(() => {});
  const z = (await pg.locator('.tp-cardio li').first().locator('.zones').innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(`the newest session's zones: Z3 40 min, max 186 from his age (${z})`, /^Z3 40 min max 186 bpm, from your age$/.test(z));
  await pg.locator('.tp-cardio').screenshot({ path: OUT + 'cardio-zones.png' }).catch(() => {});

  // only cardio logged, no lifting yet: the page still shows it
  await seed(false); await pg.reload(); await pg.waitForSelector('.tp', { timeout: 15000 }).catch(() => {});
  check('cardio only: the Training page shows the cardio card', await pg.getByRole('region', { name: 'Cardio' }).count() === 1);

  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
