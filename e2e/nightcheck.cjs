// The night check (PLAN 52; owner, 21 Oct: "1 good / 2 line"): last night's skin temperature, breathing and blood oxygen
// against your usual, a line under readiness — the score unchanged. 35 fake nights: skin 33.8 °C, breathing 14.5 a minute,
// blood oxygen 96 %, each with its ordinary night-to-night wobble; heart and sleep as usual. Planted in one run: last night
// skin +0.9 °C and breathing +2.2 (what a cold coming on looks like on a band). Since Today A (28 Oct: the readiness line
// cut) the line is an ask in "For you": it must name both and say they go together; opened, all three with their usual;
// readiness (now only told to the AI) the same as without the plant; and "What the AI sees" must carry it. The run without
// the plant: nothing asked.
const { chromium, APP, OUT, handle, forYou } = require('./harness.cjs');

const MIN = 60_000, HOUR = 3_600_000, D = 86_400_000, NOW = new Date('2026-10-21T08:30:00').getTime();
const ymd = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
function rng(seed) {
  let s = seed >>> 0;
  const r = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { r, g: () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()) };
}
function world(plant) {
  const { g } = rng(21), sleep = [], hr = [], hrv = {}, rhr = {}, skin = {}, breath = {}, spo2 = {};
  for (let k = 35; k >= 1; k--) {
    const day0 = new Date(2026, 9, 21 - k).getTime(), T = (h) => day0 + h * HOUR, last = k === 1;
    const bed = T(23.4 + g() * 0.15), onset = bed + 12 * MIN, wake = onset + (455 + g() * 10) * MIN, up = wake + 6 * MIN;
    const stages = [{ type: 'awake', start: bed, end: onset }];
    for (let t = onset, c = 0; t < wake - 1; c++) { const e = Math.min(wake, t + 90 * MIN), L = e - t; stages.push({ type: 'light', start: t, end: t + L * 0.45 }, { type: c < 2 ? 'deep' : 'light', start: t + L * 0.45, end: t + L * 0.7 }, { type: 'rem', start: t + L * 0.7, end: e }); t = e; }
    stages.push({ type: 'awake', start: wake, end: up });
    sleep.push({ id: 'n' + k, start: bed, end: up, asleepMin: Math.round((wake - onset) / MIN), awakeMin: 12, toFallAsleepMin: 12, nap: false, stageMin: {}, stages });
    for (let t = bed - HOUR; t < up; t += 5 * MIN) { const v = Math.round((t > onset && t < wake ? 52 : 63) + g()); hr.push([t, v, v - 2, v + 2]); }
    const m = ymd(up), ill = last && plant;
    hrv[m] = Math.round(Math.exp(Math.log(50) + 0.08 * g())); rhr[m] = Math.round(54 + g());
    skin[m] = +(33.8 + 0.12 * g() + (ill ? 0.9 : 0)).toFixed(2);
    breath[m] = +(14.5 + 0.3 * g() + (ill ? 2.2 : 0)).toFixed(1);
    spo2[m] = +(96 + 0.5 * g()).toFixed(1);
  }
  return { hr: hr.sort((a, b) => a[0] - b[0]), sleep, hrv, rhr, skin, breath, spo2 };
}

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const scores = {}; // readiness, as the AI is told it
  for (const plant of [true, false]) {
    const w = world(plant), tag = plant ? 'skin +0.9 °C, breathing +2.2' : 'an ordinary night';
    const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    await ctx.route(/\/api\/band\//, (rt) => {
      const u = new URL(rt.request().url()), op = u.pathname.split('/').pop(), from = +u.searchParams.get('from'), to = +u.searchParams.get('to');
      const st = { connected: true, needsReconnect: false, connectedAt: NOW - 60 * D, lastSync: NOW - 3 * MIN, latest: w.hr.at(-1)[0], error: null, gapSec: 300 };
      const inR = (t) => t >= from && t <= to;
      rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(op === 'data' ? { hr: w.hr.filter((m) => inR(m[0])), steps: [], sleep: w.sleep.filter((x) => x.end >= Math.min(from, NOW - 40 * D) - D && x.start <= to), rhr: w.rhr, hrv: w.hrv, skin: w.skin, breath: w.breath, spo2: w.spo2, ...st } : st) });
    });
    const pg = await ctx.newPage();
    await pg.clock.install({ time: NOW });
    pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
    await pg.goto(APP);
    await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
    await pg.evaluate(() => { const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = []; s.workouts = []; localStorage.setItem(k, JSON.stringify(s)); });
    await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('#feel');
    // Today A (owner, 28 Oct): the readiness line is gone; the night check is an ask in "For you", only when something's off
    await pg.locator('.hn-score').waitFor({ state: 'attached', timeout: 15000 }).catch(() => {}); // the band is in
    await pg.locator('.nightask').waitFor({ state: 'attached', timeout: plant ? 8000 : 1500 }).catch(() => {});
    check(`${tag}: no readiness line on Today`, await pg.locator('.rd').count() === 0);
    if (!plant) check(`${tag}: nothing asked`, await pg.locator('.nightask').count() === 0 && !(await pg.locator('.fy-item').allInnerTexts()).some((t) => /Night check/.test(t)));
    else {
      await forYou(pg, 'nightcheck');
      const ask = pg.getByRole('region', { name: "Last night's check" }), night = await ask.locator('.rd-night').innerText().catch(() => '');
      check(`${tag}: in "For you", names both, says they go together (${night})`,
        await ask.isVisible().catch(() => false) && /^Night check: skin \d\.\d °C over your usual and breathing [12]\.\d\/min over your usual — together these go with getting ill/.test(night) && !/cause/.test(night));
      await ask.screenshot({ path: OUT + 'nightcheck-line.png' });
      await ask.getByRole('button', { name: 'All three against your usual' }).click(); await pg.waitForTimeout(150);
      const rows = await ask.locator('.nc li').evaluateAll((els) => els.map((e) => [e.dataset.sig, !!e.dataset.off, e.innerText.replace(/\s+/g, ' ')]));
      check(`${tag}: opened, all three with their usual (${rows.map((r) => r[2]).join(' | ')})`, rows.length === 3 && rows.every((r) => /usual \d/.test(r[2])) && /^Skin temperature 3\d\.\d °C usual 33\.\d/.test(rows[0][2]));
      check(`${tag}: skin and breathing marked off (${rows.filter((r) => r[1]).map((r) => r[0]).join(',')})`, rows.filter((r) => r[1]).map((r) => r[0]).join(',') === 'skin,breath');
      await ask.screenshot({ path: OUT + 'nightcheck-open.png' });
    }
    check(`${tag}: fits the phone (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
    await pg.goto(APP + '#settings'); await pg.waitForSelector('#ai');
    await pg.getByRole('button', { name: 'What the AI sees about me' }).click();
    const seen = await pg.locator('.ctx').innerText().catch(() => '');
    check(`${tag}: the AI sees last night's three against the usual${plant ? ', and the line' : ''}`, /## This morning \(readiness[^\n]*the night check[^\n]*\n[\s\S]*- Last night from the band: Skin temperature 3\d\.\d °C \(usual 33\.\d/.test(seen) && (plant ? /- Night check: skin \d\.\d °C over your usual and breathing/.test(seen) : !/Night check:/.test(seen)));
    scores[plant] = +((seen.match(/- Readiness (\d+)\/100/) || [])[1] || 0);
    check(`${tag}: and each night's in the list of nights`, /score \d+\/100[^\n]*skin temperature [+−]\d\.\d °C vs usual, breathing 1\d\.\d\/min, blood oxygen 9\d %/.test(seen));
    await ctx.close();
  }
  check(`the score is the same with or without the plant — a line, not a change (${scores.true} · ${scores.false})`, scores.true > 0 && scores.true === scores.false);
  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
