// Cardio sessions (PLAN 130; owner, 20 Oct: "Feel like ts doesnt track cardio sessions properly. It should be a button
// that i press and it strts w timer, then it logs as cardio sessions, reads and understands the heart bpm and other
// metrics … Cardio is important for my weight loss."). One tap on Stairmaster starts a timer; 35 minutes later (past the
// 30 at which an empty workout used to be thrown away) and after a reload it's still running; the band's planted 142 bpm
// shows live and in the summary; Stop shows minutes, heart rate and about how many kcal (9 MET × his 81 kg weigh-in), Save
// keeps it, and Recent lists it. Then cardio after lifting: ▶ Start runs a timer, Done keeps its minutes.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

const MIN = 60_000, T0 = new Date('2026-10-20T18:00:00').getTime();
const hr = [];
for (let t = T0 - 60 * MIN; t < T0 + 120 * MIN; t += MIN) { const v = t >= T0 + MIN && t < T0 + 41 * MIN ? 142 : 64; hr.push([t, v, v - 3, v + 6]); }

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  let bandNow = T0;
  await ctx.route(/\/api\/band\//, (rt) => {
    const u = new URL(rt.request().url()), op = u.pathname.split('/').pop(), from = +u.searchParams.get('from'), to = +u.searchParams.get('to');
    const got = hr.filter((m) => m[0] <= bandNow - 3 * MIN); // the band is a few minutes behind
    const st = { connected: true, needsReconnect: false, connectedAt: T0 - 40 * 86_400_000, lastSync: bandNow, latest: got.at(-1)?.[0] ?? null, error: null, gapSec: 60 };
    rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(op === 'data' ? { hr: got.filter((m) => m[0] >= from && m[0] <= to), steps: [], sleep: [], rhr: {}, hrv: {}, ...st } : st) });
  });
  const pg = await ctx.newPage();
  await pg.clock.install({ time: T0 });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  const KEY = 'healthos.v1:u-test', st = async () => { await pg.waitForTimeout(300); return pg.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}'), KEY); };
  await pg.evaluate((k) => { const s = JSON.parse(localStorage.getItem(k) || '{}'); s.workouts = []; s.entries = [{ id: 'kg', kind: 'weight', at: new Date('2026-10-20T07:00:00').getTime(), kg: 81 }]; localStorage.setItem(k, JSON.stringify(s)); }, KEY);
  await pg.goto(APP + '#workout'); await pg.reload(); await pg.waitForSelector('.cardio-start');

  // one tap
  await pg.locator('.cardio-start').getByRole('button', { name: '▶ Stairmaster' }).click(); await pg.waitForTimeout(200);
  const w0 = (await st()).workouts.find((w) => w.kind === 'cardio');
  check(`one tap on Stairmaster: a cardio session, timer from now (${w0 && w0.cardio.what})`, w0 && w0.cardio.what === 'Stairmaster' && Math.abs(w0.startedAt - T0) < 10_000 && w0.endedAt === null && await pg.locator('.cardio-timer output').count() === 1);
  await pg.screenshot({ path: OUT + 'cardio-start.png' });

  // 35 min later, the app reopened: still running, the band's beat shows (it's 3 min behind)
  bandNow = T0 + 35 * MIN; await pg.clock.setFixedTime(new Date(bandNow)); await pg.reload(); await pg.waitForSelector('.cardio-timer');
  await pg.waitForFunction(() => /♥/.test(document.querySelector('.cardio-timer')?.textContent || ''), null, { timeout: 6000 }).catch(() => {});
  const tim = (await pg.locator('.cardio-timer').innerText()).replace(/\s+/g, ' ');
  const w1 = (await st()).workouts.find((w) => w.id === w0.id);
  check(`35 min on, after a reload: still running — not thrown away as an empty workout (${tim})`, w1 && w1.endedAt === null && /^(34:5\d|35:00)/.test(tim));
  check('…the band\'s heart rate, live', /♥ 142 bpm · 18:3\d/.test(tim));
  await pg.screenshot({ path: OUT + 'cardio-running.png' });
  await pg.goto(APP + '#today'); await pg.waitForSelector('.noticed-line.running');
  const today = (await pg.locator('.noticed-line.running').innerText()).replace(/\s+/g, ' ');
  check(`Today: "Cardio running", minutes so far, and when it would end itself — not "no sets yet" (${today})`, /Cardio running Stairmaster · 3[45] min so far started 18:00 · ends by itself at 21:00/i.test(today) && !/no sets/.test(today));
  await pg.goto(APP + '#workout'); await pg.waitForSelector('.cardio-timer');

  // 40 min: Stop → what it was
  bandNow = T0 + 46 * MIN; await pg.clock.setFixedTime(new Date(T0 + 41 * MIN)); await pg.reload(); await pg.waitForSelector('.cardio-timer');
  await pg.waitForTimeout(800);
  await pg.getByRole('button', { name: 'Stop' }).click(); await pg.waitForTimeout(200);
  const fin = (await pg.locator('.tile.finish').innerText()).replace(/\s+/g, ' ');
  // 41 min × 9 MET × 81 kg / 60 = 498
  check(`Stop: minutes, the band's average and peak, about how many kcal and how (${fin})`, /41 min/.test(fin) && /142 avg bpm · peak 148/.test(fin) && /~498 kcal/.test(fin) && /9 MET × 81 kg × 41 min/.test(fin));
  check('…nothing saved until Save', (await st()).workouts.find((w) => w.id === w0.id).endedAt === null);
  await pg.screenshot({ path: OUT + 'cardio-stop.png' });
  const wide = await pg.evaluate(() => document.documentElement.scrollWidth);
  check(`phone: nothing wider than the screen (${wide} px)`, wide <= 390);
  await pg.getByRole('button', { name: 'Save' }).click(); await pg.waitForTimeout(200);
  const w2 = (await st()).workouts.find((w) => w.id === w0.id);
  check(`Save: ended at the Stop tap (${w2.endedAt && (w2.endedAt - T0) / MIN} min)`, w2.endedAt === T0 + 41 * MIN && w2.cardio.done === true);
  await pg.waitForSelector('.cardio-start');
  const recent = (await pg.locator('.tile', { hasText: 'Recent' }).innerText()).replace(/\s+/g, ' ');
  check(`Recent lists it with its minutes and heart rate (${recent})`, /Stairmaster · Tue 20 Oct 41 min · avg 142 bpm/.test(recent));

  // started by mistake: thrown away, nothing kept
  await pg.locator('.cardio-start').getByRole('button', { name: '▶ Bike' }).click(); await pg.waitForTimeout(150);
  await pg.getByRole('button', { name: 'Started by mistake?' }).click(); await pg.getByRole('button', { name: 'Discard — nothing saved' }).click(); await pg.waitForTimeout(200);
  check('started by mistake: discarded, nothing kept', !(await st()).workouts.some((w) => w.cardio && w.cardio.what === 'Bike') && await pg.locator('.cardio-start').count() === 1);

  // cardio after lifting: ▶ Start, a timer, Done keeps its minutes
  await pg.evaluate(([k, t]) => { const s = JSON.parse(localStorage.getItem(k)); s.workouts.push({ id: 'lw', template: 'Push', startedAt: t, endedAt: null, plan: [], cardio: { what: '20 min incline walk' } }); localStorage.setItem(k, JSON.stringify(s)); }, [KEY, T0 + 60 * MIN]);
  await pg.clock.setFixedTime(new Date(T0 + 62 * MIN)); await pg.reload(); await pg.waitForSelector('.cockpit');
  // the session with no exercises shows "add the first one"; add one so the session screen (and its cardio row) shows
  const add = pg.getByRole('button', { name: '+ Add exercise' }); if (await add.count()) { await add.first().click(); await pg.getByLabel('Exercise to add').fill('Bench press'); await pg.getByRole('button', { name: /^Add/ }).click(); await pg.waitForTimeout(200); }
  await pg.locator('.tile.plan').getByRole('button', { name: 'Start now' }).click(); await pg.waitForTimeout(150);
  await pg.clock.setFixedTime(new Date(T0 + 83 * MIN)); await pg.waitForTimeout(1200);
  const clk = await pg.locator('.tile.cardio .cardio-clock').innerText().catch(() => '');
  check(`after lifting: Start runs a timer (${clk})`, /^2[01]:\d\d$/.test(clk));
  await pg.locator('.tile.cardio').getByRole('button', { name: 'Done' }).click(); await pg.waitForTimeout(200);
  const lw = (await st()).workouts.find((w) => w.id === 'lw');
  check(`…Done keeps its minutes (${(await pg.locator('.tile.cardio').innerText()).replace(/\s+/g, ' ')})`, lw.cardio.done === true && Math.abs(lw.cardio.startedAt - (T0 + 62 * MIN)) < 10_000 && /✓ Done · 21 min/.test(await pg.locator('.tile.cardio').innerText()));

  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
