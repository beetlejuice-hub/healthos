// Readiness on Today (owner, 14 Oct: "also readiness score?? can check net for reference"). 35 fake nights from the band:
// HRV around 50 ms, resting HR 54, ~7 h 40 asleep, training Mon / Wed / Fri. Planted in one run: a bottle of wine's
// morning — HRV 35 ms (30 % under), resting HR 61 (owner, 15 Oct: "Charge6 app says 16 readiness … it days readiness 68").
// The strip must drop to "take it easier", say why in its one line and in a held-at note, mark those parts poor, open to
// six parts, and use the same sleep score the check-in shows — and the Sleep page shows, Today opened first; the run
// without the plant must read as ordinary, with no note. The mock sends the last 40 days of nights with any request, as
// the server does since 14 Oct.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

const MIN = 60_000, HOUR = 3_600_000, D = 86_400_000, NOW = new Date('2026-10-14T08:30:00').getTime();
const ymd = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
function rng(seed) {
  let s = seed >>> 0;
  const r = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { r, g: () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()) };
}
function world(plant) {
  const { g } = rng(9), sleep = [], hr = [], hrv = {}, rhr = {}, entries = [];
  for (let k = 35; k >= 1; k--) {
    const day0 = new Date(2026, 9, 14 - k).getTime(), T = (h) => day0 + h * HOUR; // the evening's day
    const bed = T(23.5 + g() * 0.15), onset = bed + 12 * MIN, asleepMin = 460 + g() * 12, wake = onset + asleepMin * MIN, up = wake + 6 * MIN;
    const stages = [{ type: 'awake', start: bed, end: onset }];
    for (let t = onset, c = 0; t < wake - 1; c++) { const e = Math.min(wake, t + 90 * MIN), L = e - t; stages.push({ type: 'light', start: t, end: t + L * 0.45 }, { type: c < 2 ? 'deep' : 'light', start: t + L * 0.45, end: t + L * 0.7 }, { type: 'rem', start: t + L * 0.7, end: e }); t = e; }
    stages.push({ type: 'awake', start: wake, end: up });
    sleep.push({ id: 's' + k, start: bed, end: up, asleepMin: Math.round(asleepMin), awakeMin: 12, toFallAsleepMin: 12, nap: false, stageMin: {}, stages });
    for (let t = bed - HOUR; t < up; t += 5 * MIN) { const v = Math.round((t > onset && t < wake ? 52 : 63) + g()); hr.push([t, v, v - 2, v + 2]); }
    const morning = ymd(up), today = k === 1;
    hrv[morning] = today && plant ? 35 : Math.round(Math.exp(Math.log(50) + 0.08 * g()));
    rhr[morning] = today && plant ? 61 : Math.round(54 + g());
    if (!today) entries.push({ id: 'r' + k, kind: 'sleep', at: up + 20 * MIN, rating: 8 });
    const dow = new Date(day0).getDay();
    if (dow === 1 || dow === 3 || dow === 5) for (let i = 0; i < 18; i++) entries.push({ id: `x${k}-${i}`, kind: 'set', at: T(18) + i * 3 * MIN, workoutId: 'w' + k, exercise: 'Squat', kg: 100, reps: 5 });
  }
  return { hr: hr.sort((a, b) => a[0] - b[0]), sleep, entries, hrv, rhr };
}

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  for (const plant of [true, false]) {
    const w = world(plant);
    const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    await ctx.route(/\/api\/band\//, (rt) => {
      const u = new URL(rt.request().url()), op = u.pathname.split('/').pop(), from = +u.searchParams.get('from'), to = +u.searchParams.get('to');
      const st = { connected: true, needsReconnect: false, connectedAt: NOW - 60 * D, lastSync: NOW - 3 * MIN, latest: w.hr.at(-1)[0], error: null, gapSec: 300 };
      const inR = (t) => t >= from && t <= to;
      rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(op === 'data' ? { hr: w.hr.filter((m) => inR(m[0])), steps: [], sleep: w.sleep.filter((x) => x.end >= Math.min(from, NOW - 40 * D) - D && x.start <= to), rhr: w.rhr, hrv: w.hrv, ...st } : st) });
    });
    const pg = await ctx.newPage();
    await pg.clock.install({ time: NOW });
    pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
    await pg.goto(APP);
    await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
    await pg.evaluate((es) => { const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = es; s.workouts = []; localStorage.setItem(k, JSON.stringify(s)); }, w.entries);
    await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('#feel');
    await pg.waitForSelector('.rd', { timeout: 15000 }).catch(() => {});
    // the band's weeks arrive in pieces: wait until the heart parts have their 10 mornings
    await pg.waitForFunction(() => document.querySelectorAll('.rd .sl-sp').length >= 6, null, { timeout: 15000 }).catch(() => {});
    const rd = pg.locator('.rd'), score = +(await rd.getAttribute('data-score').catch(() => 0));
    const line = (await rd.locator('summary').innerText().catch(() => '')).replace(/\n/g, ' ');
    const parts = await rd.locator('.sl-sp').evaluateAll((els) => els.map((e) => [e.dataset.part, +e.dataset.got, e.querySelector('.why').textContent]));
    const tag = plant ? 'wine: HRV 35, resting 61' : 'ordinary';
    if (plant) {
      check(`${tag}: down to "take it easier", and the line says why — HRV, resting HR (${score}; ${line})`, score > 0 && score <= 30 && /take it easier/.test(line) && /HRV this morning: 35 ms · usual (4\d|5\d)/.test(line) && /Resting HR: 61 bpm · usual 5\d/.test(line));
      const cap = await rd.locator('.rd-cap').textContent().catch(() => '');
      check(`${tag}: the note says it's held, and why (${cap})`, new RegExp(`^Held at ${score}: HRV and resting heart rate both well off your usual\\. The parts add to \\d+`).test(cap));
      const red = await rd.locator('.sl-sp[data-part="hrv"], .sl-sp[data-part="rhr"]').evaluateAll((els) => els.map((e) => [e.dataset.zone, getComputedStyle(e.querySelector('.tr i')).backgroundColor]));
      check(`${tag}: HRV and resting HR marked poor, in red (${red})`, red.length === 2 && red.every((z) => z[0] === 'poor' && z[1] === 'rgb(229, 96, 79)'));
      const h = parts.find((p) => p[0] === 'hrv');
      check(`${tag}: HRV this morning gets none of its 20 (${h})`, h && h[1] === 0);
      await rd.locator('summary').click(); await pg.waitForTimeout(150);
      check(`${tag}: opens to its six parts (${parts.map((p) => p[0]).join(', ')})`, parts.map((p) => p[0]).join(',') === 'hrv,hrv7,rhr,sleep,balance,load' && await rd.locator('.sl-sp').first().isVisible());
      const sl = parts.find((p) => p[0] === 'sleep'), hn = await pg.locator('.hn-fell .hn-score').getAttribute('data-score').catch(() => null);
      check(`${tag}: "last night" is the check-in's sleep score (${sl && sl[2]} · check-in ${hn})`, sl && hn != null && new RegExp(`^sleep score ${hn} \\(not rated yet\\)$`).test(sl[2]));
      check(`${tag}: fits the phone (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
      await rd.screenshot({ path: OUT + 'readiness-open.png' });
      // Today was opened first (a week of heart rate held): its sleep score is still the Sleep page's
      await pg.goto(APP + '#insights/sleep'); await pg.waitForSelector('.sl[data-nights]'); await pg.waitForFunction(() => +document.querySelector('.sl')?.dataset.nights >= 25, null, { timeout: 15000 }).catch(() => {}); await pg.waitForTimeout(300);
      const page = await pg.locator('.sl .sl-score').getAttribute('data-score');
      check(`the Sleep page gives last night the same score as Today (${page} · ${hn})`, page === hn);
    } else {
      check(`${tag}: reads as fine — 75+, "ready" or "good", nothing held (${score}; ${line})`, score >= 75 && /(ready|good)/.test(line) && await rd.locator('.rd-cap').count() === 0);
      await rd.screenshot({ path: OUT + 'readiness-closed.png' });
    }
    await ctx.close();
  }
  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
