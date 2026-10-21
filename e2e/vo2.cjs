// Cardio fitness on the Heart page (PLAN 52; owner, 21 Oct: "do 1" — VO2 max as a trend). A fake band with 90 days of
// VO2 max: the oxygen a minute rises 3.3 → 3.5 L/min while the weight logged falls 85 → 81 kg, so the per-kg number rises
// ~+2.8 in 8 weeks, ~+1.5 of it fitness and the rest the kilos. The section must say where it is, "rising", split the
// change from the weight, draw a dot a day (hollow for Google's estimates), say a day's value on a tap (a phone has no
// hover) and on a mouse hover, fit a phone, and the AI must see the same line. A band with no VO2 max says so instead of drawing nothing.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

const MIN = 60_000, HOUR = 3_600_000, D = 86_400_000, NOW = new Date('2026-10-21T09:00:00').getTime();
const ymd = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
function rng(seed) {
  let s = seed >>> 0;
  const r = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
}
function world(withVo2) {
  const g = rng(52), hr = [], vo2 = {}, entries = [], rhr = {}, hrv = {};
  for (let k = 89; k >= 0; k--) {
    const day0 = new Date(2026, 9, 21 - k).getTime(), kg = 81 + (4 * k) / 89, l = 3500 - (200 * k) / 89, d = ymd(day0);
    if (withVo2) vo2[d] = { v: +(l / kg + 0.25 * g()).toFixed(1), level: 'GOOD', ...(k === 40 || k === 41 ? { est: true } : {}) };
    if (k % 2 === 0) entries.push({ id: 'kg' + k, kind: 'weight', at: day0 + 7.5 * HOUR, kg: +kg.toFixed(1) });
    rhr[d] = 54; hrv[d] = 50;
    if (k <= 1) for (let t = day0; t < Math.min(day0 + D, NOW); t += 5 * MIN) { const v = 62 + Math.round(3 * g()); hr.push([t, v, v - 2, v + 2]); }
  }
  return { hr, vo2, entries, rhr, hrv };
}

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  for (const withVo2 of [true, false]) {
    const w = world(withVo2), tag = withVo2 ? '90 days of VO2 max' : 'no VO2 max';
    const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    await ctx.route(/\/api\/band\//, (rt) => {
      const u = new URL(rt.request().url()), op = u.pathname.split('/').pop(), from = +u.searchParams.get('from'), to = +u.searchParams.get('to');
      const st = { connected: true, needsReconnect: false, connectedAt: NOW - 90 * D, lastSync: NOW - 3 * MIN, latest: w.hr.at(-1)[0], error: null, gapSec: 300 };
      rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(op === 'data' ? { hr: w.hr.filter((m) => m[0] >= from && m[0] <= to), steps: [], sleep: [], rhr: w.rhr, hrv: w.hrv, vo2: w.vo2, ...st } : st) });
    });
    const pg = await ctx.newPage();
    await pg.clock.install({ time: NOW });
    pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
    await pg.goto(APP);
    await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
    await pg.evaluate((es) => { const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = es; s.workouts = []; localStorage.setItem(k, JSON.stringify(s)); }, w.entries);
    await pg.goto(APP + '#insights/heart'); await pg.reload();
    await pg.waitForSelector('.hp-vo2', { timeout: 15000 }).catch(() => {});
    const sec = pg.locator('.hp-vo2');
    if (withVo2) {
      const line = await sec.locator('.vo2-line').innerText().catch(() => '');
      check(`${tag}: where it is and which way — rising, and the split from the kilos (${line})`,
        /^VO2 max this week 4[23]\.\d — good for your age \(Fitbit's level\)\. \+[12]\.\d over 8 weeks, rising — at the same weight \+1\.\d; the rest goes with the 2\.\d kg lost \(it's per kg\)\.$/.test(line));
      check(`${tag}: marked rising (${await sec.getAttribute('data-trend')})`, (await sec.getAttribute('data-trend')) === 'up');
      const dots = await sec.locator('svg circle').evaluateAll((cs) => cs.map((c) => c.getAttribute('fill')));
      check(`${tag}: a dot a day, the two estimates hollow (${dots.length} dots, ${dots.filter((f) => f === 'var(--i-panel)').length} hollow)`, dots.length === 90 && dots.filter((f) => f === 'var(--i-panel)').length === 2);
      await sec.locator('svg').scrollIntoViewIfNeeded();
      const box = await sec.locator('svg rect').last().boundingBox();
      await pg.touchscreen.tap(box.x + box.width * 0.995, box.y + box.height / 2); await pg.waitForTimeout(100);
      const tap = await sec.locator('.vo2-hov-note').innerText();
      check(`${tag}: a tap says that day's value (${tap})`, /^Wed 21 Oct: 4\d\.\d · good$/.test(tap));
      await pg.touchscreen.tap(box.x + box.width * ((89 - 40.5) / 90), box.y + box.height / 2); await pg.waitForTimeout(100);
      const est = await sec.locator('.vo2-hov-note').innerText();
      check(`${tag}: …and an estimate says so (${est})`, /^\w{3} 1[01] Sept?: 4\d\.\d · good · an estimate$/.test(est));
      check(`${tag}: fits the phone (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
      await sec.screenshot({ path: OUT + 'vo2.png' });
      await pg.goto(APP + '#settings'); await pg.waitForSelector('#ai');
      await pg.getByRole('button', { name: 'What the AI sees about me' }).click();
      const seen = await pg.locator('.ctx').innerText().catch(() => '');
      check('the AI sees the same line under Training', /## Training[\s\S]*- VO2 max this week 4[23]\.\d — good for your age[^\n]*rising — at the same weight/.test(seen) && seen.includes(line));
    } else {
      check(`${tag}: says nothing came yet (${await sec.innerText().catch(() => '')})`, /Nothing from the band yet/.test(await sec.innerText().catch(() => '')));
    }
    await ctx.close();
  }
  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
