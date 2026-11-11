// How you compare (PLAN 206; owner, 11 Nov: "i like the comparisons … the whole gamification idea is not that good"). The
// week suite's six weeks with the band (resting heart rate 54 this morning, ~7 h 10 asleep a night). Tue 21:40 on Today,
// where the game's week card was: resting heart ahead of about 90 % of 92,457 Fitbit wearers, sleep ahead of about 70 %;
// endurance, steps and strength say what they need; each bar with the study's average. "You vs everyone" under it (PLAN
// 211): where you stand out (resting heart) and where you're behind (a beer every evening: 140 g a week) with a fix. No game anywhere: no points, levels,
// focus or #game. Fits 320 and 390. Control: a new account without the band — no card.
const { chromium, APP, OUT, handle, tables } = require('./harness.cjs');

const KEY = 'healthos.v1:u-test', MIN = 60_000, H = 3_600_000;
const at = (day, min) => new Date(`${day}T00:00:00`).getTime() + min * MIN;
const addDays = (day, n) => { const d = new Date(`${day}T12:00:00`); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const NOW = at('2026-11-10', 21 * 60 + 40), MON = '2026-11-09', TODAY = '2026-11-10';

function world() {
  const entries = [], workouts = [], sleep = []; let n = 0;
  for (let d = '2026-09-28'; d < MON; d = addDays(d, 1)) {
    const wd = (new Date(`${d}T12:00:00`).getDay() + 6) % 7;
    entries.push({ id: `d${n++}`, kind: 'drink', at: at(d, 20 * 60), name: 'Beer', ml: 500, caffeineMg: 0, alcoholG: 20, kcal: 215 });
    entries.push({ id: `f${n++}`, kind: 'food', at: at(d, 12 * 60), name: 'Meal', grams: 400, macros: { kcal: 700, p: wd < 3 ? 150 : 60, c: 60, f: 20 } });
    entries.push({ id: `s${n++}`, kind: 'supp', at: at(d, 8 * 60), suppId: 'crea', status: 'taken' });
    sleep.push({ id: `n${d}`, start: at(d, 23 * 60 + 50), end: at(addDays(d, 1), 7 * 60 + 30), asleepMin: 430, awakeMin: 20, toFallAsleepMin: 10, nap: false, stageMin: {}, stages: [] });
    if (wd === 0 || wd === 2 || wd === 4) workouts.push({ id: `w${n++}`, template: 'Upper A', startedAt: at(d, 18 * 60), endedAt: at(d, 19 * 60) });
  }
  entries.push({ id: 'dm', kind: 'drink', at: at(MON, 20 * 60), name: 'Beer', ml: 500, caffeineMg: 0, alcoholG: 20, kcal: 215 },
    { id: 'fm', kind: 'food', at: at(MON, 12 * 60), name: 'Meal', grams: 400, macros: { kcal: 700, p: 150, c: 60, f: 20 } },
    { id: 'sm', kind: 'supp', at: at(MON, 8 * 60), suppId: 'crea', status: 'taken' }, { id: 'st', kind: 'supp', at: at(TODAY, 8 * 60), suppId: 'crea', status: 'taken' },
    { id: 'ft', kind: 'food', at: at(TODAY, 9 * 60), name: 'Breakfast', grams: 300, macros: { kcal: 500, p: 82, c: 40, f: 15 } });
  sleep.push({ id: 'nmon', start: at(MON, 23 * 60 + 20), end: at(TODAY, 7 * 60), asleepMin: 430, awakeMin: 20, toFallAsleepMin: 10, nap: false, stageMin: {}, stages: [] });
  workouts.push({ id: 'wmon', template: 'Upper A', startedAt: at(MON, 18 * 60), endedAt: at(MON, 19 * 60) });
  return { entries, workouts, sleep, supplements: [{ id: 'crea', name: 'Creatine', dose: '5 g', slot: 'morning', at: 480, active: true }] };
}

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  async function open(width, w) {
    tables.entries.clear(); tables.docs.clear();
    const ctx = await b.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    await ctx.route('**/api/ai**', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' }));
    await ctx.route(/\/api\/band\//, (r) => {
      const op = new URL(r.request().url()).pathname.split('/').pop();
      const st = { connected: !!w, needsReconnect: false, connectedAt: NOW - 60 * 864e5, lastSync: NOW - MIN, latest: NOW - 2 * MIN, error: null, gapSec: 60 };
      r.fulfill({ contentType: 'application/json', body: JSON.stringify(op === 'data' ? { hr: [], steps: [], sleep: w ? w.sleep : [], rhr: { [TODAY]: 54 }, hrv: {}, ...st } : st) });
    });
    const pg = await ctx.newPage();
    await pg.clock.install({ time: NOW });
    pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
    await pg.goto(APP);
    await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
    await pg.evaluate(([k, w]) => { const s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = w ? w.entries : []; s.workouts = w ? w.workouts : []; s.supplements = w ? w.supplements : []; s.goals = { ...(s.goals || {}), kcal: 2400, p: 140, c: 250, f: 80 }; localStorage.setItem(k, JSON.stringify(s)); }, [KEY, w]);
    await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('.t2-head'); await pg.waitForTimeout(1500);
    return { ctx, pg };
  }
  const card = (pg) => pg.getByRole('region', { name: 'How you compare' });

  let { ctx, pg } = await open(390, world());
  await card(pg).waitFor({ timeout: 8000 }).catch(() => {});
  const c = card(pg);
  const rows = (await c.locator('li').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
  check(`the rows (${JSON.stringify(rows)})`, JSON.stringify(rows) === JSON.stringify([
    'Endurance needs VO2 max', 'Resting heart 54 bpm · average 65 ahead of about 90 % · 92,457 Fitbit wearers', 'Sleep 7 h 10 a night · average 6 h 47 ahead of about 70 % · about 120,000 Fitbit wearers', 'Steps needs steps', 'Strength needs 3 sessions of a lift']));
  // PLAN 211 (owner, 11 Nov: "add a couple outstanding items, good and very bad, and fixes"): a beer every evening is 140 g a week
  const st = (await c.locator('.vs-stand').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  check(`you vs everyone: where you stand out (${st.slice(0, 140)})`, await c.locator('.vs-i.good').count() === 1 && /Where you stand out Resting heart 54 bpm lower than about 90 % of 92,457 Fitbit wearers \(average 65\)/i.test(st));
  check(`…where you're behind, with a fix (${st.slice(140, 400)})`, await c.locator('.vs-i.bad').count() === 1 && /Where you're behind Drinks 10 a week \(140 g\) 1\.3× the UK's low-risk line of 14 units \(112 g\) a week Fix: Under 112 g a week/i.test(st));
  // PLAN 214 (owner, 11 Nov: "do 1, 2"): a stand-out opens the trend behind it…
  await c.locator('.vs-i.bad[data-key="alc"]').click(); await pg.waitForTimeout(900);
  check(`tapping "Drinks 10 a week" opens its trend, lit (${await pg.evaluate(() => location.hash)})`, (await pg.evaluate(() => location.hash)) === '#insights/week' && await pg.locator('[data-trend="drinks"].tw-flash').count() === 1 && await pg.locator('[data-trend="drinks"]').isVisible());
  // …and the AI sees what the card says
  await pg.goto(APP + '#settings'); await pg.waitForSelector('#ai');
  await pg.getByRole('button', { name: 'What the AI sees about me' }).click();
  const seen = await pg.locator('.ctx').innerText().catch(() => '');
  check(`the AI sees the stand-outs and the fix (${(seen.match(/## What the app's own maths found[^\n]*\n(- [^\n]*\n?){1,3}/) || [''])[0].slice(0, 200)})`, /## What the app's own maths found/.test(seen) && /- Stands out against everyone: Resting heart 54 bpm — lower than about 90 % of 92,457 Fitbit wearers \(average 65\)\./.test(seen) && /- Behind against everyone: Drinks 10 a week \(140 g\) — 1\.3× the UK's low-risk line of 14 units \(112 g\) a week\. The app's fix: Under 112 g a week/.test(seen));
  await pg.goto(APP + '#today'); await pg.waitForSelector('.t2-head'); await pg.waitForTimeout(800);
  const order = await pg.evaluate(() => { const w = document.querySelector('section.vsall'), f = document.querySelector('#feel'); return !!w && !!f && (f.compareDocumentPosition(w) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0; });
  check('after the check-in (Today A\'s order kept)', order);
  const body = await pg.locator('main').innerText();
  check('no game anywhere on Today', !/of 70 left|level \d|This week's focus|spare night|Your card, the race/i.test(body) && await pg.locator('a[href="#game"]').count() === 0);
  check(`390: fits (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
  await c.screenshot({ path: OUT + 'howcompare-390.png' });
  await ctx.close();

  ({ ctx, pg } = await open(320, world()));
  await card(pg).waitFor({ timeout: 8000 }).catch(() => {});
  check(`320: fits (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 320);
  await ctx.close();

  ({ ctx, pg } = await open(390, null));
  check('control: a new account without the band — no card', await card(pg).count() === 0);
  await ctx.close();
  console.log('errors: ' + JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH ' + e.message); process.exit(1); });
