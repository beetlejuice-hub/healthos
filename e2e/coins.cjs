// Coin-flip experiments (PLAN 177, body lab 1; owner, 27 Oct: "like this"; slow supplements "not sure for these" → daily
// coins only for what acts the same night). 1 · Body lab starts "Screens off at 22:30"; Today shows today's coin, Followed
// is kept; the next day the strip has day 1, never tomorrow's coin; a day not answered is asked the morning after, and
// "No" marks it not followed. 2 · A supplement coin logs into the stack (taken on heads, skipped on tails). 3 · A run
// that ended yesterday, falling asleep 8 min on heads nights vs 18 on tails: Today says it worked, opens the result, then
// goes; the Body lab table has both. Control: the same run with no difference says "no clear change".
const { chromium, APP, OUT, handle } = require('./harness.cjs');

const MIN = 60_000, HOUR = 3_600_000, D = 86_400_000, KEY = 'healthos.v1:u-test';
const ymd = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
// lib/coin's coins, the same maths: the test plants by side
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function sidesOf(seed, days) {
  const r = rng(seed), h = r() < 0.5 ? Math.floor(days / 2) : Math.ceil(days / 2), a = [...Array(h).fill('heads'), ...Array(days - h).fill('tails')];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const DONE = { id: 'done1', kind: 'screens', name: 'Screens off at 22:30', question: 'Does screens off at 22:30 help you fall asleep?', heads: 'Screens off at 22:30', tails: 'Screens as usual', outcomes: ['latency', 'asleep', 'deep', 'energy'], start: '2026-10-05', days: 21, seed: 12345 };
function band(plant) {
  const sides = sidesOf(DONE.seed, DONE.days), sleep = [], hr = [], hrv = {}, rhr = {};
  for (let k = 0; k < 22; k++) {
    const eve0 = new Date(2026, 9, 5 + k).getTime(), T = (h) => eve0 + h * HOUR, side = sides[k];
    const lat = (plant && side === 'heads' ? 8 : 18) + ((k * 7) % 5) - 2, bed = T(23), onset = bed + lat * MIN, wake = T(31), up = wake + 5 * MIN;
    sleep.push({ id: 'n' + k, start: bed, end: up, asleepMin: Math.round((wake - onset) / MIN), awakeMin: 0, toFallAsleepMin: lat, nap: false, stageMin: {},
      stages: [{ type: 'awake', start: bed, end: onset }, { type: 'light', start: onset, end: onset + 3 * HOUR }, { type: 'deep', start: onset + 3 * HOUR, end: onset + 4.3 * HOUR }, { type: 'light', start: onset + 4.3 * HOUR, end: wake }, { type: 'awake', start: wake, end: up }] });
    for (let t = bed; t < up; t += 5 * MIN) hr.push([t, 55, 53, 57]);
    hrv[ymd(up)] = 50; rhr[ymd(up)] = 54;
  }
  return { sleep, hr, hrv, rhr };
}

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  async function open(time, { width = 390, coins = [], supplements = [], bandData = null } = {}) {
    const NOW = new Date(time).getTime();
    const ctx = await b.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    await ctx.route('**/api/ai**', (rt) => rt.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' }));
    if (bandData) await ctx.route(/\/api\/band\//, (rt) => {
      const u = new URL(rt.request().url()), op = u.pathname.split('/').pop(), from = +u.searchParams.get('from'), to = +u.searchParams.get('to');
      const st = { connected: true, needsReconnect: false, connectedAt: NOW - 60 * D, lastSync: NOW - 3 * MIN, latest: bandData.hr.at(-1)[0], error: null, gapSec: 300 };
      rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(op === 'data' ? { hr: bandData.hr.filter((m) => m[0] >= from && m[0] <= to), steps: [], sleep: bandData.sleep.filter((x) => x.end >= from && x.start <= to), rhr: bandData.rhr, hrv: bandData.hrv, ...st } : st) });
    });
    const pg = await ctx.newPage();
    await pg.clock.install({ time: NOW });
    pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
    await pg.goto(APP);
    await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
    await pg.evaluate(([k, coins, supplements]) => { const s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = [{ id: 'f1', kind: 'feel', at: Date.now() - 86_400_000, energy: 6 }]; s.workouts = []; s.supplements = supplements; s.ai = { ...(s.ai || {}), coins }; localStorage.setItem(k, JSON.stringify(s)); }, [KEY, coins, supplements]);
    await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('#feel'); await pg.waitForTimeout(300);
    return { ctx, pg };
  }
  const store = (pg) => pg.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
  const coinCard = (pg) => pg.getByRole('region', { name: "Today's coin" });
  const text = async (l) => (await l.innerText().catch(() => '')).replace(/\s+/g, ' ');
  const at = async (pg, t, hash = '#today') => { await pg.clock.setFixedTime(new Date(t).getTime()); await pg.goto(APP + hash); await pg.reload(); await pg.waitForSelector('#feel, .inst'); await pg.waitForTimeout(400); };

  // 1 · screens: start, follow, the next days
  let { ctx, pg } = await open('2026-10-27T09:00:00');
  await at(pg, '2026-10-27T09:00:00', '#insights/lab');
  const lab = pg.locator('[data-card="coins"]');
  check(`Body lab offers coins for what acts the same night (${await lab.locator('.coin-start button b').allInnerTexts()})`, (await lab.locator('.coin-start button b').allInnerTexts()).join() === 'Coffee cutoff,Screens off at 22:30');
  await lab.getByRole('button', { name: /Screens off at 22:30/ }).click(); await pg.waitForTimeout(300);
  let s = await store(pg);
  check(`started: one run, from today, 21 days (${JSON.stringify((s.ai.coins || []).map((c) => [c.name, c.start, c.days]))})`, s.ai.coins?.length === 1 && s.ai.coins[0].start === '2026-10-27' && s.ai.coins[0].days === 21);
  check(`Body lab: day 1 of 21, sealed till Tue 17 Nov, no numbers (${await text(lab.locator('[data-running]'))})`, /Screens off at 22:30: day 1 of 21 · result sealed until Tue 17 Nov/.test(await text(lab.locator('[data-running]'))) && await lab.locator('.coin-res').count() === 0 && await lab.locator('.coin-start').count() === 0);
  const seed = s.ai.coins[0].seed, sides = sidesOf(seed, 21);
  await at(pg, '2026-10-27T09:00:00');
  let t = await text(coinCard(pg));
  check(`Today: today's coin, what it says (${t.slice(0, 120)})`, new RegExp(`^[HT] Today's coin · day 1 of 21 ${sides[0] === 'heads' ? 'Heads — screens off at 22:30' : 'Tails — screens as usual'}`, 'i').test(t) && await coinCard(pg).getAttribute('data-side') === sides[0]);
  await coinCard(pg).getByRole('button', { name: 'Followed the coin' }).click(); await pg.waitForTimeout(300);
  s = await store(pg);
  check(`Followed kept on today (${JSON.stringify(s.ai.coins[0].did)})`, s.ai.coins[0].did?.['2026-10-27'] === sides[0] && /Followed ✓/.test(await text(coinCard(pg))));
  check(`fits the phone (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
  await coinCard(pg).screenshot({ path: OUT + 'coin-today.png' });
  await at(pg, '2026-10-28T09:00:00');
  const cells = await coinCard(pg).locator('.coin-days i').allInnerTexts();
  check(`day 2: yesterday answered — not asked; the strip has days 1–2, never tomorrow's (${cells.slice(0, 4).join(',')}…)`, /day 2 of 21/i.test(await text(coinCard(pg))) && await coinCard(pg).locator('.coin-y').count() === 0 && cells.length === 21 && cells[0] === (sides[0] === 'heads' ? 'H' : 'T') && cells[1] === (sides[1] === 'heads' ? 'H' : 'T') && cells.slice(2).every((x) => x === ''));
  await at(pg, '2026-10-29T08:30:00');
  const y = await text(coinCard(pg).locator('.coin-y'));
  check(`day 3: day 2 not answered — asked (${y})`, new RegExp(`^Yesterday · ${sides[1]}: ${sides[1] === 'heads' ? 'screens off at 22:30' : 'screens as usual'}\\? Yes No$`).test(y));
  await coinCard(pg).locator('.coin-y').getByRole('button', { name: 'No' }).click(); await pg.waitForTimeout(300);
  s = await store(pg);
  check(`"No": day 2 kept as not followed, struck in the strip (${s.ai.coins[0].did['2026-10-28']})`, s.ai.coins[0].did['2026-10-28'] === (sides[1] === 'heads' ? 'tails' : 'heads') && await coinCard(pg).locator('.coin-days i').nth(1).getAttribute('class').then((c) => /off/.test(c)) && await coinCard(pg).locator('.coin-y').count() === 0);
  await ctx.close();

  // 2 · a supplement coin goes into the stack's log
  const mg = { id: 'mg', name: 'Magnesium', dose: '400 mg', slot: 'evening', at: 21 * 60 + 30, active: true };
  ({ ctx, pg } = await open('2026-10-27T20:30:00', { supplements: [mg] }));
  await at(pg, '2026-10-27T20:30:00', '#insights/lab');
  await pg.locator('[data-card="coins"]').getByRole('button', { name: /Magnesium at night/ }).click(); await pg.waitForTimeout(300);
  s = await store(pg);
  const mSide = sidesOf(s.ai.coins[0].seed, 21)[0];
  await at(pg, '2026-10-27T20:30:00');
  await coinCard(pg).getByRole('button', { name: mSide === 'heads' ? 'Took it' : 'Skipped it' }).click(); await pg.waitForTimeout(300);
  s = await store(pg);
  const tick = s.entries.filter((e) => e.kind === 'supp' && e.suppId === 'mg').map((e) => e.status);
  check(`magnesium coin (${mSide}): logged in the stack as ${mSide === 'heads' ? 'taken' : 'skipped'} (${tick})`, tick.join() === (mSide === 'heads' ? 'taken' : 'skipped') && /Followed ✓/.test(await text(coinCard(pg))));
  await ctx.close();

  // 3 · a finished run: planted, then control
  for (const plant of [true, false]) {
    ({ ctx, pg } = await open('2026-10-27T09:00:00', { width: plant ? 320 : 390, coins: [DONE], bandData: band(plant) }));
    await pg.waitForTimeout(800);
    const done = pg.getByRole('region', { name: 'Coin-flip result' });
    const d = await text(done);
    if (plant) {
      check(`done, planted: Today says it worked, falling asleep heads vs tails (${d})`, /^Coin-flip · done Screens off at 22:30: worked for you Falling asleep: ([6-9]|1[01])(\.\d)? on heads days vs (1[6-9]|20)(\.\d)? on tails \((clear|likely)\)\. See the result$/i.test(d));
      check(`320 px: no sideways scroll (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 320);
      await done.getByRole('button', { name: 'See the result' }).click(); await pg.waitForTimeout(800);
      const res = pg.locator('[data-coin="done1"]');
      const rt = await text(res);
      check(`opens the Body lab result: the table, both sides, how sure, days counted (${rt.slice(0, 200)})`, /#insights\/lab/.test(pg.url()) && await res.getAttribute('data-verdict') === 'better' && /Falling asleep, min \(decides\) ?(clear|likely)/.test(rt) && /21 days counted · 21 not answered, counted as followed/.test(rt));
      await res.screenshot({ path: OUT + 'coin-result.png' });
      s = await store(pg);
      await at(pg, '2026-10-27T09:05:00');
      check('seen: Today\'s result card is gone', !!s.ai.coins[0].seen && await pg.getByRole('region', { name: 'Coin-flip result' }).count() === 0);
    } else check(`done, control: "no clear change" (${d})`, /Screens off at 22:30: no clear change/.test(d));
    await ctx.close();
  }

  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
