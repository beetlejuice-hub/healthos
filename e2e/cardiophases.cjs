// Cardio in phases, with pace (PLAN 191; owner, 3 Nov: "Can app ask for average pace and different phases of cardio? Like i
// do incline walk then normal running and just want the app to calculate some stats from my average pace average miles
// average hbpm etc."). One tap on Incline walk at 18:00; at 18:18 "Next: Run" (the timer goes on); Stop at 18:40. The band:
// 128 bpm walking, 163 running. Save asks each phase's distance: 0.9 mi at 12 %, 2.0 mi → 20:00 and 11:00 a mile, the run
// 1,793 beats a mile; saved as "Incline walk → Run". Insights → Training: a card per kind — with five earlier runs logged,
// Run's average pace, distance, heart rate, beats a mile and the first 3 against the last 3. km shows the same in km. 320 px.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

const MIN = 60_000, D = 86_400_000, T0 = new Date('2026-11-02T18:00:00').getTime(), MI = 1.609344;
const hr = [];
for (let t = T0 - 60 * MIN; t < T0 + 120 * MIN; t += MIN) { const v = t >= T0 && t < T0 + 18 * MIN ? 128 : t >= T0 + 18 * MIN && t < T0 + 40 * MIN ? 163 : 64; hr.push([t, v, v - 3, v + 4]); }
// five earlier runs, 2 mi each, every 3 days, each faster: 24, 23.5, 23, 22.5, 22 min
const past = Array.from({ length: 5 }, (_, i) => { const s = T0 - (15 - i * 3) * D, min = 24 - i * 0.5; return { id: 'r' + i, kind: 'cardio', template: 'Cardio', startedAt: s, endedAt: s + min * MIN, cardio: { what: 'Run', startedAt: s, done: true, at: s + min * MIN }, phases: [{ what: 'Run', start: s, km: 2 * MI }] }; });
for (const w of past) for (let t = w.startedAt; t < w.endedAt; t += MIN) hr.push([t, 166, 163, 170]);
hr.sort((a, b) => a[0] - b[0]);

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 320, height: 760 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  let bandNow = T0;
  await ctx.route(/\/api\/band\//, (rt) => {
    const u = new URL(rt.request().url()), op = u.pathname.split('/').pop(), from = +u.searchParams.get('from'), to = +u.searchParams.get('to');
    const got = hr.filter((m) => m[0] <= bandNow - 3 * MIN);
    const st = { connected: true, needsReconnect: false, connectedAt: T0 - 40 * D, lastSync: bandNow, latest: got.at(-1)?.[0] ?? null, error: null, gapSec: 60 };
    rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(op === 'data' ? { hr: got.filter((m) => m[0] >= from && m[0] <= to), steps: [], sleep: [], rhr: {}, hrv: {}, ...st } : st) });
  });
  const pg = await ctx.newPage();
  await pg.clock.install({ time: T0 });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  const KEY = 'healthos.v1:u-test', st = async () => { await pg.waitForTimeout(300); return pg.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}'), KEY); };
  await pg.waitForLoadState('networkidle');
  await pg.evaluate(([k, ws]) => { const s = JSON.parse(localStorage.getItem(k) || '{}'); s.workouts = ws; s.entries = [{ id: 'kg', kind: 'weight', at: new Date('2026-11-02T07:00:00').getTime(), kg: 81 }]; localStorage.setItem(k, JSON.stringify(s)); }, [KEY, past]);
  await pg.goto(APP + '#workout'); await pg.reload(); await pg.waitForSelector('.cardio-start');
  await pg.locator('.cardio-start').getByRole('button', { name: '▶ Incline walk' }).click(); await pg.waitForTimeout(200);

  // 18:18: Next — Run (the tap above lands a second or two after 18:00, so the walk is 17:58 or so: 19:5x a mile)
  bandNow = T0 + 18 * MIN; await pg.clock.setFixedTime(new Date(bandNow)); await pg.reload(); await pg.waitForSelector('.cardio-timer');
  await pg.getByRole('group', { name: 'Next phase' }).getByRole('button', { name: 'Run' }).click(); await pg.waitForTimeout(300);
  const w1 = (await st()).workouts.find((w) => w.kind === 'cardio' && w.endedAt === null);
  check(`"Next: Run" at 18:18: the walk ends, the run begins, the timer goes on (${JSON.stringify(w1.phases.map((p) => [p.what, (p.start - T0) / MIN]))})`, w1.phases.length === 2 && w1.phases[0].what === 'Incline walk' && w1.phases[0].start === w1.startedAt && w1.phases[1].what === 'Run' && Math.abs(w1.phases[1].start - (T0 + 18 * MIN)) < 2000);
  bandNow = T0 + 25 * MIN; await pg.clock.setFixedTime(new Date(bandNow)); await pg.reload(); await pg.waitForSelector('.cardio-timer');
  const run = (await pg.locator('.cardio-timer').innerText()).replace(/\s+/g, ' ');
  check(`running: both phases named, this phase's own clock (${run})`, /Incline walk → Run · phase 2 · this phase 7:00/.test(run));
  await pg.screenshot({ path: OUT + 'cardiophases-running.png' });

  // 18:40: Stop → each phase's distance
  bandNow = T0 + 46 * MIN; await pg.clock.setFixedTime(new Date(T0 + 40 * MIN)); await pg.reload(); await pg.waitForSelector('.cardio-timer'); await pg.waitForTimeout(800);
  await pg.getByRole('button', { name: 'Stop' }).click(); await pg.waitForTimeout(300);
  await pg.getByLabel('Incline walk: distance in miles').fill('0.9');
  await pg.getByLabel('Incline walk: incline %').fill('12');
  await pg.getByLabel('Run: distance in miles').fill('2');
  await pg.waitForTimeout(300);
  const rows = (await pg.locator('.phase-row').allInnerTexts()).map((t) => t.replace(/\s+/g, ' '));
  check(`Save: each phase's minutes and heart rate, its pace and speed from the distance (${rows.join(' | ')})`, /Incline walk · 18 min · ♥ 128.*(19:5\d|20:00) \/mi · 3\.0 mph/.test(rows[0]) && /Run · 22 min · ♥ 163.*11:00 \/mi · 5\.5 mph · 1,793 beats a mile/.test(rows[1]));
  check(`320: fits (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 320);
  await pg.locator('.tile.finish').screenshot({ path: OUT + 'cardiophases-save.png' });
  await pg.getByRole('button', { name: 'Save' }).click(); await pg.waitForTimeout(300);
  const w2 = (await st()).workouts.find((w) => w.id === w1.id);
  check(`saved: "Incline walk → Run", the distances in km, the incline (${w2.cardio.what} · ${JSON.stringify(w2.phases.map((p) => [p.what, p.km && +p.km.toFixed(3), p.incline]))})`, w2.cardio.what === 'Incline walk → Run' && Math.abs(w2.phases[0].km - 0.9 * MI) < 0.001 && w2.phases[0].incline === 12 && Math.abs(w2.phases[1].km - 2 * MI) < 0.001 && w2.endedAt === T0 + 40 * MIN);

  // Insights → Training: a card per kind
  await pg.goto(APP + '#insights/training'); await pg.waitForSelector('.tp-cardio', { timeout: 8000 }).catch(() => {}); await pg.waitForTimeout(800);
  const runCard = (await pg.getByRole('article', { name: 'Run: pace and distance' }).innerText().catch(() => '')).replace(/\s+/g, ' ');
  // 6 runs, 12 mi, 23.5×… : (24+23.5+23+22.5+22+22) = 137 min ÷ 12 mi = 11:25; best 11:00; first 3 (70.5 min / 6 mi = 11:45) → last 3 (66.5 / 6 = 11:05)
  check(`Run: 6 runs, average pace, best, distance, heart rate (${runCard.slice(0, 200)})`, /Run 6 runs with a distance since 18 Oct/.test(runCard) && /11:25 avg pace \/mi · best 11:00/.test(runCard) && /2\.0 mi avg a run · 12 mi in all/.test(runCard) && /166 avg bpm/.test(runCard));
  check(`…beats a mile, and the first 3 against the last 3 (${(runCard.match(/The first 3.*$/) || [''])[0]})`, /\d,\d{3} beats a mile · fewer is fitter/.test(runCard) && /The first 3 against the last 3: 11:45 → 11:05 a mile \(faster\), and about \d+ fewer beats a mile\./.test(runCard));
  const walkCard = (await pg.getByRole('article', { name: 'Incline walk: pace and distance' }).innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(`Incline walk: its own card (${walkCard.slice(0, 120)})`, /Incline walk 1 walk with a distance/.test(walkCard) && /(19:5\d|20:00) avg pace \/mi/.test(walkCard) && /128 avg bpm/.test(walkCard));
  check(`320: fits (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 320);
  await pg.getByRole('article', { name: 'Run: pace and distance' }).screenshot({ path: OUT + 'cardiophases-stats.png' });
  // km: the same numbers in km
  await pg.evaluate((k) => { const s = JSON.parse(localStorage.getItem(k)); s.settings = { ...s.settings, distUnit: 'km' }; localStorage.setItem(k, JSON.stringify(s)); }, KEY);
  await pg.reload(); await pg.waitForSelector('.tp-cardio', { timeout: 8000 }).catch(() => {}); await pg.waitForTimeout(800);
  const km = (await pg.getByRole('article', { name: 'Run: pace and distance' }).innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(`in km: 7:06 a km, 3.2 km a run (${km.slice(0, 120)})`, /7:06 avg pace \/km/.test(km) && /3\.2 km avg a run/.test(km));
  console.log('errors: ' + JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH ' + e.message); process.exit(1); });
