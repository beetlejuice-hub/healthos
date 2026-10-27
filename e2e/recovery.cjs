// The recovery clock (PLAN 177, body lab 8; owner, 27 Oct: "YES"). 63 fake nights from the band; a night out every
// Saturday (4 beers, bed 02:00): HRV 32, resting HR 61, sleeping heart rate 64 against 54. With a walk the next morning
// (every other Sunday: 3,500 steps before noon against 400) the next night is back to usual; without, a night later.
// Sunday sessions lift 92 kg, the rest 100. Sunday 10:00 after the 9th: the card says bed 02:00, back tomorrow ~07:30
// (29.5 h, a time one of them took), the ring part-way, the hit against the usual, the walk named (~24 h sooner, 4 with,
// 4 without) and protein / coffee not, and the lifts lighter. Controls: a quiet Saturday has no card; 20:00 has none.
// Past nights out back by the first morning and this one not: said in words, not a ring at 100 %.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

const MIN = 60_000, HOUR = 3_600_000, D = 86_400_000;
const ymd = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
function world(lastOut, pastShrug = false) {
  const sleep = [], hr = [], hrv = {}, rhr = {}, steps = [], entries = [], workouts = [];
  let prev = 'normal', k = 0;
  for (let i = 62; i >= 0; i--) {
    const eve0 = new Date(2026, 9, 17 - i).getTime(), T = (h) => eve0 + h * HOUR; // the evening's day; the last is Sat 17 Oct
    const out = i === 0 ? lastOut : new Date(eve0).getDay() === 6;
    let bed = T(23.5), wake = T(31.5), sHr = 54, v = 50 + ((i * 7) % 5) - 2, r = 54 + ((i * 3) % 3) - 1;
    if (out) {
      bed = T(26); wake = T(33.5); sHr = 64; if (!(pastShrug && i > 0)) { v = 32; r = 61; }
      for (let j = 0; j < 4; j++) entries.push({ id: `b${i}-${j}`, kind: 'drink', at: T(21 + j), name: 'Beer', ml: 500, caffeineMg: 0, alcoholG: 20, kcal: 215 });
      const walk = k++ % 2 === 0;
      steps.push([T(24 + 10), 15, walk ? 3500 : 400]);
      for (let t = T(24 + 9.75); t < T(24 + 12); t += MIN) hr.push([t, 75, 73, 77]); // worn that morning, after getting up
      prev = walk ? 'out-walk' : 'out';
      // a session the day after: lighter
      workouts.push({ id: 'w' + i, template: 'Full', startedAt: T(24 + 17), endedAt: T(24 + 18) });
      for (let j = 0; j < 3; j++) entries.push({ id: `x${i}-${j}`, kind: 'set', at: T(24 + 17) + j * 3 * MIN, workoutId: 'w' + i, exercise: 'Squat', kg: 92, reps: 5 });
    } else if (prev === 'out' && !pastShrug) { v = 40; r = 58; prev = 'normal'; }
    else prev = 'normal';
    const onset = bed + 10 * MIN, up = wake + 5 * MIN, stages = [{ type: 'awake', start: bed, end: onset }];
    for (let t = onset, c = 0; t < wake - 1; c++) { const e = Math.min(wake, t + 90 * MIN), L = e - t; stages.push({ type: 'light', start: t, end: t + L * 0.45 }, { type: c < 2 ? 'deep' : 'light', start: t + L * 0.45, end: t + L * 0.7 }, { type: 'rem', start: t + L * 0.7, end: e }); t = e; }
    stages.push({ type: 'awake', start: wake, end: up });
    sleep.push({ id: 's' + i, start: bed, end: up, asleepMin: Math.round((wake - onset) / MIN), awakeMin: 10, toFallAsleepMin: 10, nap: false, stageMin: {}, stages });
    for (let t = bed - HOUR; t < up; t += 5 * MIN) { const x = t >= onset && t < wake ? sHr + ((t / (5 * MIN)) % 3) - 1 : 63; hr.push([t, x, x - 2, x + 2]); }
    hrv[ymd(up)] = v; rhr[ymd(up)] = r;
    const dow = new Date(eve0 + D).getDay(); // the morning's day
    if (!out && (dow === 1 || dow === 3 || dow === 5)) {
      workouts.push({ id: 'w' + i, template: 'Full', startedAt: T(24 + 18), endedAt: T(24 + 19) });
      for (let j = 0; j < 3; j++) entries.push({ id: `x${i}-${j}`, kind: 'set', at: T(24 + 18) + j * 3 * MIN, workoutId: 'w' + i, exercise: 'Squat', kg: 100, reps: 5 });
    }
  }
  return { hr: hr.sort((a, b) => a[0] - b[0]), sleep, hrv, rhr, steps, entries, workouts };
}

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  async function open(w, time, width = 390) {
    const NOW = new Date(time).getTime();
    const ctx = await b.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    await ctx.route('**/api/ai**', (rt) => rt.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' }));
    const asked = [];
    await ctx.route(/\/api\/band\//, (rt) => {
      const u = new URL(rt.request().url()), op = u.pathname.split('/').pop(), from = +u.searchParams.get('from'), to = +u.searchParams.get('to');
      const st = { connected: true, needsReconnect: false, connectedAt: NOW - 90 * D, lastSync: NOW - 3 * MIN, latest: w.hr.at(-1)[0], error: null, gapSec: 60 };
      const inR = (t) => t >= from && t <= to;
      if (op === 'data') asked.push(from);
      rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(op === 'data' ? { hr: w.hr.filter((m) => inR(m[0])), steps: w.steps.filter((s) => inR(s[0])), sleep: w.sleep.filter((x) => x.end >= from && x.start <= to), rhr: w.rhr, hrv: w.hrv, ...st } : st) });
    });
    const pg = await ctx.newPage();
    await pg.clock.install({ time: NOW });
    pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
    await pg.goto(APP);
    await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
    await pg.evaluate(([es, ws]) => { const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = es; s.workouts = ws; localStorage.setItem(k, JSON.stringify(s)); }, [w.entries, w.workouts]);
    await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('#feel');
    return { ctx, pg, asked };
  }
  const card = (pg) => pg.getByRole('region', { name: 'After last night' });

  // 1 · Sunday 10:00, the morning after the 9th Saturday out
  let { ctx, pg, asked } = await open(world(true), '2026-10-18T10:00:00');
  await card(pg).waitFor({ timeout: 15000 }).catch(() => {});
  // the past nights out come with the older weeks: wait for the factors
  await pg.waitForSelector('.rc [data-factor]', { timeout: 15000 }).catch(() => {});
  const t = (await card(pg).innerText().catch(() => '')).replace(/\s+/g, ' ');
  console.log('card:', t);
  check(`loads the older weeks for past nights out (from ${asked.map((f) => new Date(f).toISOString().slice(0, 10)).join(', ')})`, asked.some((f) => f <= new Date('2026-07-21').getTime()));
  check('heading: after last night, bed 02:00', /^After last night bed 02:00/i.test(t));
  check('back tomorrow ~07:30, in about 21–22 h, from 8 past nights out', /Back to your usual tomorrow ~07:30 in about 2[12] h typical for you, from 8 past nights out/.test(t));
  const done = +(await card(pg).getAttribute('data-done'));
  check(`the ring part-way: 8 h of 29.5 (${done}%)`, done === 27 && /27% of the way back/.test(t));
  check('the hit: HRV 32 against ~50; 4 beers are 4 drinks (not 5.7 standard ones)', /HRV 32 ms usual (4[89]|5[01])/.test(t) && /Drinks 4 logged/.test(t));
  check('the heart asleep: about +10 bpm against your usual nights', /\+(9|10|11) bpm on average/.test(t));
  const fs = await card(pg).locator('[data-factor]').evaluateAll((els) => els.map((e) => e.dataset.factor + ': ' + e.textContent));
  check(`a walk named, ~24 h sooner, 4 with / 4 without; protein and coffee not (${fs.join(' | ')})`, fs.length === 1 && /^walk: A walk before noon~24 h sooner · 4 with, 4 without$/.test(fs[0]));
  const lifts = +(await card(pg).locator('.rc-lifts').getAttribute('data-pct').catch(() => NaN));
  check(`lifts the day after: lighter (${lifts}%)`, lifts <= -5 && /your lifts ran \d+% lighter than your other sessions \(8 sessions\)/.test(t));
  check(`fits the phone (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
  await card(pg).evaluate((e) => e.scrollIntoView({ block: 'start' })); await card(pg).screenshot({ path: OUT + 'recovery.png' });
  // 20:00: the evening, the card's done for the day
  await pg.clock.setFixedTime(new Date('2026-10-18T20:05:00').getTime()); await pg.reload(); await pg.waitForSelector('#feel'); await pg.waitForTimeout(1500);
  check('20:05: no card', await card(pg).count() === 0);
  await ctx.close();

  // 2 · narrow: 320 px
  ({ ctx, pg } = await open(world(true), '2026-10-18T10:00:00', 320));
  await pg.waitForSelector('.rc [data-factor]', { timeout: 15000 }).catch(() => {});
  check(`320 px: no sideways scroll (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await card(pg).count() === 1 && await pg.evaluate(() => document.documentElement.scrollWidth) <= 320);
  await card(pg).screenshot({ path: OUT + 'recovery-320.png' });
  await ctx.close();

  // 3 · control: a quiet Saturday
  ({ ctx, pg } = await open(world(false), '2026-10-18T10:00:00'));
  await pg.waitForSelector('.rd', { timeout: 15000 }).catch(() => {}); await pg.waitForTimeout(1500);
  check('a quiet Saturday: no card', await card(pg).count() === 0);
  await ctx.close();

  // 4 · past nights out were back by the first morning; this one isn't: said in words, no ring at 100 %
  ({ ctx, pg } = await open(world(true, true), '2026-10-18T10:00:00'));
  await card(pg).waitFor({ timeout: 15000 }).catch(() => {}); await pg.waitForTimeout(1500);
  const n = (await card(pg).innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(`usually back by the morning, not this time: says so, no ring (${n.slice(0, 160)})`, /Your past nights out were usually back to usual by ~09:30 — this one isn't yet/.test(n) && await card(pg).locator('.rc-ring').count() === 0);
  await ctx.close();

  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
