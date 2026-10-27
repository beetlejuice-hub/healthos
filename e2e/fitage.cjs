// Insights → Body lab, your heart's fitness age (PLAN 177, body lab 4; owner, 27 Oct: "yes", "men"). A fake band with 90
// days of VO2 max: the oxygen a minute rises 3.3 → 3.5 L/min while the weight logged falls 85 → 81 kg, resting heart rate
// 57 → 54. Age 28 set, men's or women's not yet: the card must ask once (one tap), then show the age on HUNT's men's norms,
// 12 weekly dots with your age dashed, the change split into fitness and the kilos, the resting heart rate alongside
// (without years), a tap on a dot naming its week; Settings shows the choice, the AI sees the same numbers; it fits a
// 390 and a 320 phone. Control: a band with no VO2 max — the card says what it needs, nothing made up.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

const MIN = 60_000, HOUR = 3_600_000, D = 86_400_000, NOW = new Date('2026-10-27T10:00:00').getTime();
const ymd = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
function rng(seed) { let s = seed >>> 0; const r = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; return () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()); }
function world(withVo2) {
  const g = rng(41), hr = [], vo2 = {}, entries = [], rhr = {}, hrv = {};
  for (let k = 89; k >= 0; k--) {
    const day0 = new Date(2026, 9, 27 - k).getTime(), kg = 81 + (4 * k) / 89, l = 3500 - (200 * k) / 89, d = ymd(day0);
    if (withVo2) vo2[d] = { v: +(l / kg + 0.25 * g()).toFixed(1), level: 'GOOD' };
    if (k % 2 === 0) entries.push({ id: 'kg' + k, kind: 'weight', at: day0 + 7.5 * HOUR, kg: +kg.toFixed(1) });
    rhr[d] = k > 50 ? 57 : 54; hrv[d] = 50;
    if (k <= 1) for (let t = day0; t < Math.min(day0 + D, NOW); t += 5 * MIN) { const v = 62 + Math.round(3 * g()); hr.push([t, v, v - 2, v + 2]); }
  }
  return { hr, vo2, entries, rhr, hrv };
}

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  async function open(w, width, age = 28) {
    const ctx = await b.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    await ctx.route('**/api/ai**', (rt) => rt.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' }));
    await ctx.route(/\/api\/(band|push)\//, (rt) => {
      const u = new URL(rt.request().url()), op = u.pathname.split('/').pop(), from = +u.searchParams.get('from'), to = +u.searchParams.get('to');
      if (u.pathname.includes('/push/')) return rt.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"devices":[],"next":null}' });
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
    await pg.evaluate(([es, age]) => { const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = es; s.workouts = []; s.settings = { ...s.settings, age }; delete s.settings.sex; localStorage.setItem(k, JSON.stringify(s)); }, [w.entries, age]);
    await pg.goto(APP + '#insights/lab'); await pg.reload();
    await pg.waitForSelector('[data-card="fitage"]', { timeout: 15000 }).catch(() => {});
    return { ctx, pg };
  }

  let { ctx, pg } = await open(world(true), 390);
  let card = pg.locator('[data-card="fitage"]');
  const ask = (await card.innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(`asks once: men's or women's norms, one tap (${ask.slice(0, 120)})`, (await card.getAttribute('data-ask')) === 'sex' && /Set it against: Men Women/.test(ask));
  await card.getByRole('button', { name: 'Men', exact: true }).click();
  await pg.waitForSelector('[data-card="fitage"].fa');
  card = pg.locator('[data-card="fitage"]');
  const t = (await card.innerText()).replace(/\s+/g, ' ');
  const age = +(await card.getAttribute('data-age'));
  console.log('card:', t.slice(0, 400));
  // VO2 max ~43 this week → on HUNT's men's line about 54; 8 weeks ago ~40.5 → about 61
  check(`the age, on men's norms, against yours (${age}; ${t.slice(0, 110)})`, age >= 50 && age <= 58 && new RegExp(`^Your heart's fitness age · men's norms ${age} years — you're 28 VO2 max 4[23]\\.\\d this week`, 'i').test(t));
  const fitR = (await card.locator('[data-row="fitness"]').innerText().catch(() => '')).replace(/\s+/g, ' '), kgR = (await card.locator('[data-row="kg"]').innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(`what moved it: fitness at the same weight and the kilos, in years (${fitR} | ${kgR})`, /^Fitness, at the same weight −[2-5] y$/.test(fitR) && /^The [23]\.\d kg lost \(VO2 max is per kg\) −[1-4] y$/.test(kgR) && /What moved it · 8 weeks/i.test(t));
  const along = (await card.locator('[data-row="along"]').innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(`alongside, without years: resting heart rate 57 → 54 (${along})`, along === 'Alongside, same weeks: resting heart rate 57 → 54 bpm');
  // your age (28) is far below these weeks (54–65): the scale fits the weeks, no dashed line squashing them
  check('12 weekly dots, the scale fitted to them (your age far off: no line)', await card.locator('svg circle').count() === 12 && await card.locator('svg .fa-ref').count() === 0);
  const box = await card.locator('svg').boundingBox();
  await pg.touchscreen.tap(box.x + 8, box.y + box.height / 2); await pg.waitForTimeout(100);
  const cap = await card.locator('.fa-cap').innerText();
  check(`a tap on the first dot names its week (${cap})`, /^Week to \d{1,2} (Aug|Sept?): VO2 max \d\d\.\d · fitness age \d\d$/.test(cap));
  check(`the method and its caveat in words (${t.slice(-160)})`, /HUNT study has your VO2 max \(1,929 men tested on a treadmill; Loe et al\. 2013\)/.test(t) && /trust the trend more than the number/.test(t) && /Each \+1 of VO2 max is about 2\.7 years off/.test(t));
  check(`fits a 390 phone (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
  await card.screenshot({ path: OUT + 'fitage.png' });
  await pg.goto(APP + '#settings'); await pg.waitForSelector('#ai');
  check('Settings shows the choice', (await pg.getByLabel('Fitness age, set against').inputValue()) === 'male');
  await pg.getByRole('button', { name: 'What the AI sees about me' }).click();
  const seen = await pg.locator('.ctx').innerText().catch(() => '');
  check('the AI sees the same age and split under Body lab', new RegExp(`## Body lab[^#]*- Fitness age ${age} \\(age 28\\) — the age at which the average healthy man[^\\n]*years younger now — fitness at the same weight: \\d years? younger; the 2\\.\\d kg lost: \\d years? younger[^\\n]*Alongside: resting heart rate 57 → 54 bpm\\.`).test(seen));
  await ctx.close();

  // at 60 your age sits inside the weeks' scale: the dashed line and its label, whole, on a 320 phone
  ({ ctx, pg } = await open(world(true), 320, 60));
  await pg.locator('[data-card="fitage"]').getByRole('button', { name: 'Men', exact: true }).click().catch(() => {});
  await pg.waitForSelector('[data-card="fitage"].fa').catch(() => {});
  const fit = await pg.evaluate(() => { const svg = document.querySelector('[data-card="fitage"] svg'), t = [...svg.querySelectorAll('text')].find((x) => /^you /.test(x.textContent)); return t ? { text: t.textContent, inside: t.getBoundingClientRect().right <= svg.getBoundingClientRect().right + 0.5, line: !!svg.querySelector('.fa-ref') } : null; });
  check(`your age inside the scale: dashed, its label whole (${JSON.stringify(fit)})`, !!fit && fit.text === 'you 60' && fit.inside && fit.line);
  check(`fits a 320 phone (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 320);
  await pg.locator('[data-card="fitage"]').screenshot({ path: OUT + 'fitage-320.png' });
  await ctx.close();

  ({ ctx, pg } = await open(world(false), 390));
  const none = (await pg.locator('[data-card="fitage"]').innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(`control: no VO2 max — says what it needs, no number (${none})`, /Needs 3 days of VO2 max from the band in the last week/.test(none) && !/years/.test(none));
  await ctx.close();

  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
