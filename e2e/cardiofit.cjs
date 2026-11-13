// Cardio fitness without typing (PLAN 218; canvas A). 12 weeks of the Worker's 5-minute windows with a known change
// planted — walking at ~115 steps a minute from 112 to 104 bpm, the stairmaster from 158 to 151 — two runs, and the
// recovery after each stairmaster session from 26 to 33 bpm. The Training page's "Cardio fitness" card: a row per lane
// with the right numbers and chips, the walking row opens on the two clouds, recovery on each session's drop; the card asks
// for the 12 weeks' sessions in order; resting heart rate and VO2 max on the same weeks; nothing wider than the phone;
// no band, no card.
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
  if (wd === 2 || wd === 4) {
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

(async () => {
  const b = await chromium.launch(); const errs = [], asked = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  let connected = true;
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  await ctx.route(/\/api\/band\//, (rt) => {
    const u = new URL(rt.request().url()), op = u.pathname.split('/').pop();
    const st = { connected, needsReconnect: false, connectedAt: T - 100 * D, lastSync: T, latest: T - 2 * MIN, error: null, gapSec: 60 };
    if (op === 'cardio') {
      asked.push(u.searchParams.get('spans') || '');
      const from = +u.searchParams.get('from'), spans = (u.searchParams.get('spans') || '').split(',').filter(Boolean).map((x) => x.split('-').map(Number));
      return rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ pairs: pairs.filter((p) => p[0] >= from), rec: spans.map(([a]) => recFor(a)) }) });
    }
    rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(op === 'data' ? { hr: [], steps: [], sleep: [], rhr, hrv: {}, vo2, ...st } : st) });
  });
  const pg = await ctx.newPage();
  await pg.clock.install({ time: T });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  await pg.evaluate(([ws]) => { const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k) || '{}'); s.workouts = ws; s.entries = [{ id: 'kg', kind: 'weight', at: Date.now() - 864e5, kg: 81 }]; localStorage.setItem(k, JSON.stringify(s)); }, [workouts]);
  await pg.goto(APP + '#insights/training'); await pg.reload(); await pg.waitForSelector('.tp', { timeout: 15000 }).catch(async () => { await pg.screenshot({ path: OUT + 'cardiofit-fail.png' }); console.log('errors so far', JSON.stringify(errs)); });
  const card = pg.getByRole('region', { name: 'Cardio fitness' });
  await card.waitFor({ timeout: 10000 }).catch(() => {});
  const txt = (await card.innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(`the lead line: walking at 115, about 112 → 104, lower (${(txt.match(/Walking at[^.]*\./) || [''])[0]})`, /Walking at 115 steps a minute: 11[1-3] → 10[3-5] bpm since \d+ Aug, lower, which goes with fitter\./.test(txt));
  const row = (lane) => card.locator(`.cf-row[data-lane="${lane}"]`), rowText = async (lane) => (await row(lane).innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(`rows: walking, stairmaster, running, then recovery (${await card.getAttribute('data-lanes')})`, (await card.getAttribute('data-lanes')) === 'walk stair run' && await row('rec').count() === 1);
  check(`walking: about 104 at 115/min, −8 · fitter (${await rowText('walk')})`, /10[3-5]bpm at 115\/min/.test(await rowText('walk')) && /−[6-9] bpm · fitter/.test(await rowText('walk')));
  check(`stairmaster: at 90/min, about −7 · fitter (${await rowText('stair')})`, /bpm at 90\/min/.test(await rowText('stair')) && /−[5-9] bpm · fitter/.test(await rowText('stair')));
  check(`running: 2 weeks of runs, no line yet (${await rowText('run')})`, /2 of 4 weeks/.test(await rowText('run')));
  check(`recovery: the last drop, +7 · fitter (${await rowText('rec')})`, /bpm drop in 2 min/.test(await rowText('rec')) && /\+[5-9] · fitter/.test(await rowText('rec')));
  const sp = (asked.at(-1) || '').split(',').filter(Boolean);
  check(`asked the Worker for every stairmaster session in the 12 weeks, oldest first (${sp.length} of ${workouts.length})`, sp.length === workouts.length && sp.every((x, i) => i === 0 || +x.split('-')[0] > +sp[i - 1].split('-')[0]));
  check(`resting heart rate and VO2 max on the same weeks (${(await card.locator('.cf-mini').innerText().catch(() => '')).replace(/\s+/g, ' ')})`, /Resting heart rate 5[7-9] bpm VO2 max \(band\) 43\.\d/.test((await card.locator('.cf-mini').innerText().catch(() => '')).replace(/\s+/g, ' ')));
  await card.screenshot({ path: OUT + 'cardiofit.png' }).catch(() => {});

  // a row opens to why: the clouds for walking, each session's drop for recovery; tapping again closes it
  await row('walk').click();
  const cloud = card.getByRole('img', { name: /Heart rate against steps a minute/ });
  const name = await cloud.getAttribute('aria-label').catch(() => '');
  check(`walking opens on the two clouds, the gap at 115 (${name})`, /at 115 a minute [5-9] bpm lower now/.test(name || ''));
  check('…and says how it is worked out', /first 5 minutes of each bout are left out/.test(await card.locator('.cf-detail').innerText().catch(() => '')));
  await card.locator('.cf-detail').screenshot({ path: OUT + 'cardiofit-walk.png' }).catch(() => {});
  await row('rec').click();
  check('recovery opens on each session\'s drop (walking closes)', await card.getByRole('img', { name: /Heart-rate drop after each of \d+ cardio sessions/ }).count() === 1 && await cloud.count() === 0);
  check(`…with its line (${(await card.locator('.cf-detail .cf-say').innerText().catch(() => '')).trim()})`, /After cardio your heart rate falls 2\d → 3\d bpm in 2 minutes since \d+ Aug, a faster drop, which goes with fitter\./.test(await card.locator('.cf-detail .cf-say').innerText().catch(() => '')));
  await row('rec').click();
  check('tapping again closes it', await card.locator('.cf-detail').count() === 0);
  const wide = await pg.evaluate(() => document.documentElement.scrollWidth);
  check(`phone: nothing wider than the screen (${wide} px)`, wide <= 390);

  // the band not connected: no card
  connected = false; await pg.reload(); await pg.waitForSelector('.tp', { timeout: 15000 }); await pg.waitForTimeout(800);
  check('no band: no card', await pg.getByRole('region', { name: 'Cardio fitness' }).count() === 0);

  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message.split('\n')[0]); process.exit(1); });
