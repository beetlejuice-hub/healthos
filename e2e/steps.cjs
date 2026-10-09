// Steps from the band (PLAN 66; owner, 9 Oct: "wondering if the data is valuable for us like more walking equals better
// sleep at night or better mood"). 30 fake days of heart rate, sleep and 5-minute step counts; on 5 days the band was only
// on 07–09 (those days have no total — not "fewer steps"). Planted: a day with more steps than usual → an hour more sleep
// that night and mood +1 that day; focus nothing. Today 11:00–11:40 a walk with heart rate +20 (explained by the steps,
// not asked); yesterday 15:00–15:45 +18 with nothing around it (asked).
const { chromium, APP, OUT, handle } = require('./harness.cjs');

const MIN = 60_000, HOUR = 3_600_000;
const NOW = new Date('2026-10-09T16:30:00').getTime();
function rng(seed) {
  let s = seed >>> 0;
  const r = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { r, g: () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()) };
}
const cl = (v) => Math.max(1, Math.min(10, Math.round(v)));
function world() {
  const { g } = rng(21), hr = [], steps = [], sleep = [], entries = [], off = new Set();
  const totals = Array.from({ length: 32 }, () => Math.round(7000 + g() * 2500));
  const mid = [...totals].sort((a, b) => a - b)[16], more = (k) => totals[k] > mid;
  for (let k = 30; k >= 0; k--) {
    const day0 = new Date(2026, 9, 9 - k).getTime(), T = (h) => day0 + h * HOUR, isOff = k % 6 === 5;
    if (isOff) off.add(k);
    // the night ending this morning: an hour more after a day with more steps than usual (yesterday's = k + 1)
    const hrs = 6.8 + g() * 0.2 + (more(k + 1) ? 1 : 0), bed = T(-0.9 + g() * 0.15), up = bed + (hrs * 60 + 20) * MIN;
    const onset = bed + 12 * MIN, wake = up - 8 * MIN, stages = [{ type: 'awake', start: bed, end: onset }];
    for (let t = onset, c = 0; t < wake - 20 * MIN; c++) { const e = Math.min(wake, t + 90 * MIN), L = e - t; stages.push({ type: 'light', start: t, end: t + L * 0.45 }, { type: c < 2 ? 'deep' : 'light', start: t + L * 0.45, end: t + L * 0.7 }, { type: 'rem', start: t + L * 0.7, end: e }); t = e; }
    stages.push({ type: 'awake', start: wake, end: up });
    if (k < 30) sleep.push({ id: 's' + k, start: bed, end: up, asleepMin: Math.round(hrs * 60), awakeMin: 20, toFallAsleepMin: 12, nap: false, stageMin: {}, stages });
    // steps: three walks at 100 a minute; the band off → only a little before 09:00
    const walks = [];
    if (isOff) steps.push([T(7.5), 5, 200]);
    else for (const h of [9.25, 13, 18]) { let left = Math.round(totals[k] / 3); for (let t = T(h); left > 0; t += 5 * MIN) { const n = Math.min(500, left); steps.push([t, 5, n]); left -= n; } }
    if (k === 0) for (let i = 0; i < 8; i++) { steps.push([T(11) + i * 5 * MIN, 5, 480]); walks.push(T(11) + i * 5 * MIN); }
    const [h0, h1] = isOff ? [7, 9] : [7, 23];
    for (let t = T(h0); t < T(h1) && t <= NOW; t += MIN) {
      const plant = (k === 0 && t >= T(11) && t < T(11) + 40 * MIN) ? 20 : (k === 1 && t >= T(15) && t < T(15.75)) ? 18 : 0;
      const v = Math.round(63 + g() * 1.2 + plant); hr.push([t, v, v - 2, v + 2]);
    }
    if (k > 0 || NOW > T(19.5)) entries.push({ id: 'f' + k, kind: 'feel', at: T(19.5), mood: cl(6.2 + g() * 0.4 + (more(k) ? 1 : 0)), energy: cl(6 + g() * 0.4), stress: cl(4 + g() * 0.5), focus: cl(5.5 + g() * 0.5) });
  }
  return { hr, steps: steps.filter((s) => s[0] < NOW).sort((a, b) => a[0] - b[0]), sleep, entries: entries.filter((e) => e.at < NOW).sort((a, b) => a.at - b.at), off };
}

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const w = world();
  const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  await ctx.route(/\/api\/band\//, (rt) => {
    const u = new URL(rt.request().url()), op = u.pathname.split('/').pop(), from = +u.searchParams.get('from'), to = +u.searchParams.get('to');
    const st = { connected: true, needsReconnect: false, connectedAt: NOW - 40 * 86_400_000, lastSync: NOW - 3 * MIN, latest: w.hr.at(-1)[0], error: null, gapSec: 60 };
    const inR = (t) => t >= from && t <= to;
    rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(op === 'data' ? { hr: w.hr.filter((m) => inR(m[0])), steps: w.steps.filter((s) => inR(s[0])), sleep: w.sleep.filter((s) => s.end >= from - 86_400_000 && s.start <= to), rhr: {}, hrv: {}, ...st } : st) });
  });
  const pg = await ctx.newPage();
  await pg.clock.install({ time: NOW });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  await pg.evaluate((es) => { const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = es; s.workouts = []; localStorage.setItem(k, JSON.stringify(s)); }, w.entries);

  // ---- Heart: today's walk explained by the steps, the strip under the chart
  await pg.goto(APP + '#insights/heart'); await pg.reload();
  await pg.waitForSelector('.hp[data-sec]'); await pg.waitForSelector('.hp-raised-row', { timeout: 15000 }).catch(() => {});
  const rows = () => pg.locator('.hp-raised-row').evaluateAll((els) => els.map((e) => [e.dataset.explained, e.innerText.replace(/\n/g, ' ')]));
  const today = await rows();
  const walk = today.find((r) => /^11:0\d–11:[34]\d/.test(r[1]));
  check(`today 11:00 walk: explained by the band's steps, not asked (${walk && walk[1]})`, walk && walk[0] === 'true' && /on the move — [\d,]{5} steps/.test(walk[1]) && !/what were you doing/.test(walk[1]));
  const bars = await pg.locator('.hp-steps rect').count(), key = await pg.locator('.hp-day .hp-key').innerText();
  check(`steps strip under the chart (${bars} bars) and today's total in the key (${(key.match(/steps · [^\n]*/) || [''])[0]})`, bars >= 10 && /steps · [\d,]+ so far/.test(key));
  await pg.locator('.hp-chart').scrollIntoViewIfNeeded();
  await pg.locator('.hp-day').screenshot({ path: OUT + 'steps-heart.png' });
  await pg.getByRole('button', { name: 'The day before' }).click(); await pg.waitForTimeout(300);
  const yest = (await rows()).find((r) => /^15:0\d–15:[45]\d/.test(r[1]));
  check(`yesterday 15:00, no steps around it: still asked (${yest && yest[1].slice(0, 60)})`, yest && yest[0] === 'false' && /what were you doing/.test(yest[1]));
  check(`phone: nothing wider than the screen (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);

  const cell = (sel, f, o) => pg.locator(`${sel} .sl-cell`).evaluateAll((els, [f, o]) => { const e = els.find((x) => x.getAttribute('aria-label')?.startsWith(`${f} and ${o}:`)); return e ? [e.dataset.sure, e.dataset.toward, e.textContent] : null; }, [f, o]);
  const rowCount = (sel, name) => pg.locator(`${sel} .sl-mf`).evaluateAll((els, name) => { const e = els.find((x) => x.firstChild.textContent === name); const m = e?.querySelector('small')?.textContent.match(/(\d+) vs (\d+)/); return m ? +m[1] + +m[2] : null; }, name);

  // ---- Sleep: more steps that day → asleep longer, only worn days counted
  await pg.goto(APP + '#insights/sleep'); await pg.waitForSelector('.sl[data-nights]');
  await pg.waitForFunction(() => +document.querySelector('.sl')?.dataset.nights >= 25, null, { timeout: 15000 }).catch(() => {});
  await pg.waitForTimeout(300);
  const nightsN = +(await pg.locator('.sl').getAttribute('data-nights'));
  const sa = await cell('.sl', 'More steps than usual that day', 'Asleep'), sN = await rowCount('.sl', 'More steps than usual that day');
  check(`sleep grid: more steps that day → asleep longer, planted +60 m found (${sa})`, sa && (sa[0] === 'clear' || sa[0] === 'likely') && sa[1] === 'better' && /^\+\d+m$/.test(sa[2]));
  check(`sleep grid: days the band was off left out, not counted as fewer steps (${sN} of ${nightsN} nights)`, sN != null && nightsN - sN >= 4 && nightsN - sN <= 6);

  // ---- Mind: more steps → mood that day; focus nothing
  await pg.goto(APP + '#insights/mind'); await pg.waitForSelector('.mp[data-sec]');
  await pg.waitForFunction(() => +document.querySelector('.mp')?.dataset.nights >= 25, null, { timeout: 15000 }).catch(() => {});
  await pg.waitForTimeout(300);
  const mm = await cell('.mp', 'More steps than usual', 'Mood'), mf = await cell('.mp', 'More steps than usual', 'Focus');
  check(`mind grid: more steps → mood +1 planted, found (${mm})`, mm && (mm[0] === 'clear' || mm[0] === 'likely') && mm[1] === 'better');
  check(`mind grid: focus, nothing planted, nothing found (${mf})`, mf && mf[0] !== 'clear' && mf[0] !== 'likely');
  await pg.locator('.mp .sl-c').screenshot({ path: OUT + 'steps-mind.png' });
  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
