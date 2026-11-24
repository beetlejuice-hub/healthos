// After a supplement (PLAN 63; owner, 9 Oct: "keep in mind at what time i log supplements, can check whether it affects
// mental, or bpm changes"). 30 fake days: L-theanine at 15:00 on alternate days with +6 bpm for 30–120 min after and mood
// +1 at the 17:00 check-in (planted); magnesium every night at 21:30 (nothing to compare: same time every day). PLAN 226:
// glycine some nights 45 min before bed, some 3½ h before, with 25 min more deep sleep on the close nights (planted) —
// "That night, by when you took it" finds it; HRV, nothing planted, isn't called. Its name in Today's Stack opens it.
const { chromium, APP, OUT, handle, openCard } = require('./harness.cjs');

const MIN = 60_000, HOUR = 3_600_000;
const NOW = new Date('2026-10-09T22:30:00').getTime();
function rng(seed) {
  let s = seed >>> 0;
  const r = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { r, g: () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()) };
}
const cl = (v) => Math.max(1, Math.min(10, Math.round(v)));
function world() {
  const { g } = rng(9), g2 = rng(77).g, hr = [], entries = [], sleep = [];
  for (let k = 29; k >= 0; k--) {
    const mid = new Date(2026, 9, 9 - k).getTime(), T = (h) => mid + h * HOUR, took = k % 2 === 0;
    // off days answered "didn't take" (the morning catch-up asks) — only those count as days without (PLAN 74)
    entries.push(took ? { id: 'th' + k, kind: 'supp', at: T(15), suppId: 'thea', status: 'taken', slot: 'midday' } : { id: 'th' + k, kind: 'supp', at: T(15), suppId: 'thea', status: 'skipped', slot: 'midday' });
    entries.push({ id: 'mg' + k, kind: 'supp', at: T(21.5), suppId: 'mag', status: 'taken', slot: 'evening' });
    // glycine: close to bed on some nights (planted: +25 min deep), earlier on others
    const close = (k * 7) % 3 === 0, bed = T(23.5), onset = bed + 10 * MIN, wake = T(31), up = wake + 5 * MIN, deep = Math.round(75 + (close ? 25 : 0) + g2() * 5);
    if (k >= 1) {
      entries.push({ id: 'gl' + k, kind: 'supp', at: close ? T(22.75) : T(20), suppId: 'gly', status: 'taken', slot: 'evening' });
      sleep.push({ id: 'sl' + k, start: bed, end: up, asleepMin: Math.round((wake - onset) / MIN), awakeMin: 0, toFallAsleepMin: 10, nap: false, stageMin: {},
        stages: [{ type: 'awake', start: bed, end: onset }, { type: 'deep', start: onset, end: onset + deep * MIN }, { type: 'light', start: onset + deep * MIN, end: wake - 90 * MIN }, { type: 'rem', start: wake - 90 * MIN, end: wake }, { type: 'awake', start: wake, end: up }] });
    }
    for (const h of [9.5, 17, 20.5]) entries.push({ id: `f${k}${h}`, kind: 'feel', at: T(h), mood: cl(6 + (took && h === 17 ? 1 : 0) + g() * 0.6), energy: cl(6 + g() * 0.6), stress: cl(4 + g() * 0.6), focus: cl(6 + g() * 0.6) });
    for (let m = 7 * 60; m < 23 * 60; m++) { const t = mid + m * MIN; if (t > NOW) break; const x = (t - T(15)) / MIN; const v = Math.round(64 + g() * 1.5 + (took && x >= 30 && x < 120 ? 6 : 0)); hr.push([t, v, v - 2, v + 2]); }
  }
  return { hr, sleep: sleep.filter((x) => x.end < NOW), entries: entries.filter((e) => e.at < NOW).sort((a, b) => a.at - b.at) };
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
    rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(op === 'data' ? { hr: w.hr.filter((m) => m[0] >= from && m[0] <= to), sleep: w.sleep.filter((x) => x.end >= from && x.start <= to), rhr: {}, hrv: {}, ...st } : st) });
  });
  const pg = await ctx.newPage();
  await pg.clock.install({ time: NOW });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  await pg.evaluate((w) => { const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = w.entries;
    s.supplements = [{ id: 'thea', name: 'L-theanine', dose: '200 mg', slot: 'midday', at: 15 * 60, active: true }, { id: 'mag', name: 'Magnesium', dose: '200 mg', slot: 'evening', at: 21 * 60 + 30, active: true }, { id: 'gly', name: 'Glycine', dose: '3 g', slot: 'evening', at: 22 * 60, active: true }];
    localStorage.setItem(k, JSON.stringify(s)); }, w);
  await pg.goto(APP + '#insights/training'); await pg.reload();
  await pg.waitForSelector('#supp-after');
  // the band's older days load after the first ones
  await pg.waitForFunction(() => /Heart rate goes with|no clear change/i.test(document.querySelector('#supp-after')?.innerText ?? ''), null, { timeout: 15000 }).catch(() => {});
  const card = pg.locator('#supp-after');
  await card.getByRole('button', { name: 'L-theanine' }).click(); await pg.waitForTimeout(300);
  const t = await card.innerText();
  check(`L-theanine: heart rate +6 planted, found (${(t.match(/Heart rate[^\n]*/) || [''])[0].slice(0, 110)})`, /Heart rate goes with \+[4-8]\.\d bpm 30–90 min after L-theanine.*How sure: (clear|likely)\./.test(t));
  const row = (k) => card.locator(`tr[data-key="${k}"]`).evaluate((r) => [r.dataset.sure, r.innerText.replace(/\s+/g, ' ')]);
  const mood = await row('mood'), focus = await row('focus');
  check(`L-theanine: mood +1 planted, found 1–4 h after against the same time without (${mood[1]})`, (mood[0] === 'clear' || mood[0] === 'likely') && /\+0\.[6-9]|\+1\.[0-4]/.test(mood[1]));
  check(`L-theanine: focus, nothing planted, nothing found (${focus[1]})`, focus[0] === 'not clear');
  check(`fits the phone (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
  await card.screenshot({ path: OUT + 'suppafter.png' });
  await card.getByRole('button', { name: 'Magnesium' }).click(); await pg.waitForTimeout(300);
  check(`no "didn't take" days for magnesium: says what counts as a day without (or that it's taken at the same time daily)`, /Days without Magnesium are the days you used the app and didn't log it/.test(await card.innerText()) || /at the same time every day/.test(await card.innerText()));
  check('Magnesium, same time every night: says there\'s nothing to compare yet, no finding', /at the same time every day, so there's nothing to compare yet/.test(await card.innerText()) && await card.locator('tr[data-sure="clear"], tr[data-sure="likely"]').count() === 0);
  // PLAN 226: that night, by when you took it
  await card.getByRole('button', { name: 'Glycine' }).click();
  await pg.waitForFunction(() => document.querySelector('.sa-night [data-out="deep"]'), null, { timeout: 15000 }).catch(() => {});
  const nightT = (await card.locator('.sa-night').innerText().catch(() => '')).replace(/\s+/g, ' ');
  const deepSure = await card.locator('.sa-night [data-out="deep"]').getAttribute('data-sure').catch(() => null), hrvSure = await card.locator('.sa-night [data-out="hrv"]').getAttribute('data-sure').catch(() => null);
  check(`glycine close to bed: +25 min deep planted, found (${nightT.slice(0, 200)})`, (deepSure === 'clear' || deepSure === 'likely') && /Taken close to bed goes with \+(1[5-9]|2\d|3[0-5]) min deep sleep/.test(nightT));
  check(`…HRV, nothing planted, not called (${hrvSure})`, hrvSure === 'not clear' || /HRV: too few/.test(nightT));
  await card.locator('.sa-night').screenshot({ path: OUT + 'suppafter-night.png' });
  // Today's Stack: a name opens what happens after it
  await pg.goto(APP + '#today'); await pg.waitForTimeout(400);
  await openCard(pg, 'stack');
  await pg.getByRole('button', { name: 'What happens after Glycine' }).click(); await pg.waitForTimeout(900);
  const pressed = await pg.locator('#supp-after [aria-pressed="true"]').innerText().catch(() => '');
  check(`Stack → Glycine's name opens its "after" (${await pg.evaluate(() => location.hash)}, ${pressed})`, /#insights\/training/.test(await pg.evaluate(() => location.hash)) && pressed === 'Glycine');
  console.log('errors:', JSON.stringify(errs));
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
