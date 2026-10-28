// Insights → Body lab, dose-response (PLAN 177, body lab 3; owner, 27 Oct: "yes", cigarettes "lets do B"). 63 fake nights
// from the band and a log to go with them. Planted: each drink that evening, heart rate asleep +2.5 bpm and HRV −5 ms;
// a smoking day without drinks, resting HR +4 next morning (smoking mostly on drinking nights — the card must leave those
// out); every 100 mg of caffeine after 14:00, 9 min less deep sleep. The page must find each near its size, say how sure,
// draw the month of cigarette answers, and fit a phone. Control: the same nights with nothing planted and no cigarette
// answers — no claims, the cigarettes card asks for answers.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

const MIN = 60_000, HOUR = 3_600_000, D = 86_400_000, NOW = new Date('2026-10-27T12:00:00').getTime();
const ymd = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
function rng(seed) {
  let s = seed >>> 0;
  const r = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { r, g: () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()) };
}
function world(plant) {
  const { r, g } = rng(21), sleep = [], hr = [], hrv = {}, rhr = {}, entries = [], free = [];
  for (let k = 63; k >= 1; k--) {
    const eve0 = new Date(2026, 9, 27 - k).getTime(), T = (h) => eve0 + h * HOUR, eve = ymd(eve0);
    const drinks = r() < 0.3 ? 1 + Math.floor(r() * 5) : 0, d = Math.min(4, drinks);
    const answered = plant && r() < 0.85, smoked = r() < (drinks >= 2 ? 0.7 : 0.25);
    const lateMg = r() < 0.5 ? 80 * (1 + Math.floor(r() * 3)) : 0;
    for (let j = 0; j < drinks; j++) entries.push({ id: `b${k}-${j}`, kind: 'drink', at: T(20 + j * 0.5), name: 'Beer', ml: 500, caffeineMg: 0, alcoholG: 20, kcal: 215 });
    entries.push({ id: `c${k}`, kind: 'drink', at: T(9), name: 'Coffee', ml: 200, caffeineMg: 80, alcoholG: 0, kcal: 5 });
    for (let j = 0; j < lateMg / 80; j++) entries.push({ id: `l${k}-${j}`, kind: 'drink', at: T(15 + j), name: 'Coffee', ml: 200, caffeineMg: 80, alcoholG: 0, kcal: 5 });
    if (answered) { entries.push({ id: `s${k}`, kind: 'answer', at: T(21), key: `smoke:${eve}`, question: 'Cigarettes that day?', answer: smoked ? '3-5' : '0' }); if (!smoked && eve >= '2026-10-01') free.push(eve); }
    const bed = T(23.5), onset = bed + 10 * MIN, wake = T(31.5), up = wake + 5 * MIN;
    const deep = Math.round(80 - (plant ? 0.09 * lateMg : 0) + g() * 6), sHr = 54 + (plant ? 2.5 * d : 0) + g();
    const stages = [{ type: 'awake', start: bed, end: onset }, { type: 'deep', start: onset, end: onset + deep * MIN }, { type: 'light', start: onset + deep * MIN, end: wake - 90 * MIN }, { type: 'rem', start: wake - 90 * MIN, end: wake }, { type: 'awake', start: wake, end: up }];
    sleep.push({ id: 's' + k, start: bed, end: up, asleepMin: Math.round((wake - onset) / MIN), awakeMin: 0, toFallAsleepMin: 10, nap: false, stageMin: {}, stages });
    for (let t = bed - HOUR; t < up; t += 5 * MIN) { const v = Math.round((t >= onset && t < wake ? sHr : 64) * 10) / 10; hr.push([t, v, v - 2, v + 2]); }
    hrv[ymd(up)] = Math.round(50 - (plant ? 5 * d : 0) + g() * 3);
    rhr[ymd(up)] = Math.round(54 + (plant ? d + (smoked && answered && drinks < 2 ? 4 : 0) : 0) + g());
  }
  return { hr: hr.sort((a, b) => a[0] - b[0]), sleep, hrv, rhr, entries, free };
}

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  async function open(w, width) {
    const ctx = await b.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    await ctx.route('**/api/ai**', (rt) => rt.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' }));
    await ctx.route(/\/api\/band\//, (rt) => {
      const u = new URL(rt.request().url()), op = u.pathname.split('/').pop(), from = +u.searchParams.get('from'), to = +u.searchParams.get('to');
      const st = { connected: true, needsReconnect: false, connectedAt: NOW - 90 * D, lastSync: NOW - 3 * MIN, latest: w.hr.at(-1)[0], error: null, gapSec: 300 };
      const inR = (t) => t >= from && t <= to;
      rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(op === 'data' ? { hr: w.hr.filter((m) => inR(m[0])), steps: [], sleep: w.sleep.filter((x) => x.end >= from && x.start <= to), rhr: w.rhr, hrv: w.hrv, ...st } : st) });
    });
    const pg = await ctx.newPage();
    await pg.clock.install({ time: NOW });
    pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
    await pg.goto(APP);
    await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
    await pg.evaluate((es) => { const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = es; s.workouts = []; localStorage.setItem(k, JSON.stringify(s)); }, w.entries);
    await pg.goto(APP + '#insights/lab'); await pg.reload();
    // the three months of nights arrive after the first week: wait for the drinks card to have all of them
    await pg.waitForFunction(() => +(document.querySelector('.bl')?.dataset.nights ?? 0) >= 60, null, { timeout: 15000 }).catch(() => {});
    await pg.waitForTimeout(500);
    return { ctx, pg };
  }
  const card = (pg, id) => pg.locator(`.bl [data-card="${id}"]`);
  const text = async (l) => (await l.innerText().catch(() => '')).replace(/\s+/g, ' ');

  // 1 · planted
  const w = world(true);
  let { ctx, pg } = await open(w, 390);
  check(`the Body lab tab is there (${await pg.locator('.secbar button').allInnerTexts().then((t) => t.join(' | ').replace(/\n/g, ' '))})`, await pg.locator('.secbar button', { hasText: 'Body lab' }).count() === 1);
  // one page at a time (owner, 8 Oct): the Body lab tab showed every other page above it, ~30,000 px (found 28 Oct)
  const others = await pg.evaluate(() => [...document.querySelectorAll('.inst [data-sec]:not([data-sec="lab"])')].filter((e) => e.getBoundingClientRect().height > 0).map((e) => e.dataset.sec));
  check(`the Body lab tab shows only the lab (${[...new Set(others)].join(', ') || 'nothing else'})`, others.length === 0);
  // …and every page does, so a page added later without its line in index.css's one-page rule shows up here
  const leaks = await pg.evaluate(async () => {
    const out = [];
    for (const b of [...document.querySelectorAll('.secbar button')]) {
      b.click(); await new Promise((r) => setTimeout(r, 150));
      const tab = document.querySelector('.inst').dataset.tab;
      const shown = [...new Set([...document.querySelectorAll('.inst [data-sec]')].filter((e) => e.getBoundingClientRect().height > 0).map((e) => e.dataset.sec))];
      if (shown.some((x) => x !== tab)) out.push(`${tab}: ${shown.join('+')}`);
    }
    document.querySelector('.secbar button:last-child')?.click();
    return out;
  });
  check(`every Insights page shows only itself (${leaks.join('; ') || 'all clean'})`, leaks.length === 0);
  await pg.goto(APP + '#insights/lab'); await pg.waitForTimeout(300);
  check(`all 63 nights loaded (${await pg.locator('.bl').getAttribute('data-nights').catch(() => '?')})`, +(await pg.locator('.bl').getAttribute('data-nights').catch(() => 0)) >= 60);
  const dr = await text(card(pg, 'drinks').locator('h3'));
  check(`drinks: each one +~2.5 bpm asleep, −~5 ms HRV (${dr})`, /^Each drink went with heart rate asleep \+(2\.\d|3\.0) bpm, HRV −(4\.\d|5\.\d|6\.0) ms that night\.$/.test(dr));
  check(`drinks: how sure in the kicker (${await text(card(pg, 'drinks').locator('.cmp-k'))})`, /DRINKS THAT EVENING · CLEAR/i.test(await text(card(pg, 'drinks').locator('.cmp-k'))));
  check('drinks: five columns per chart, each with its middle night', await card(pg, 'drinks').locator('figure').count() === 2 && await card(pg, 'drinks').locator('figure').first().locator('circle').count() === 5);
  const sm = await text(card(pg, 'smoke'));
  const rows = await card(pg, 'smoke').locator('[data-row]').evaluateAll((els) => els.map((e) => e.dataset.row + ':' + e.dataset.sure));
  check(`smoking: resting HR up next morning, found; drinking nights left out (${sm.slice(0, 220)})`, /On smoking days: resting heart rate next morning \+[345] bpm/.test(sm) && /drinking nights left out/.test(sm) && rows.some((x) => /^rhr:(clear|likely)$/.test(x)));
  check(`smoking: HRV — nothing planted on dry days — not claimed (${rows.join(', ')})`, !/HRV that night [+−]\d/.test(sm.split('.')[0]) && rows.some((x) => /^hrv:(not clear|too few)$/.test(x)));
  const cf = await text(card(pg, 'caf').locator('h3'));
  check(`caffeine after 14:00: ~9 min less deep sleep per 100 mg (${cf})`, /^Every 100 mg after 14:00 went with about ([5-9]|1[0-3]) min less deep sleep\.$/.test(cf));
  const free = +(await pg.locator('.bl-month').getAttribute('data-free').catch(() => -1));
  check(`October calendar: ${w.free.length} smoke-free days (${free})`, free === w.free.length && /OCTOBER · \d+ SMOKE-FREE DAYS/i.test(sm));
  check(`October calendar: 31 days from Thursday (${await pg.locator('.bl-cal i').count()} cells)`, await pg.locator('.bl-cal i.blank').count() === 3 && await pg.locator('.bl-cal i:not(.blank)').count() === 31);
  check(`fits the phone (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
  await pg.locator('.bl').screenshot({ path: OUT + 'bodylab.png' });
  await ctx.close();

  // 2 · 320 px
  ({ ctx, pg } = await open(w, 320));
  check(`320 px: no sideways scroll (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 320 && await card(pg, 'drinks').count() === 1);
  await pg.locator('.bl').screenshot({ path: OUT + 'bodylab-320.png' });
  await ctx.close();

  // 3 · control: nothing planted, no cigarette answers
  ({ ctx, pg } = await open(world(false), 390));
  const c = await text(card(pg, 'drinks').locator('h3')), cs = await text(card(pg, 'smoke')), cc = await text(card(pg, 'caf').locator('h3'));
  check(`control: drinks — no claim (${c})`, /^Drinks haven't gone clearly/.test(c));
  check(`control: cigarettes — asks for answers, no calendar (${cs.slice(0, 120)})`, /Needs 5 answered days each way/.test(cs) && await pg.locator('.bl-month').count() === 0);
  check(`control: caffeine — no claim (${cc})`, /^Caffeine after 14:00 hasn't gone clearly/.test(cc));
  await ctx.close();

  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
