// The morning read can make an item of the band (PLAN 52; owner, 21 Oct: "3"). The night check's world (e2e/nightcheck):
// 35 nights, and in one run last night's skin +0.9 °C and breathing +2.2. With it flagged, the morning read must be told
// to make its pattern item of it — the app's own line quoted — whatever the day's turn; the item the AI sends back about
// skin temperature must draw 14 days of it from the band, folded and opened. Without the plant: the day's usual angle.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

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

const ITEM = { type: 'pattern', title: 'A warm night, and faster breathing', text: 'Skin 0.9 °C and breathing 2/min over your usual.', tip: 'Take today easier', measure: 'skin' };

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  for (const plant of [true, false]) {
    const w = world(plant), tag = plant ? 'night check off' : 'an ordinary night', calls = [];
    const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    await ctx.route(/\/api\/band\//, (rt) => {
      const u = new URL(rt.request().url()), op = u.pathname.split('/').pop(), from = +u.searchParams.get('from'), to = +u.searchParams.get('to');
      const st = { connected: true, needsReconnect: false, connectedAt: NOW - 60 * D, lastSync: NOW - 3 * MIN, latest: w.hr.at(-1)[0], error: null, gapSec: 300 };
      const inR = (t) => t >= from && t <= to;
      rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(op === 'data' ? { hr: w.hr.filter((m) => inR(m[0])), steps: [], sleep: w.sleep.filter((x) => x.end >= Math.min(from, NOW - 40 * D) - D && x.start <= to), rhr: w.rhr, hrv: w.hrv, skin: w.skin, breath: w.breath, spo2: w.spo2, ...st } : st) });
    });
    await ctx.route('**/api/ai/usage**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ usage: null, cap: 50, on: true }) }));
    await ctx.route('**/api/ai?**', (r) => { const body = r.request().postDataJSON(); calls.push(body); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ answer: body.task === 'digest' ? { greeting: 'Morning.', items: [ITEM] } : { questions: [] }, usage: null, costUsd: 0.01, model: 'opus' }) }); });
    const pg = await ctx.newPage();
    await pg.clock.install({ time: NOW });
    pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
    await pg.goto(APP);
    await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
    await pg.evaluate(() => { const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = []; s.workouts = []; s.ai = { ...(s.ai || {}), digest: null, chat: [] }; localStorage.setItem(k, JSON.stringify(s)); });
    await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('#feel');
    for (let i = 0; i < 80 && !calls.some((c) => c.task === 'digest'); i++) await pg.waitForTimeout(100);
    const c = calls.find((x) => x.task === 'digest')?.context ?? '';
    const angle = (c.match(/- Angle for the "pattern" item: [^\n]*/) ?? [''])[0];
    if (plant) {
      check(`${tag}: the read is told to make its pattern item of it, the app's line quoted (${angle.slice(0, 140)})`,
        /^- Angle for the "pattern" item: Last night's night check — the app flagged it: "Night check: skin \d\.\d °C over your usual and breathing [12]\.\d\/min over your usual — together these go with getting ill/.test(angle) && /never a diagnosis or medical advice/.test(angle));
      await pg.waitForSelector('section.morning .mr-row', { timeout: 5000 }).catch(() => {});
      const mr = pg.locator('section.morning');
      check(`${tag}: folded, the skin item has its small chart (${await mr.locator('.dc-mini').count()})`, await mr.locator('.dc-mini').count() === 1);
      await mr.locator('.mr-head').click(); await pg.waitForTimeout(150);
      await mr.locator('.mr-row').first().click(); await pg.waitForTimeout(150);
      const body = mr.locator('.mr-body');
      const head = await body.locator('.dc-head').innerText().catch(() => ''), words = await body.locator('.dc-words').innerText().catch(() => '');
      check(`${tag}: opened, 14 days of skin temperature from the band (${head} · ${words})`, /^Skin temperature · last 14 days$/.test(head) && await body.locator('.dc-dot').count() === 14 && /avg 33\.\d °C over 13 days · yesterday 3\d\.\d °C · today 34\.\d °C/.test(words));
      check(`${tag}: fits the phone (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
      await mr.screenshot({ path: OUT + 'readband.png' });
    } else {
      check(`${tag}: the day's usual angle (${angle.slice(0, 80)})`, !!angle && !/night check/.test(angle));
    }
    await ctx.close();
  }
  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
