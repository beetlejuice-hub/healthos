// The reads' day around their items (owner, 3 Nov: "Morning and night read should include a bit more, based on what
// happened to me, how i slept, how i felt thoughout the day, some funny or interesting or helpful advice it should give
// me, w a summary"). A fake AI writes the morning read at 07:40 and the evening read at 21:30, through the app's own
// path. Morning: the summary shows folded; opened, "Last night" and "Yesterday" lines and "One more thing" after the
// items. Evening: "Last night" and "Today" lines and its fun line. Control: an older read without them shows as it did —
// no empty rows. 320 px fits.
const { chromium, APP, OUT, handle, forYou } = require('./harness.cjs');

const KEY = 'healthos.v1:u-test', T = (h, m = 0) => new Date(2026, 10, 3, h, m).getTime();
const item = (n) => ({ type: 'pattern', topic: `t-${n}`, title: `Item ${n}: beer nights cost you sleep`, text: '6.1 after drinks vs 7.2 without.', tip: 'Water between beers tonight', sure: 'yours', measure: 'sleep' });
const DIGEST = { greeting: 'Morning, Arnold.', summary: 'Six and a half hours, an hour under your usual, but you rated it 7. Yesterday ran out of steam at 15:00 and came back by the evening. Leg day today.', slept: '6 h 30 asleep, usual 7 h 25 · rated 7 · HRV 44, usual 51', felt: 'energy 7 at 9, 4 at 15, 6 at 21 — the dip after the big lunch', fun: 'Your best focus this week came 40 minutes after coffee, never before it. The coffee knows.', items: [item(1), item(2), item(3)] };
const NIGHT = { summary: 'A solid day: protein at goal, legs done, no late coffee.', slept: '6 h 30 · rated 7', felt: 'mood 6 at 9, 8 at 18 — up after the gym', fun: 'Squats beat your bench for mood again: +2 against +1.', happened: ['Legs at 17:30'], notes: '', change: [{ what: 'Bed by 23:00', why: 'last night was short', topic: 'bedtime' }], remember: [] };
const ANSWERS = { digest: () => DIGEST, night: () => NIGHT, questions: () => ({ questions: [] }) };

(async () => {
  const b = await chromium.launch(); const errs = [], calls = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 320, height: 760 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  await ctx.route('**/api/ai/usage**', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ usage: null, cap: 50, on: true }) }));
  await ctx.route('**/api/ai?**', (r) => { const body = r.request().postDataJSON(); calls.push(body); const a = ANSWERS[body.task]; if (!a) return r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' });
    r.fulfill({ contentType: 'application/json', body: JSON.stringify({ answer: a(), usage: null, costUsd: 0.05, model: 'sonnet' }) }); });
  const pg = await ctx.newPage();
  await pg.clock.install({ time: T(7, 40) });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  // last night rated, so the morning read is written
  await pg.evaluate(([k, at]) => { const s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = [{ id: 'sl', kind: 'sleep', at, rating: 7 }]; s.ai = { ...(s.ai || {}), digest: null, night: null }; localStorage.setItem(k, JSON.stringify(s)); }, [KEY, T(7, 20)]);
  await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('text=Settings');
  for (let i = 0; i < 60 && !calls.some((c) => c.task === 'digest'); i++) await pg.waitForTimeout(100);
  await forYou(pg, 'morning');
  const mr = pg.locator('section.morning:not(.mr-pending)');
  await mr.waitFor({ timeout: 8000 }).catch(() => {});
  const sum = mr.locator('.rd-sum');
  check(`morning, folded: the summary shows, clamped to two lines (${(await sum.innerText().catch(() => '')).slice(0, 60)}…)`, (await sum.count()) === 1 && /Six and a half hours/.test(await sum.innerText()) && /clamp2/.test(await sum.getAttribute('class')) && await mr.locator('.rd-day').count() === 0);
  await mr.locator('.mr-head').click(); await pg.waitForTimeout(150);
  const day = (await mr.locator('.rd-day').innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(`opened: last night and yesterday, one line each (${day})`, day.toLowerCase() === 'last night 6 h 30 asleep, usual 7 h 25 · rated 7 · hrv 44, usual 51 yesterday energy 7 at 9, 4 at 15, 6 at 21 — the dip after the big lunch');
  const fun = (await mr.locator('.rd-fun').innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(`…and one more thing, after the items (${fun})`, /^One more thing Your best focus this week came 40 minutes after coffee/i.test(fun) && await mr.locator('.mr-row, .mr-item').count() >= 1);
  const saved = (await pg.evaluate((k) => JSON.parse(localStorage.getItem(k)).ai.digest, KEY));
  check('kept with the read (a reload shows it again)', saved.summary === DIGEST.summary && saved.slept === DIGEST.slept && saved.felt === DIGEST.felt && saved.fun === DIGEST.fun);
  check(`320: fits (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 320);
  await mr.screenshot({ path: OUT + 'readday-morning.png' });

  // 21:30: the evening read
  await pg.clock.setFixedTime(T(21, 30)); await pg.reload(); await pg.waitForSelector('text=Settings');
  for (let i = 0; i < 60 && !calls.some((c) => c.task === 'night'); i++) await pg.waitForTimeout(100);
  await forYou(pg, 'night');
  const nr = pg.getByLabel('Your day, read back');
  await nr.locator('.mr-head').click(); await pg.waitForTimeout(150);
  const nday = (await nr.locator('.rd-day').innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(`evening: last night and today (${nday})`, nday.toLowerCase() === 'last night 6 h 30 · rated 7 today mood 6 at 9, 8 at 18 — up after the gym');
  check(`…and its fun line (${(await nr.locator('.rd-fun').innerText().catch(() => '')).replace(/\s+/g, ' ')})`, /^One more thing Squats beat your bench/i.test((await nr.locator('.rd-fun').innerText().catch(() => '')).replace(/\s+/g, ' ')));
  await nr.screenshot({ path: OUT + 'readday-night.png' });

  // control: an older read without them — as it was, no empty rows
  await pg.evaluate(([k, at]) => { const s = JSON.parse(localStorage.getItem(k)); s.ai.night = { day: '2026-11-03', at, summary: 'Older read.', happened: ['x'], notes: '', change: [], remember: [] }; localStorage.setItem(k, JSON.stringify(s)); }, [KEY, T(21, 25)]);
  await pg.reload(); await pg.waitForSelector('text=Settings'); await forYou(pg, 'night');
  await pg.getByLabel('Your day, read back').locator('.mr-head').click(); await pg.waitForTimeout(150);
  check('control: an older read shows as before, no empty lines', await pg.getByLabel('Your day, read back').locator('.rd-day, .rd-fun').count() === 0 && /Older read\./.test(await pg.getByLabel('Your day, read back').innerText()));
  console.log('errors: ' + JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH ' + e.message); process.exit(1); });
