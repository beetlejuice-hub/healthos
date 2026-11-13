// Renovation part 1 (owner, 13 Nov: "do 1 then 3"; canvas A "four tiles, then next"): the top of Training. 12 weeks with
// known answers — lifts up about 1 % a week, walking 112 → 104 bpm at 115 steps a minute, recovery 26 → 33, weight
// 84.2 → 82.1 kg — so "Getting fitter?" says yes on all four, each tile with its number; "Next" names the session after
// the last (Push + Quads, its squat as last time said) and the 25 min of cardio short this week, with Start; the tiles go
// to their cards (weight to Food & body); the two analysis cards are folded; it all comes first on the page.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

const MIN = 60_000, D = 864e5, T = new Date('2026-11-13T18:00:00').getTime();
let seed = 218; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647, gauss = () => { let s = 0; for (let i = 0; i < 6; i++) s += rnd(); return (s - 3) * 1.41; };
const dayAt = (d, h, m = 0) => { const x = new Date(T - d * D); x.setHours(h, m, 0, 0); return x.getTime(); };
const pairs = [], workouts = [], rhr = {}, vo2 = {};
const iso = (t) => { const x = new Date(t); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
for (let d = 83; d >= 0; d--) {
  const f = 1 - d / 84;
  // two walks a day, 5 windows each; the first window reads low (the heart catching up — left out by the app)
  for (const h of [8, 13]) { const spm = 115 + (rnd() - 0.5) * 14; for (let i = 0; i < 5; i++) { const t = dayAt(d, h) + i * 5 * MIN; if (t < T) pairs.push([t, Math.round(spm * 10) / 10, Math.round(112 - 8 * f + 0.6 * (spm - 115) + gauss() * 2 - (i === 0 ? 8 : 0))]); } }
  // the stairmaster on Tuesdays and Thursdays at 17:00, 25 minutes
  const wd = new Date(T - d * D).getDay();
  // this week's Thursday stairmaster skipped: 25 of the usual 50 min
  if ((wd === 2 || wd === 4) && !(d < 7 && wd === 4)) {
    const s = dayAt(d, 17), id = `st${d}`;
    if (s + 25 * MIN < T) {
      workouts.push({ id, template: 'Cardio', kind: 'cardio', startedAt: s, endedAt: s + 25 * MIN, cardio: { what: 'Stairmaster', startedAt: s } });
      for (let i = 0; i < 5; i++) pairs.push([s + i * 5 * MIN, 88 + Math.round(gauss() * 2), Math.round(158 - 7 * f + gauss() * 1.5)]);
    }
  }
  rhr[iso(dayAt(d, 12))] = Math.round(61 - 3 * f + gauss() * 0.7);
  vo2[iso(dayAt(d, 12))] = { v: Math.round((42 + 1.6 * f + gauss() * 0.2) * 10) / 10 };
}
// two runs outside workouts, 160 a minute (2 weeks of runs: not enough for a line)
for (const d of [9, 2]) for (let i = 0; i < 4; i++) pairs.push([dayAt(d, 7) + i * 5 * MIN, 160, 165]);
pairs.sort((a, b) => a[0] - b[0]);
// the Worker's recovery for a span: 26 → 33 bpm over the 12 weeks, by its start
const recFor = (a) => { const f = 1 - (T - a) / (84 * D), drop = Math.round(26 + 7 * f + gauss() * 1.2); return { at: a + 24 * MIN, peak: 156, then: 156 - drop, drop }; };


// lifting: Mon "Pull" and Sat "Push + Quads", squat and bench each time, about +1 % a week; the last one done is a Pull
const sets = [], weights = [];
for (let d = 83; d >= 1; d--) {
  const wd = new Date(T - d * D).getDay(), f = 1 - d / 84;
  if (wd === 1 || wd === 6) {
    const s = dayAt(d, 11), id = `l${d}`, tpl = wd === 1 ? 'Pull' : 'Push + Quads';
    workouts.push({ id, template: tpl, startedAt: s, endedAt: s + 60 * MIN, plan: [] });
    for (const [ex, kg0] of [['Squat', 95], ['Bench press', 80], ['Barbell row', 70]]) for (let k = 0; k < 3; k++) sets.push({ id: `${id}${ex}${k}`, kind: 'set', at: s + (10 + k * 4) * MIN, workoutId: id, exercise: ex, kg: Math.round((kg0 * (1 + 0.12 * f)) / 2.5) * 2.5, reps: 6 });
  }
  weights.push({ id: `kg${d}`, kind: 'weight', at: dayAt(d, 7, 30), kg: Math.round((84.2 - 2.1 * f + gauss() * 0.2) * 10) / 10 });
}
const templates = [{ id: 't1', name: 'Pull', exercises: [{ name: 'Barbell row', sets: 3, reps: 6, restSec: 120 }] }, { id: 't2', name: 'Push + Quads', exercises: [{ name: 'Squat', sets: 3, reps: 6, restSec: 150 }, { name: 'Bench press', sets: 3, reps: 6, restSec: 150 }] }];
(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  await ctx.route(/\/api\/band\//, (rt) => {
    const u = new URL(rt.request().url()), op = u.pathname.split('/').pop();
    const st = { connected: true, needsReconnect: false, connectedAt: T - 100 * D, lastSync: T, latest: T - 2 * MIN, error: null, gapSec: 60 };
    if (op === 'cardio') {
      const from = +u.searchParams.get('from'), spans = (u.searchParams.get('spans') || '').split(',').filter(Boolean).map((x) => x.split('-').map(Number));
      return rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ pairs: pairs.filter((p) => p[0] >= from), rec: spans.map(([a]) => recFor(a)) }) });
    }
    rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(op === 'data' ? { hr: [], steps: [], sleep: [], rhr, hrv: {}, vo2, ...st } : st) });
  });
  const pg = await ctx.newPage();
  await pg.clock.install({ time: T });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  await pg.evaluate(([ws, es, ts]) => { const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k) || '{}'); s.workouts = ws; s.entries = es; s.templates = ts; localStorage.setItem(k, JSON.stringify(s)); }, [workouts, [...sets, ...weights], templates]);
  await pg.goto(APP + '#insights/training'); await pg.reload(); await pg.waitForSelector('.tp', { timeout: 15000 });
  const top = pg.getByRole('region', { name: 'Getting fitter?' });
  await pg.waitForFunction(() => /fitter on cardio/.test(document.querySelector('.ft-say')?.textContent || ''), null, { timeout: 10000 }).catch(() => {});
  const say = (await top.locator('.ft-say').innerText().catch(() => '')).trim();
  check(`yes on all four (${say})`, say === 'Yes on all four: stronger, fitter on cardio, recovering faster and lighter.');
  const tile = async (k) => (await top.locator(`.ft-tile[data-key="${k}"]`).getAttribute('aria-label').catch(() => '')) || '';
  check(`strength: +% and stronger (${await tile('strength')})`, /^Strength: \+\d+(\.\d)? %, stronger$/.test(await tile('strength')));
  check(`cardio: about −7 bpm at the same walking pace (${await tile('cardio')})`, /^Cardio fitness: −[5-9] bpm, fitter, at the same walking pace$/.test(await tile('cardio')));
  check(`recovery: about +6 bpm (${await tile('recovery')})`, /^Recovery: \+[4-9] bpm, faster drop after cardio$/.test(await tile('recovery')));
  check(`weight: about −2 kg, lighter (${await tile('weight')})`, /^Weight: −(1\.[89]|2\.[0-3]) kg, lighter · about −0\.2 kg a week$/.test(await tile('weight')));
  const nx = (await pg.getByRole('region', { name: 'Next', exact: true }).innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  check(`next: Push + Quads with its squat, 25 min of cardio short (${nx})`, /^next Push \+ Quads Squat 3 × \d+ at [\d.]+ kg Start 25 min of cardio 25 of your usual 50 min this week Stairmaster$/i.test(nx));
  const order = await pg.evaluate(() => [...document.querySelectorAll('.tp section[aria-label]')].map((s) => s.getAttribute('aria-label')).slice(0, 4));
  check(`first on the page: the answer, next, this week, strength (${order.join(' · ')})`, order.join('|') === 'Getting fitter?|Next|This week|Overall strength');
  check('the two analysis cards are folded', await pg.locator('.tp-more').getAttribute('open') === null && !(await pg.locator('.tp-b').isVisible().catch(() => false)));
  await top.screenshot({ path: OUT + 'trainingtop.png' }).catch(() => {});
  await pg.getByRole('region', { name: 'Next', exact: true }).screenshot({ path: OUT + 'trainingtop-next.png' }).catch(() => {});
  const wide = await pg.evaluate(() => document.documentElement.scrollWidth);
  check(`phone: nothing wider than the screen (${wide} px)`, wide <= 390);

  // a tile goes to its card; weight to Food & body
  await top.locator('.ft-tile[data-key="cardio"]').click(); await pg.waitForTimeout(900);
  const y = await pg.evaluate(() => document.getElementById('tp-cardiofit')?.getBoundingClientRect().top ?? -1);
  check(`cardio fitness tile → its card on screen (top at ${Math.round(y)} px)`, y >= -2 && y < 300);
  await top.locator('.ft-tile[data-key="weight"]').click(); await pg.waitForTimeout(300);
  check(`weight tile → Food & body (${await pg.evaluate(() => location.hash)})`, await pg.evaluate(() => location.hash) === '#insights/intake');
  // Start on the cardio row starts a stairmaster and goes to Workout
  await pg.goto(APP + '#insights/training'); await pg.waitForSelector('.ft-next');
  await pg.getByRole('region', { name: 'Next', exact: true }).getByRole('button', { name: 'Stairmaster' }).click(); await pg.waitForTimeout(400);
  const running = await pg.evaluate(() => JSON.parse(localStorage.getItem('healthos.v1:u-test')).workouts.filter((w) => w.endedAt == null).map((w) => w.cardio?.what));
  check(`Stairmaster → a running stairmaster, on Workout (${JSON.stringify(running)} · ${await pg.evaluate(() => location.hash)})`, JSON.stringify(running) === '["Stairmaster"]' && await pg.evaluate(() => location.hash) === '#workout');

  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message.split('\n')[0]); process.exit(1); });
