// The reads without a recap (PLAN 202; owner, 10 Nov: "we should cut the summary, i never read, give the interesting
// things … not the boring things i already know like calories ate, workout, etc. i want to hear how my day was compared
// to others"). A fake band (yesterday 7,956 steps, worn all day, 6 h 40 asleep last night, resting 54) and a fake AI
// write the morning read at 07:40 and the evening read at 21:30 through the app's own path. The read is told "you
// against everyone else" — the app's numbers from big studies; the card shows its "vs" line, and no summary, "last
// night" or "yesterday" lines even when the AI sends them. "One more thing" stays. Evening: the same, its "what
// happened" list gone. Control: an older read with a summary still shows that summary (it's what it has). 320 px fits.
const { chromium, APP, OUT, handle, forYou } = require('./harness.cjs');

const KEY = 'healthos.v1:u-test', T = (h, m = 0) => new Date(2026, 10, 3, h, m).getTime();
const item = (n) => ({ type: 'pattern', topic: `t-${n}`, title: `Item ${n}: beer nights cost you sleep`, text: '6.1 after drinks vs 7.2 without.', tip: 'Water between beers tonight', sure: 'yours', measure: 'sleep' });
const VS = 'More steps yesterday than about 75 % of 717,527 people (Althoff 2017) — 8,064 against 4,961.';
const DIGEST = { greeting: 'Morning, Arnold.', vs: VS, summary: 'Six and a half hours, an hour under your usual, but you rated it 7. Yesterday ran out of steam at 15:00 and came back by the evening. Leg day today.', slept: '6 h 30 asleep, usual 7 h 25 · rated 7 · HRV 44, usual 51', felt: 'energy 7 at 9, 4 at 15, 6 at 21 — the dip after the big lunch', fun: 'Your best focus this week came 40 minutes after coffee, never before it. The coffee knows.', items: [item(1), item(2), item(3)] };
const NIGHT = { summary: 'Your resting 54 is 11 under the average Fitbit wearer — the cardio is showing.', vs: 'Resting heart rate 54 — 11 under the average 65 of 92,457 Fitbit wearers (Quer 2020).', slept: '6 h 30 · rated 7', felt: 'mood 6 at 9, 8 at 18 — up after the gym', fun: 'Squats beat your bench for mood again: +2 against +1.', happened: ['Legs at 17:30'], notes: '', change: [{ what: 'Bed by 23:00', why: 'last night was short', topic: 'bedtime' }], remember: [] };
const ANSWERS = { digest: () => DIGEST, night: () => NIGHT, questions: () => ({ questions: [] }) };

(async () => {
  const b = await chromium.launch(); const errs = [], calls = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 320, height: 760 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  await ctx.route('**/api/ai/usage**', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ usage: null, cap: 50, on: true }) }));
  await ctx.route('**/api/ai?**', (r) => { const body = r.request().postDataJSON(); calls.push(body); const a = ANSWERS[body.task]; if (!a) return r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' });
    r.fulfill({ contentType: 'application/json', body: JSON.stringify({ answer: a(), usage: null, costUsd: 0.05, model: 'sonnet' }) }); });
  // the band: yesterday worn 08:00–21:00 with 7,956 steps, last night 6 h 40 asleep, resting 54 this morning
  const Y = (h, m = 0) => new Date(2026, 10, 2, h, m).getTime();
  const hr = [], steps = [];
  for (let t = Y(8); t < Y(21); t += 60_000) hr.push([t, 72, 70, 75]);
  for (let t = Y(8); t < Y(21); t += 5 * 60_000) steps.push([t, 5, 51]);
  const sleep = [{ id: 'n1', start: T(0) - 60 * 60_000, end: T(7, 0), asleepMin: 400, awakeMin: 20, toFallAsleepMin: 10, nap: false, stageMin: {}, stages: [] }];
  await ctx.route(/\/api\/band\//, (r) => {
    const u = new URL(r.request().url()), op = u.pathname.split('/').pop();
    const st = { connected: true, needsReconnect: false, connectedAt: T(0) - 30 * 864e5, lastSync: T(7, 30), latest: hr.at(-1)[0], error: null, gapSec: 60 };
    r.fulfill({ contentType: 'application/json', body: JSON.stringify(op === 'data' ? { hr, steps, sleep, rhr: { '2026-11-03': 54 }, hrv: {}, ...st } : st) });
  });
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
  const ctxt = calls.find((c) => c.task === 'digest')?.context ?? '';
  const vsSec = (ctxt.match(/## You against everyone else[^\n]*\n(- [^\n]*\n?)+/) || [''])[0];
  check(`the read is told you against everyone else, from the band (${vsSec.replace(/\n/g, ' | ').slice(0, 260)})`,
    /- Steps yesterday 7,956 — the average is 4,961; more than about 85 % of 717,527 people/.test(vsSec) && /- Asleep last night 6 h 40 — the average is 6 h 47/.test(vsSec) && /- Resting heart rate 54 — 11 under the average 65 of 92,457 Fitbit wearers/.test(vsSec));
  check(`…and never to recap the day (${(ctxt.match(/NOTHING THEY ALREADY KNOW/) || ['the rule is in the system prompt'])[0]})`, !/"summary": 2–3 short sentences/.test(ctxt));
  const vs = (await mr.locator('.rd-vs').innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(`morning: "you vs everyone", not a summary (${vs})`, /^You vs everyone More steps yesterday than about 75 %/i.test(vs));
  check('…no summary, no "last night" / "yesterday" lines — though the AI sent them', await mr.locator('.rd-sum, .rd-day').count() === 0 && !/Six and a half hours/.test(await mr.innerText()));
  await mr.locator('.mr-head').click(); await pg.waitForTimeout(150);
  check('…opened, still none', await mr.locator('.rd-sum, .rd-day').count() === 0 && !/energy 7 at 9/.test(await mr.innerText()));
  const fun = (await mr.locator('.rd-fun').innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(`…one more thing stays, after the items (${fun})`, /^One more thing Your best focus this week came 40 minutes after coffee/i.test(fun) && await mr.locator('.mr-row, .mr-item').count() >= 1);
  const saved = (await pg.evaluate((k) => JSON.parse(localStorage.getItem(k)).ai.digest, KEY));
  check('kept with the read', saved.vs === VS && saved.fun === DIGEST.fun);
  check(`320: fits (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 320);
  await mr.screenshot({ path: OUT + 'readday-morning.png' });

  // 21:30: the evening read
  await pg.clock.setFixedTime(T(21, 30)); await pg.reload(); await pg.waitForSelector('text=Settings');
  for (let i = 0; i < 60 && !calls.some((c) => c.task === 'night'); i++) await pg.waitForTimeout(100);
  await forYou(pg, 'night');
  const nr = pg.getByLabel('Your day, read back');
  await nr.locator('.mr-head').click(); await pg.waitForTimeout(150);
  const nt = (await nr.innerText()).replace(/\s+/g, ' ');
  check(`evening: one line worth knowing, "you vs everyone"; no recap (${nt.slice(0, 200)})`, /Your resting 54 is 11 under/.test(nt) && /You vs everyone Resting heart rate 54/i.test(nt) && !/Legs at 17:30|mood 6 at 9/.test(nt) && await nr.locator('.rd-day, .night-list').count() === 0);
  check(`…and its fun line (${(await nr.locator('.rd-fun').innerText().catch(() => '')).replace(/\s+/g, ' ')})`, /^One more thing Squats beat your bench/i.test((await nr.locator('.rd-fun').innerText().catch(() => '')).replace(/\s+/g, ' ')));
  await nr.screenshot({ path: OUT + 'readday-night.png' });

  // control: an older read without them — as it was, no empty rows
  await pg.evaluate(([k, at]) => { const s = JSON.parse(localStorage.getItem(k)); s.ai.night = { day: '2026-11-03', at, summary: 'Older read.', happened: ['x'], notes: '', change: [], remember: [] }; localStorage.setItem(k, JSON.stringify(s)); }, [KEY, T(21, 25)]);
  await pg.reload(); await pg.waitForSelector('text=Settings'); await forYou(pg, 'night');
  await pg.getByLabel('Your day, read back').locator('.mr-head').click(); await pg.waitForTimeout(150);
  check('control: an older read shows its summary, no empty lines', await pg.getByLabel('Your day, read back').locator('.rd-day, .rd-fun, .rd-vs').count() === 0 && /Older read\./.test(await pg.getByLabel('Your day, read back').innerText()));
  console.log('errors: ' + JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH ' + e.message); process.exit(1); });
