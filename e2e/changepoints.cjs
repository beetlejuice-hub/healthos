// Change points (PLAN 228; owner, 24 Nov: "Lets do 3"). 90 days: resting heart rate 54, stepping to 59 on 25 Oct and
// staying; HRV flat around 60; weight falling smoothly 2 kg. Insights → Trends: resting heart has a dashed mark on its
// step (red: up is worse for it) and says "stepped up 5 bpm on 25 Oct"; HRV and weight have none — a smooth decline isn't
// a step. Phone width.
const { chromium, APP, OUT, handle, tables } = require('./harness.cjs');

const NOW = new Date('2026-11-24T15:00:00').getTime(), D = 864e5, KEY = 'healthos.v1:u-test', MIN = 60_000;
const ymd = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  let x = 11; const r = () => { x = (x * 16807) % 2147483647; return x / 2147483647; };
  const g = () => (r() + r() + r() - 1.5) * 1.1;
  const hrv = {}, rhr = {};
  for (let i = 90; i >= 1; i--) { const d = ymd(NOW - i * D); rhr[d] = Math.round(54 + g() * 1.2 + (d >= '2026-10-25' ? 5 : 0)); hrv[d] = Math.round(60 + g() * 4); }
  tables.entries.clear(); tables.docs.clear();
  const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  await ctx.route('**/api/ai**', (rt) => rt.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' }));
  await ctx.route(/\/api\/band\//, (rt) => {
    const op = new URL(rt.request().url()).pathname.split('/').pop();
    const st = { connected: true, needsReconnect: false, connectedAt: NOW - 200 * D, lastSync: NOW - MIN, latest: NOW - 2 * MIN, error: null, gapSec: 60 };
    rt.fulfill({ contentType: 'application/json', body: JSON.stringify(op === 'data' ? { hr: [], steps: [], sleep: [], rhr, hrv, ...st } : st) });
  });
  const pg = await ctx.newPage();
  await pg.clock.install({ time: NOW });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  await pg.evaluate(([k, now, D]) => {
    const s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = []; s.workouts = [];
    let x = 5; const r = () => { x = (x * 16807) % 2147483647; return x / 2147483647; };
    for (let i = 90; i >= 1; i--) { const day0 = new Date(new Date(now - i * D).setHours(0, 0, 0, 0)).getTime();
      s.entries.push({ id: 'w' + i, kind: 'weight', at: day0 + 7 * 36e5, kg: Math.round((81 - (90 - i) * 0.022 + (r() + r() + r() - 1.5) * 0.2) * 10) / 10 });
      s.entries.push({ id: 'f' + i, kind: 'food', at: day0 + 13 * 36e5, name: 'e2e lunch', grams: 500, macros: { kcal: 2200, p: 140, c: 250, f: 70 } });
      // PLAN 229: two drinks an evening from 25 Oct — what moved around the step
      if (new Date(day0).toISOString().slice(0, 10) >= '2026-10-24') for (let k = 0; k < 2; k++) s.entries.push({ id: `d${i}-${k}`, kind: 'drink', at: day0 + (20 + k) * 36e5, name: 'e2e beer', ml: 330, caffeineMg: 0, alcoholG: 14, kcal: 140 }); }
    localStorage.setItem(k, JSON.stringify(s));
  }, [KEY, NOW, D]);
  await pg.goto(APP + '#insights/week'); await pg.reload();
  await pg.evaluate(() => localStorage.setItem('healthos.trendRange', '90'));
  await pg.reload();
  const wall = pg.getByRole('region', { name: 'Every trend' });
  await wall.waitFor({ timeout: 15000 }).catch(() => {}); await pg.waitForTimeout(800);
  const panel = (k) => wall.locator(`[data-trend="${k}"]`);
  const cps = async (k) => panel(k).locator('.tw-cp').evaluateAll((l) => l.map((e) => `${e.dataset.cp}${e.classList.contains('worse') ? ' worse' : e.classList.contains('better') ? ' better' : ''}`));
  const rh = await cps('rhr'), foot = (await panel('rhr').locator('.tw-foot').innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(`resting heart: one mark near 25 Oct, red (up is worse) (${rh.join(', ')})`, rh.length === 1 && /2026-10-2[3-7] worse/.test(rh[0]));
  check(`…said under it (${foot})`, /stepped up [456] bpm on 2[3-7] Oct/.test(foot));
  check(`HRV, flat: no mark (${(await cps('hrv')).join(', ')})`, (await cps('hrv')).length === 0);
  check(`weight, falling smoothly: no mark — a slope isn't a step (${(await cps('weight')).join(', ')})`, (await cps('weight')).length === 0);
  await panel('rhr').screenshot({ path: OUT + 'changepoints-rhr.png' });
  // PLAN 229: what changed around it, and a test on resting heart
  const ar = pg.getByRole('region', { name: 'What changed around a step' });
  const at = (await ar.innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(`what changed around it: resting heart's step, drinks up (${at.slice(0, 220)})`, /Resting heart stepped up [456](\.\d)? bpm on 2[3-7] Oct/.test(at) && /drinks [0-9.]+ a week → 1[3-5](\.\d)? a week/.test(at));
  await ar.getByRole('button', { name: 'Test it on resting heart' }).first().click(); await pg.waitForTimeout(300);
  const xs = await pg.evaluate((k) => JSON.parse(localStorage.getItem(k)).ai.experiments.map((x) => [x.name, x.measure, x.days, !!x.blocks]), KEY);
  check(`"Test it": an experiment on resting heart, in blocks (${JSON.stringify(xs)})`, xs.length === 1 && xs[0][0] === 'No drinks for 14 days' && xs[0][1] === 'rhr' && xs[0][2] === 16 && xs[0][3] === true);
  check('…and the row says it\'s being tested', /being tested/.test(await ar.innerText()));
  await ar.screenshot({ path: OUT + 'aroundsteps.png' });
  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
