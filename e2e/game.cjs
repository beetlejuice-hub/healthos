// The game page (PLAN 204; owner, 10 Nov: "I fucking love the idea of all of these … keep it professional too"). The
// week suite's six weeks (last week bad: 7 drinks, never in bed by 23:30 — 0 kept), Tue 10 Nov 21:40. #game: the player
// card (resting heart rate 54 → HRT 94; asleep 7 h 10 → REC 79; discipline 0 of 70 kept → 35; no VO2, no lifts: "—";
// overall 69, Silver, Gold at 75); the boss (the Goblin, 80 HP); the race (level with last week's you, both on 70; the
// best week the first, 70 all week); season 1 Night Shift, week 2 of 6. The stake: picked and locked. A stake owed from
// last week shows on Today until it's done; the treat shows on Today only on a day you've trained (control: a day without).
// Fits 320. Control: a new account — the page says it starts once there's data.
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
  async function open(width, w, settings, hash = '#game') {
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
    await pg.evaluate(([k, w, set]) => { const s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = w ? w.entries : []; s.workouts = w ? w.workouts : []; s.supplements = w ? w.supplements : []; s.goals = { ...(s.goals || {}), kcal: 2400, p: 140, c: 250, f: 80 }; s.settings = { ...(s.settings || {}), ...set }; localStorage.setItem(k, JSON.stringify(s)); }, [KEY, w, settings || {}]);
    await pg.goto(APP + hash); await pg.reload(); await pg.waitForTimeout(1500);
    return { ctx, pg };
  }
  const flat = (t) => t.replace(/\s+/g, ' ').trim();

  let { ctx, pg } = await open(390, world());
  await pg.getByRole('region', { name: 'Your player card' }).waitFor({ timeout: 8000 }).catch(() => {});
  const card = pg.getByRole('region', { name: 'Your player card' });
  const stats = await card.locator('.gm-stats > div').evaluateAll((ds) => ds.map((d) => `${d.dataset.stat} ${d.querySelector('b').textContent}`));
  check(`the card's stats, no title won yet (${stats.join(', ')} · ${flat(await card.locator('.gm-name').innerText().catch(() => ''))})`, stats.join(', ') === 'END —, HRT 94, REC 79, PAC —, STR —, DSC 35' && /^you · level 1$/i.test(flat(await card.locator('.gm-name').innerText())));
  check(`overall 69, Silver, Gold at 75 (${await card.getAttribute('data-ovr')} ${await card.getAttribute('data-tier')} · ${flat(await card.locator('.gm-ovr').innerText().catch(() => ''))})`,
    await card.getAttribute('data-ovr') === '69' && await card.getAttribute('data-tier') === 'Silver' && /Gold at 75/i.test(await card.locator('.gm-ovr').innerText()));
  check(`the weakest and what moves it (${flat(await card.locator('.gm-note').innerText().catch(() => ''))})`, flat(await card.locator('.gm-note').innerText().catch(() => '')) === 'Weakest: Discipline — holding more of your 70 moves this one.');
  const boss = pg.getByRole('region', { name: "This week's boss" });
  check(`the boss (${flat(await boss.innerText().catch(() => ''))})`, await boss.getAttribute('data-boss') === 'bed' && /The 2 AM Goblin/i.test(await boss.innerText()) && /In bed by 23:30 hits it · 2 spare nights/.test(flat(await boss.innerText())) && /HP 80/.test(flat(await boss.innerText())) && /Next up, once this one's down: The Beer Troll/.test(await boss.innerText()));
  const race = pg.getByRole('region', { name: 'The race' });
  check(`the race (${flat(await race.innerText().catch(() => ''))})`, /Level with last week's you/i.test(await race.innerText()) && /level with your best week \(from 28 Sept?, 70 kept\)/.test(flat(await race.innerText())) && await race.locator('polyline').count() === 3);
  const season = pg.getByRole('region', { name: 'The season' });
  check(`the season (${flat(await season.locator('h3').innerText().catch(() => ''))})`, /Season 1 · Night Shift/i.test(flat(await season.locator('h3').innerText())) && /Week 2 of 6/.test(await season.innerText()));
  // the stake: picked, locked in
  const stake = pg.getByRole('region', { name: 'Your stake' });
  await stake.getByRole('button', { name: '100 burpees on Sunday' }).click();
  await stake.getByRole('button', { name: 'Lock it in' }).click();
  await pg.waitForTimeout(300);
  check(`the stake, locked in (${flat(await stake.innerText())})`, /Under 50 → 100 burpees on Sunday/i.test(flat(await stake.innerText())) && await stake.getByRole('button', { name: 'Lock it in' }).count() === 0);
  const saved = await pg.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}').settings?.stakes, KEY);
  check(`saved for this week (${JSON.stringify(saved)})`, JSON.stringify(saved) === JSON.stringify({ '2026-11-09': { what: '100 burpees on Sunday' } }));
  // the treat
  const treat = pg.getByRole('region', { name: 'Only on gym days' });
  await treat.getByLabel('Your gym-day treat').fill('the next episode of Severance');
  await treat.getByRole('button', { name: 'Save' }).click();
  await pg.waitForTimeout(300);
  check('the treat saved', await pg.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}').settings?.treat, KEY) === 'the next episode of Severance');
  check(`390: fits (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
  await pg.screenshot({ path: OUT + 'game-390.png', fullPage: true });
  // control for the treat: no session today, so Today doesn't show it
  await pg.goto(APP + '#today'); await pg.waitForTimeout(1200);
  const wk = pg.getByRole('region', { name: "This week's goals" });
  check('control: no session today — no treat on Today', await wk.locator('.wk-treat').count() === 0);
  await ctx.close();

  // a stake owed from last week (0 kept), and a session today: both on Today
  const w2 = world(); w2.workouts.push({ id: 'wtoday', template: 'Upper A', startedAt: at(TODAY, 17 * 60), endedAt: at(TODAY, 18 * 60) });
  ({ ctx, pg } = await open(390, w2, { stakes: { '2026-11-02': { what: 'No coffee on Monday' } }, treat: 'the next episode of Severance' }, '#today'));
  const c = pg.getByRole('region', { name: "This week's goals" });
  await c.waitFor({ timeout: 8000 }).catch(() => {});
  check(`a stake owed (${flat(await c.locator('.wk-owed').innerText().catch(() => ''))})`, /^You owe: No coffee on Monday\. Last week ended under 50\./.test(flat(await c.locator('.wk-owed').innerText().catch(() => ''))));
  check(`the treat on a day you trained (${flat(await c.locator('.wk-treat').innerText().catch(() => ''))})`, flat(await c.locator('.wk-treat').innerText().catch(() => '')) === 'Trained today — the next episode of Severance is yours.');
  await c.getByRole('button', { name: 'Done it' }).click(); await pg.waitForTimeout(300);
  check('done it: the stake goes', await c.locator('.wk-owed').count() === 0 && await pg.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}').settings?.stakes?.['2026-11-02']?.paid, KEY) === true);
  await ctx.close();

  ({ ctx, pg } = await open(320, world()));
  await pg.getByRole('region', { name: 'Your player card' }).waitFor({ timeout: 8000 }).catch(() => {});
  check(`320: fits (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 320);
  await pg.screenshot({ path: OUT + 'game-320.png', fullPage: true });
  await ctx.close();

  ({ ctx, pg } = await open(390, null));
  check('control: a new account — the game starts once there is data', /The game starts once the app has a few weeks of you/.test(await pg.locator('.gm').innerText().catch(() => '')));
  await ctx.close();
  console.log('errors: ' + JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH ' + e.message); process.exit(1); });
