// The game on Today (PLAN 203; owner, 10 Nov: "1 yes 2 yes" — weekly goals plus one week score, Today first). Six weeks
// planted (7 drinks a week, in bed 23:50 by the band, 140 g protein on Mon–Wed, creatine every day, 3 sessions), then this
// Monday (1 drink, in bed 23:20, 150 g, the stack, a session) and Tuesday so far (the stack, 82 g). Tue 21:40: after the
// check-in and For you (Today A's order kept), "Your week" (PLAN 204: the week you defend) — 70 of 70 left, level 1, last
// week kept 0; the five goals with what each can still take; the focus (bedtime, last week's weakest: 20 % there); the next move is
// tonight's bed; the race and you against everyone. Fits 320 and 390. Control: a new account — no card.
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
  const card = (pg) => pg.getByRole('region', { name: "This week's goals" });

  let { ctx, pg } = await open(390, world());
  await card(pg).waitFor({ timeout: 8000 }).catch(() => {});
  const c = card(pg);
  // after For you: Today A's order (the tiles, the log row, the check-in) stays (e2e hownow checks the check-in's place)
  const order = await pg.evaluate(() => { const w = document.querySelector('section.week'), f = document.querySelector('#feel'); return { after: !!w && !!f && (f.compareDocumentPosition(w) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0, feelY: Math.round(f?.getBoundingClientRect().y ?? 9999) }; });
  check('after the check-in and For you', order.after && await pg.evaluate(() => { const w = document.querySelector('section.week'), y = document.querySelector('.foryou, [aria-label^="For you"]'); return !y || (y.compareDocumentPosition(w) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0; }));
  const words = (await c.locator('.wk-top').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  check(`70 to defend, level, last week (${await c.getAttribute('data-points')} · ${await c.getAttribute('data-level')} · ${words})`,
    await c.getAttribute('data-points') === '70' && await c.getAttribute('data-level') === '1' && words.toLowerCase() === '70 of 70 left your week · level 1 keep 50 by sunday and you level up 2 of 7 days in · last week you kept 0');
  const goals = (await c.locator('.wk-goals li').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
  check(`the five goals, each so far and what it can still take (${JSON.stringify(goals)})`, JSON.stringify(goals) === JSON.stringify([
    '5 drinks or fewer · 1 so far 4 to spare', 'In bed by 23:30 · 1 of 5 2 spare nights', '140 g protein · 1 of 4 3 spare days', 'The stack, every day · 2 of 6 1 spare day', '3 sessions · 1 of 3 4 spare days']));
  const days = await c.locator('[data-goal="bed"] .wk-days i').evaluateAll((is) => is.map((i) => i.className || '-'));
  check(`bed: Monday hit, tonight open (${days.join(' ')})`, days.join(' ') === 'hit - - - - - -');
  const focus = c.locator('.wk-focus');
  check(`the focus: last week's weakest, bedtime — 20 % there (${(await focus.innerText().catch(() => '')).replace(/\s+/g, ' ')})`, await focus.getAttribute('data-focus') === 'bed' && await focus.getAttribute('data-left') === '80' && /^This week's focus: bedtime · 20 % there$/i.test((await focus.innerText()).replace(/\s+/g, ' ').trim()));
  check(`the next move is the focus's: tonight's bed (${await c.locator('.wk-move').innerText().catch(() => '')})`, (await c.locator('.wk-move').innerText().catch(() => '')).replace(/\s+/g, ' ') === 'Next: in bed by 23:30 tonight makes it 2 of 5.');
  check(`the race and you vs everyone (${await c.locator('.wk-vs').innerText().catch(() => '')})`, /^The race · level with last week's you You vs everyone · resting heart rate 11 under the average of 92,457 Fitbit wearers$/.test((await c.locator('.wk-vs').innerText().catch(() => '')).replace(/\s+/g, ' ')));
  check('no stake owed, no treat (none set)', await c.locator('.wk-owed').count() === 0 && await c.locator('.wk-treat').count() === 0);
  check('the game page link', await c.getByRole('link', { name: /Your card, the race and the season/ }).count() === 1);
  check(`390: fits (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
  await c.screenshot({ path: OUT + 'week-390.png' });
  await ctx.close();

  ({ ctx, pg } = await open(320, world()));
  await card(pg).waitFor({ timeout: 8000 }).catch(() => {});
  check(`320: fits (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 320);
  await card(pg).screenshot({ path: OUT + 'week-320.png' }).catch(() => {});
  await ctx.close();

  ({ ctx, pg } = await open(390, null));
  check('control: a new account — no card', await card(pg).count() === 0);
  await ctx.close();
  console.log('errors: ' + JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH ' + e.message); process.exit(1); });
