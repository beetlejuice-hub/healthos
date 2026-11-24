// Recovery and load (PLAN 227; owner, 24 Nov: "5"). 80 days of HRV around 60 ms and resting heart rate 54; the last 8 days
// HRV 45 and resting heart rate 58. Three workouts this week rated "how hard" 8 for an hour; four weeks before, two a week
// at 5. Insights → Training: HRV under your normal, resting heart rate +4, "Strain building" going with this week's load;
// this week 1,440 against a usual 600. Today's brief says strain is building. A past session has "How hard?".
const { chromium, APP, OUT, handle, tables } = require('./harness.cjs');

const NOW = new Date('2026-11-24T09:00:00').getTime(), D = 864e5, H = 36e5, KEY = 'healthos.v1:u-test', MIN = 60_000;
const ymd = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  let x = 7; const r = () => { x = (x * 16807) % 2147483647; return x / 2147483647; };
  const hrv = {}, rhr = {};
  for (let k = 80; k >= 0; k--) { const d = ymd(NOW - k * D), late = k < 8; hrv[d] = Math.round(60 * (1 + (r() - 0.5) * 0.12) * (late ? 0.75 : 1)); rhr[d] = 54 + (late ? 4 : 0); }
  tables.entries.clear(); tables.docs.clear();
  const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  await ctx.route('**/api/ai**', (rt) => rt.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' }));
  await ctx.route(/\/api\/band\//, (rt) => {
    const op = new URL(rt.request().url()).pathname.split('/').pop();
    const st = { connected: true, needsReconnect: false, connectedAt: NOW - 100 * D, lastSync: NOW - MIN, latest: NOW - 2 * MIN, error: null, gapSec: 60 };
    rt.fulfill({ contentType: 'application/json', body: JSON.stringify(op === 'data' ? { hr: [], steps: [], sleep: [], rhr, hrv, ...st } : st) });
  });
  const pg = await ctx.newPage();
  await pg.clock.install({ time: NOW });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource|500/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  await pg.evaluate(([k, now, D, H]) => {
    const s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = Array.from({ length: 30 }, (_, i) => ({ id: 'f' + i, kind: 'food', at: now - (i + 1) * D + 4 * H, name: 'e2e lunch', grams: 400, macros: { kcal: 800, p: 40, c: 90, f: 30 } }));
    const wk = (daysAgo, rpe) => ({ id: `w${daysAgo}`, template: 'Cardio', kind: 'cardio', startedAt: now - daysAgo * D - 10 * H, endedAt: now - daysAgo * D - 9 * H, rpe, cardio: { what: 'Run', startedAt: now - daysAgo * D - 10 * H, done: true, at: now - daysAgo * D - 9 * H } });
    s.workouts = [wk(1, 8), wk(3, 8), wk(5, 8), ...[8, 11, 15, 18, 22, 25, 29, 32].map((d) => wk(d, 5))];
    localStorage.setItem(k, JSON.stringify(s));
  }, [KEY, NOW, D, H]);
  await pg.goto(APP + '#insights/training'); await pg.reload();
  const card = pg.getByRole('region', { name: 'Recovery and load' });
  await card.waitFor({ timeout: 15000 }).catch(() => {});
  await pg.waitForTimeout(800);
  const t = (await card.innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(`HRV under your normal, resting heart rate +4 (${t.slice(0, 260)})`, await card.getAttribute('data-hrv', { timeout: 2000 }).catch(() => null) === 'below' && /under your normal/.test(t) && /58 bpm normal 54 · \+4/i.test(t));
  check(`strain building, going with this week's load (${(t.match(/Strain building[^]*?\.(?: Goes with[^.]*\.)?/) || [''])[0]})`, await card.getAttribute('data-strain', { timeout: 2000 }).catch(() => null) === 'yes' && /Goes with: this week's load 140 % over your usual/.test(t));
  check(`this week's load 1,440 against a usual 600 (${(t.match(/THIS WEEK'S LOAD[^]*?%/i) || [''])[0]})`, /1,440/.test(t) && /your usual week 600 · \+140 %/.test(t));
  await card.screenshot({ path: OUT + 'recoveryload.png' });
  check(`fits the phone (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
  await pg.goto(APP + '#today'); await pg.waitForTimeout(1200);
  const brief = (await pg.getByRole('region', { name: 'Your brief' }).innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(`Today's brief: strain building (${(brief.match(/Strain building[^.]*\./) || [''])[0]})`, /Strain building: HRV under your normal \d+ days, resting heart rate \+4 — goes with this week's load/.test(brief));
  await pg.goto(APP + '#workout'); await pg.reload(); await pg.waitForSelector('.cockpit').catch(() => {}); await pg.waitForTimeout(800);
  // below the fold, under the tab bar on a phone: clicked as a tap after scrolling would be
  const ids = await pg.locator('.rec-open').evaluateAll((l) => l.map((e) => e.dataset.id));
  check(`Recent: the newest first, whatever order they were saved in (${ids.join(',')})`, ids.join(',') === 'w1,w3,w5,w8,w11');
  await pg.locator('.rec-open[data-id="w1"]').evaluate((el) => { el.scrollIntoView({ block: 'center' }); el.click(); }); await pg.waitForTimeout(400);
  check(`a past session: "How hard?" beside "How did it go?" (${await pg.locator('.rec-open').count()} recent)`, await pg.getByRole('dialog').getByText('How hard?').count() >= 1);
  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
