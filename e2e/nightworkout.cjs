// The workout, read back at night (PLAN 129; owner, 20 Oct: "Can we have ai look at the workout at eod and make a summary,
// suggestions, compare how i am improving etc? … like a health couach but it should not fire often, it costs api
// credits"). A Push today and one on Tuesday: at 21:30 the read-back that already runs is asked once — no extra call — and
// its context has the session against Tuesday's and each lift against last time, the warm-up left out. The answer's
// workout part shows on Today's card, opened, on a phone.
const { chromium, APP, OUT, handle } = require('./harness.cjs');
const calls = [];
const NIGHT = { summary: 'A training day: Push at 18:00, a little more on bench than Tuesday.', happened: ['Push 18:00–19:05'], notes: '', change: [], remember: [],
  workout: { summary: 'Bench went up: 62.5 × 8, about 4 % over Tuesday\'s best — a new best, with total volume about the same.', better: ['Bench press 62.5 × 8 ≈ 79 kg, +4.2 % — new best'], next: 'Bench at 62.5 until both sets hit 8, then 65.' } };
const ANSWERS = { night: () => NIGHT, digest: () => ({ greeting: 'Hi', items: [] }), questions: () => ({ questions: [] }) };
const at = (d, h, m) => new Date(2026, 9, d, h, m).getTime();
const set = (id, d, h, m, w, exercise, kg, reps, warmup) => ({ id, kind: 'set', at: at(d, h, m), workoutId: w, exercise, kg, reps, ...(warmup ? { warmup: true } : {}) });

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  await ctx.route('**/api/ai/usage**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ usage: null, cap: 50, on: true }) }));
  await ctx.route('**/api/ai?**', (r) => { const body = r.request().postDataJSON(); calls.push(body); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ answer: ANSWERS[body.task](body), usage: null, costUsd: 0.02, model: 'opus' }) }); });
  const pg = await ctx.newPage();
  await pg.clock.install({ time: at(15, 14, 0) });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  await pg.evaluate((s0) => { const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k) || '{}'); Object.assign(s, s0); localStorage.setItem(k, JSON.stringify(s)); }, {
    entries: [set('a', 13, 18, 10, 'w1', 'Bench press', 60, 8), set('b', 13, 18, 15, 'w1', 'Bench press', 60, 8),
      set('c', 15, 18, 5, 'w2', 'Bench press', 30, 10, true), set('d', 15, 18, 10, 'w2', 'Bench press', 62.5, 8), set('e', 15, 18, 15, 'w2', 'Bench press', 62.5, 7)],
    workouts: [{ id: 'w1', template: 'Push', startedAt: at(13, 18, 0), endedAt: at(13, 19, 0), plan: [] }, { id: 'w2', template: 'Push', startedAt: at(15, 18, 0), endedAt: at(15, 19, 5), plan: [] }],
  });

  await pg.clock.setFixedTime(new Date(at(15, 21, 30))); await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('text=Settings');
  for (let i = 0; i < 40 && !calls.some((c) => c.task === 'night'); i++) await pg.waitForTimeout(100);
  const sent = calls.filter((c) => c.task === 'night');
  check(`one call: the read-back that already runs, nothing extra (${calls.map((c) => c.task).join(',')})`, sent.length === 1 && !calls.some((c) => !['night', 'digest', 'questions'].includes(c.task)));
  const sec = sent[0] ? sent[0].context.slice(sent[0].context.indexOf('## The workout that day')).split('\n').slice(0, 3) : [];
  check(`its context: the session against Tuesday's Push, the lift against last time (${sec.join(' / ')})`, sec[0] === '## The workout that day (each lift against the last time it was done; working sets only)'
    && /^- Push 18:00–19:05 \(65 min\): 2 working sets, 938 kg \(last Push, Tue 13 Oct: 960 kg, −2\.3 %\)$/.test(sec[1]) && /^ {2}- Bench press: 62\.5 × 8, 62\.5 × 7 — best 62\.5 × 8 ≈ 79 kg 1-rep max; last time Tue 13 Oct 60 × 8 ≈ 76 kg, \+4\.2 % — new best$/.test(sec[2]));
  check('the warm-up isn\'t counted', sent[0] && !/30 × 10/.test(sent[0].context.slice(sent[0].context.indexOf('## The workout that day'))));

  const card = pg.getByLabel('Your day, read back');
  check('folded: the workout part waits inside', !/Your workout/i.test(await card.innerText()));
  await card.locator('.mr-head').click(); await pg.waitForTimeout(150);
  const w = card.locator('.night-workout');
  const txt = (await w.innerText()).replace(/\s+/g, ' ');
  check(`opened: the workout — how it went, what went up, next time (${txt})`, /YOUR WORKOUT|Your workout/i.test(txt) && /Bench went up/.test(txt) && /Bench press 62\.5 × 8 ≈ 79 kg, \+4\.2 % — new best/.test(txt) && /Next time Bench at 62\.5 until both sets hit 8, then 65\./.test(txt));
  const wide = await pg.evaluate(() => document.documentElement.scrollWidth);
  check(`phone: nothing wider than the screen (${wide} px)`, wide <= 390);
  await card.scrollIntoViewIfNeeded(); await card.screenshot({ path: OUT + 'night-workout.png' });

  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
