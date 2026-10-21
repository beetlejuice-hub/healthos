// Heart-rate zones on every workout, not only cardio (PLAN 52; owner, 21 Oct: "3 per workout"). Age 31 → max 186.
// Yesterday's Push 18:00–19:00 with the band at 100 bpm for 20 min (Z1), 120 for 25 (Z2), 140 for 15 (Z3): the Workout
// tab's Recent row must show those minutes. Today's Pull from 17:00, still going at 17:50, and the band has only sent up to
// 17:20 (135 bpm, Z3): Finish must show what's in and say the rest comes when it syncs. At 21:30 the evening read-back must
// be sent the Pull's zones. With no age: Finish says what it needs, and Recent shows nothing rather than nagging per row.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

const MIN = 60_000, T = (d, hm) => new Date(`2026-10-${d}T${hm}:00`).getTime();
const NOW = T('21', '17:50'), KEY = 'healthos.v1:u-test';
const hr = [];
const run = (from, n, bpm) => { for (let i = 0; i < n; i++) { const t = from + i * MIN; hr.push([t, bpm, bpm - 3, bpm + 3]); } };
run(T('20', '18:00'), 20, 100); run(T('20', '18:20'), 25, 120); run(T('20', '18:45'), 15, 140);
run(T('21', '17:00'), 20, 135);
const LATEST = T('21', '17:19');
const set = (id, wid, at, exercise, kg, reps) => ({ id, kind: 'set', at, workoutId: wid, exercise, kg, reps });

(async () => {
  const b = await chromium.launch(); const errs = [], calls = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  await ctx.route(/\/api\/band\//, (rt) => {
    const u = new URL(rt.request().url()), op = u.pathname.split('/').pop(), from = +u.searchParams.get('from'), to = +u.searchParams.get('to');
    const st = { connected: true, needsReconnect: false, connectedAt: NOW - 30 * 86_400_000, lastSync: NOW - 3 * MIN, latest: LATEST, error: null, gapSec: 60 };
    rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(op === 'data' ? { hr: hr.filter((m) => m[0] >= from && m[0] <= to), steps: [], sleep: [], rhr: {}, hrv: {}, ...st } : st) });
  });
  await ctx.route('**/api/ai/usage**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ usage: null, cap: 50, on: true }) }));
  await ctx.route('**/api/ai?**', (r) => { const body = r.request().postDataJSON(); calls.push(body); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ answer: body.task === 'night' ? { summary: 'A Pull day.', happened: [], change: [], remember: [] } : body.task === 'digest' ? { greeting: 'Hi', items: [] } : { questions: [] }, usage: null, costUsd: 0.01, model: 'opus' }) }); });
  const pg = await ctx.newPage();
  await pg.clock.install({ time: NOW });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  const seed = (workouts, entries, age) => pg.evaluate(([k, w, e, a]) => { const s = JSON.parse(localStorage.getItem(k) || '{}'); s.workouts = w; s.entries = e; s.settings = { ...s.settings, age: a ?? undefined }; localStorage.setItem(k, JSON.stringify(s)); }, [KEY, workouts, entries, age]);
  const push = { id: 'y', template: 'Push', startedAt: T('20', '18:00'), endedAt: T('20', '19:00'), plan: [] };
  const pull = { id: 'a', template: 'Pull', startedAt: T('21', '17:00'), endedAt: null, plan: [{ name: 'Barbell row', sets: 3, reps: 10, restSec: 90 }] };
  const sets = [set('s1', 'y', T('20', '18:10'), 'Bench press', 60, 8), set('s2', 'y', T('20', '18:30'), 'Bench press', 60, 8), set('s3', 'a', T('21', '17:10'), 'Barbell row', 60, 10), set('s4', 'a', T('21', '17:40'), 'Barbell row', 60, 10)];

  // Recent: yesterday's Push with its zones
  await seed([push], sets.slice(0, 2), 31);
  await pg.goto(APP + '#workout'); await pg.reload(); await pg.waitForSelector('.cockpit');
  await pg.waitForFunction(() => document.querySelector('.rec-w .zones'), null, { timeout: 10000 }).catch(() => {});
  const rec = await pg.locator('.rec-w').first().innerText().catch(() => '');
  check(`Recent: the Push row with its zones (${rec.replace(/\s+/g, ' ')})`, /Push · Tue 20 Oct[\s\S]*Z1\s*20 min\s*Z2\s*25 min\s*Z3\s*15 min/.test(rec));
  check(`Recent: fits the phone (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
  await pg.locator('.rec-w').first().locator('..').screenshot({ path: OUT + 'workoutzones-recent.png' });

  // Finish: today's Pull, the band 30 minutes behind
  await seed([push, pull], sets, 31);
  await pg.reload(); await pg.waitForSelector('.cockpit');
  await pg.getByRole('button', { name: /Finish (workout|early)…/ }).click();
  await pg.waitForFunction(() => document.querySelector('.finish .zones'), null, { timeout: 10000 }).catch(() => {});
  const fin = await pg.locator('.finish').innerText().catch(() => '');
  check(`Finish: what's in — Z3 20 min — and that the rest comes when it syncs (${fin.replace(/\s+/g, ' ').slice(0, 220)})`,
    /Z3\s*20 min/.test(fin) && !/Z[1245]\s*\d+ min/.test(fin) && /max 186 bpm, from your age · the band's minutes up to 17:19 — the rest when it syncs/.test(fin));
  await pg.locator('.finish').screenshot({ path: OUT + 'workoutzones-finish.png' });

  // 21:30: the evening read-back is sent the Pull's zones
  await pg.clock.setFixedTime(T('21', '21:30')); await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('text=Settings');
  for (let i = 0; i < 60 && !calls.some((c) => c.task === 'night'); i++) await pg.waitForTimeout(100);
  const night = calls.find((c) => c.task === 'night');
  check('the evening read-back gets the Pull with its zones', !!night && /- Pull 17:00–17:4\d \(4\d min\): 2 working sets, 1,200 kg[^\n]* · heart-rate zones Z3 20 min \(of max 186 bpm\)/.test(night.context));

  // no age: Finish says what it needs; Recent stays quiet
  await pg.clock.setFixedTime(NOW);
  await seed([push, pull], sets, null);
  await pg.goto(APP + '#workout'); await pg.reload(); await pg.waitForSelector('.cockpit');
  await pg.getByRole('button', { name: /Finish (workout|early)…/ }).click(); await pg.waitForTimeout(300);
  check('no age: Finish says what zones need', /Heart-rate zones: add your age \(or max heart rate\) in Settings/.test(await pg.locator('.finish').innerText()));
  await seed([push], sets.slice(0, 2), null);
  await pg.reload(); await pg.waitForSelector('.cockpit'); await pg.waitForTimeout(500);
  check('no age: Recent shows no zones and no nag per row', await pg.locator('.rec-w').count() === 1 && await pg.locator('.rec-w .zones, .rec-w .zones-need').count() === 0);

  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
