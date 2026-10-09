// Insights → Mind, the band's side (PLAN 58, owner's pick 9 Oct: C with A's calendar). Fake band: 30 nights with
// stages, daily HRV and resting heart rate; check-ins three times a day (mood, energy, stress, focus). Planted: the day
// after a drink evening, mood −1.0; energy +0.9 per hour asleep. Last night was short and after drinks, so this
// morning's line has something to say. The page must find those and nothing else; without a band, only the calendar.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

const MIN = 60_000, HOUR = 3_600_000;
const NOW = new Date('2026-10-08T16:30:00').getTime();
function rng(seed) {
  let s = seed >>> 0;
  const r = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { r, g: () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()) };
}
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const cl = (v) => Math.max(1, Math.min(10, Math.round(v)));
function world({ seed = 3, band = true } = {}) {
  const { r, g } = rng(seed), sleep = [], rhr = {}, hrv = {}, entries = [], workouts = [], drinkEves = [], nights = {};
  let prevDrinks = false;
  for (let k = 30; k >= 0; k--) {
    const mid = new Date(2026, 9, 8 - k).getTime(), T = (h) => mid + h * HOUR, date = ymd(new Date(mid)), today = k === 0;
    // the night ending this morning: today's is short and after drinks
    const hrs = today ? 5.6 : Math.max(5.2, Math.min(8.6, 6.9 + g() * 0.65)), bed = T(-0.9 + g() * 0.25), up = bed + (hrs * 60 + 20) * MIN;
    const onset = bed + 12 * MIN, wake = up - 8 * MIN, stages = [{ type: 'awake', start: bed, end: onset }];
    for (let t = onset, c = 0; t < wake - 20 * MIN; c++) { const e = Math.min(wake, t + 90 * MIN), L = e - t; stages.push({ type: 'light', start: t, end: t + L * 0.45 }, { type: c < 2 ? 'deep' : 'light', start: t + L * 0.45, end: t + L * 0.7 }, { type: 'rem', start: t + L * 0.7, end: e }); t = e; }
    stages.push({ type: 'awake', start: wake, end: up });
    if (k < 30) { sleep.push({ id: 's' + k, start: bed, end: up, asleepMin: Math.round(hrs * 60), awakeMin: 20, toFallAsleepMin: 12, nap: false, stageMin: {}, stages }); nights[date] = hrs; rhr[date] = Math.round(53 + g()); hrv[date] = Math.round(46 + g() * 4 - (prevDrinks ? 6 : 0)); }
    const drinks = !today && r() < 0.35;
    if (drinks) drinkEves.push(date);
    const dayMood = 6.3 + g() * 0.3 - (prevDrinks ? 1.0 : 0), dayEnergy = 5.8 + (hrs - 7) * 0.9 + g() * 0.3;
    for (const h of [9.5, 13.5, 19]) {
      const at = T(h + r() * 0.4); if (at > NOW) continue;
      entries.push({ id: `f${k}${h}`, kind: 'feel', at, mood: cl(dayMood + g() * 0.5), energy: cl(dayEnergy + g() * 0.5), stress: cl(4 + g() * 0.7), focus: cl(5.5 + g() * 0.7) });
    }
    if (drinks) [20.6, 21.7].forEach((hh, i) => entries.push({ id: `b${k}${i}`, kind: 'drink', at: T(hh), name: 'Beer', ml: 500, caffeineMg: 0, alcoholG: 20, kcal: 210 }));
    entries.push({ id: 'c' + k, kind: 'drink', at: T(8.4), name: 'Coffee', ml: 250, caffeineMg: 95, alcoholG: 0, kcal: 2 });
    if (r() < 0.4 && !today) workouts.push({ id: 'w' + k, template: 'Push day', startedAt: T(18), endedAt: T(19) });
    prevDrinks = drinks;
  }
  // the evening before today: drinks
  const yest = new Date(2026, 9, 7).getTime(); if (!drinkEves.includes(ymd(new Date(yest)))) { [20.6, 21.7].forEach((hh, i) => entries.push({ id: `by${i}`, kind: 'drink', at: yest + hh * HOUR, name: 'Beer', ml: 500, caffeineMg: 0, alcoholG: 20, kcal: 210 })); drinkEves.push(ymd(new Date(yest))); }
  return { band, sleep, rhr, hrv, nights, entries: entries.filter((e) => e.at < NOW).sort((a, b) => a.at - b.at), workouts, drinkEves };
}

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  async function open(vw, w) {
    const ctx = await b.newContext({ viewport: { width: vw, height: 900 }, deviceScaleFactor: 2, isMobile: vw < 500, hasTouch: vw < 500 });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    await ctx.route(/\/api\/band\//, (rt) => {
      const u = new URL(rt.request().url()), op = u.pathname.split('/').pop(), from = +u.searchParams.get('from'), to = +u.searchParams.get('to');
      const st = w.band ? { connected: true, needsReconnect: false, connectedAt: NOW - 40 * 86_400_000, lastSync: NOW - 3 * MIN, latest: NOW - 5 * MIN, error: null, gapSec: 60 } : { connected: false };
      const body = op === 'data' && w.band ? { hr: [], sleep: w.sleep.filter((s) => s.end >= from && s.start <= to), rhr: w.rhr, hrv: w.hrv, ...st } : st;
      rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    const pg = await ctx.newPage();
    await pg.clock.install({ time: NOW });
    pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
    await pg.goto(APP);
    await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
    await pg.evaluate((w) => { const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = w.entries; s.workouts = w.workouts; localStorage.setItem(k, JSON.stringify(s)); }, w);
    await pg.goto(APP + '#insights/mind'); await pg.reload();
    await pg.waitForSelector('.mp[data-sec]');
    if (w.band) await pg.waitForFunction(() => +document.querySelector('.mp')?.dataset.nights >= 29, null, { timeout: 15000 }).catch(() => {});
    await pg.waitForTimeout(400);
    return { ctx, pg };
  }
  const w = world();
  const noOverflow = (pg) => pg.evaluate(() => document.documentElement.scrollWidth);

  // ---- laptop
  let { ctx, pg } = await open(1280, w);
  const mo = await pg.locator('.mp-morning').innerText();
  check(`this morning: last night from the band, after drinks (${(mo.match(/Last night:[^\n]*/) || [''])[0]})`, /Last night: 5 h 36 asleep, HRV \d+ ms.*, after drinks\./.test(mo));
  const line = (mo.match(/Mornings like this have gone with [^\n]+/) || [''])[0];
  check(`this morning: what mornings like this have gone with — mood and energy, not a forecast (${line.slice(0, 120)})`, /mood −\d\.\d/.test(line) && /energy −\d\.\d/.test(line) && /not a forecast/.test(line) && !/trained/i.test(line));
  const cell = (f, o) => pg.locator('.mp .sl-cell').evaluateAll((els, [f, o]) => { const e = els.find((x) => x.getAttribute('aria-label')?.startsWith(`${f} and ${o}:`)); return e ? [e.dataset.sure, e.dataset.toward, e.textContent] : null; }, [f, o]);
  const dm = await cell('Drinks the evening before', 'Mood'), se = await cell('Under 6 h 30 asleep', 'Energy');
  check(`grid: drinks the evening before → mood, clear and lower (${dm})`, dm && dm[0] === 'clear' && dm[1] === 'worse' && /^−\d/.test(dm[2]));
  check(`grid: a short night → energy, lower (${se})`, se && (se[0] === 'clear' || se[0] === 'likely') && se[1] === 'worse');
  const clears = await pg.locator('.mp .sl-cell[data-sure="clear"]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label').split(':')[0]));
  check(`grid: nothing else clear (${clears.join(' | ')})`, clears.every((c) => c === 'Drinks the evening before and Mood' || c === 'Under 6 h 30 asleep and Energy'));
  // today's feelings so far are only its morning: the grid learns from the 29 finished days, then applies them to today
  const counts = await pg.locator('.mp .sl-mf small').evaluateAll((els) => els.map((e) => e.textContent.match(/(\d+) vs (\d+)/).slice(1).map(Number)));
  check(`grid: finished days only — every row's days add up to 29, not 30 (${counts.map((c) => c.join('+')).join(', ')})`, counts.length >= 3 && counts.every(([a, b]) => a + b === 29));
  check('grid: the strongest cell is opened, every day behind it', await pg.locator('.mp .sl-open').count() === 1 && await pg.locator('.mp .sl-open circle').count() >= 25);
  const sl = pg.locator('.mp-sleep');
  let sw = await sl.locator('.he-words').innerText();
  const slope = +((sw.match(/goes with ([+−]\d\.\d) per hour/) || [])[1] || 'x').replace('−', '-');
  check(`sleep → that day: energy +0.9 per hour asleep found (${sw})`, slope >= 0.6 && slope <= 1.2 && /How sure: (clear|likely)\./.test(sw) && await sl.locator('circle').count() >= 28);
  await sl.getByRole('button', { name: 'Focus' }).click(); await pg.waitForTimeout(150);
  sw = await sl.locator('.he-words').innerText();
  check(`sleep → that day: focus, nothing planted, nothing found (${sw})`, /^No clear link yet/.test(sw));
  await sl.getByRole('button', { name: 'Energy' }).click();
  const cal = pg.locator('.mp-month');
  const steps = await cal.locator('g[data-day]').evaluateAll((gs) => gs.map((g) => [g.dataset.day, g.dataset.step]));
  check(`calendar: 30 days, coloured both ways from your usual (${steps.length} days; ${[...new Set(steps.map((s) => s[1]))].sort().join(' ')})`, steps.length === 30 && steps.some((s) => +s[1] < 0) && steps.some((s) => +s[1] > 0));
  const diamonds = await cal.locator('path[fill="var(--alc)"]').count(), wantD = w.drinkEves.filter((d) => d >= '2026-09-08' && d < '2026-10-08').length;
  check(`calendar: a mark on each day after a drink evening (${diamonds} marks, ${wantD} evenings)`, diamonds === wantD);
  const after = steps.filter(([d]) => w.drinkEves.includes(new Date(new Date(d + 'T12:00').getTime() - 86_400_000).toISOString().slice(0, 10))).map((s) => +s[1]);
  check(`calendar: days after drinks mostly read below usual (${after.join(' ')})`, after.filter((v) => v < 0).length >= after.length * 0.7);
  check('calendar: today outlined', await cal.locator('g[data-day="2026-10-08"] rect[stroke="var(--i-ink)"]').count() === 1);
  await cal.scrollIntoViewIfNeeded(); await pg.waitForTimeout(100);
  const cb = await cal.locator('svg').boundingBox();
  await pg.mouse.click(cb.x + 14 + 3 * ((Math.min(cb.width, 640) - 28 - 24) / 7 + 4) + 10, cb.y + 30 + 10); await pg.waitForTimeout(150);
  check(`calendar: tapping a day shows its numbers (${await cal.locator('.mp-hov').innerText()})`, /^\w{3} \d+ \w{3} · (mood \d\.\d|no check-in)/.test(await cal.locator('.mp-hov').innerText()));
  check(`laptop: nothing sticks out (${await noOverflow(pg)} px)`, await noOverflow(pg) <= 1280);
  check('the older Mind panels are still below', await pg.locator('[data-sec="mind"] .gl-course, [data-sec="mind"] .gl-rhythm').count() >= 1);
  await pg.locator('.mp').screenshot({ path: OUT + 'mindpage-laptop.png' });
  await ctx.close();

  // ---- phone
  ({ ctx, pg } = await open(390, w));
  check(`phone: nothing sticks out (${await noOverflow(pg)} px)`, await noOverflow(pg) <= 390);
  const gb = await pg.locator('.mp .sl-c').boundingBox(), cbp = await pg.locator('.mp-month svg').boundingBox();
  check(`phone: the grid's four columns and the calendar fit (${Math.round(gb.width)}, ${Math.round(cbp.width)} px)`, gb.width <= 390 && cbp.x + cbp.width <= 390 && await pg.locator('.mp .sl-mh').count() === 4);
  const pc = pg.locator('.mp-month svg'); await pc.scrollIntoViewIfNeeded(); const pb = await pc.boundingBox();
  await pg.touchscreen.tap(pb.x + 14 + 2.5 * ((pb.width - 28 - 24) / 7 + 4), pb.y + 30 + 1.5 * ((pb.width - 28 - 24) / 7 + 4)); await pg.waitForTimeout(150);
  check(`phone: a tap on a day shows its numbers (${await pg.locator('.mp-hov').innerText()})`, /^\w{3} \d+ \w{3} · /.test(await pg.locator('.mp-hov').innerText()));
  await pg.locator('.mp').screenshot({ path: OUT + 'mindpage-phone.png' });
  await ctx.close();

  // ---- no band: the calendar only, no made-up mornings
  const nb = world({ band: false });
  ({ ctx, pg } = await open(1280, nb));
  check('no band: no morning line, grid or sleep chart — the calendar, without short-night marks', await pg.locator('.mp-morning, .mp .sl-c, .mp-sleep').count() === 0 && await pg.locator('.mp-month g[data-day]').count() === 30 && await pg.locator('.mp-month circle').count() === 0);
  await pg.locator('.mp').screenshot({ path: OUT + 'mindpage-noband.png' });
  await ctx.close();

  console.log('errors:', JSON.stringify(errs));
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
