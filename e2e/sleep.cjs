// Insights → Sleep (PLAN 54, the owner's picks on the canvas): B last night on top, A the night log, C what goes with.
// Selectors are scoped to the Sleep page (.sl): its grid is shared with the Heart page, which is in the page too on a laptop.
// Fake band: 30 Fitbit-shaped nights (cycles, deep early, REM later), heart rate every minute asleep, daily HRV and
// resting heart rate, naps on some afternoons. Planted: on drink evenings (about a third, at random) the lowest heart
// rate asleep is 5 bpm higher and 90 minutes later, HRV 8 ms lower. The grid must find those — and nothing in other rows.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

const MIN = 60_000, HOUR = 3_600_000;
const NOW = new Date('2026-10-08T16:30:00').getTime();
function rng(seed) {
  let s = seed >>> 0;
  const r = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { r, g: () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()) };
}
const day = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function world(seed = 5) {
  const { r, g } = rng(seed), sleep = [], hr = [], rhr = {}, hrv = {}, entries = [], workouts = [];
  for (let k = 29; k >= 0; k--) {
    const eveD = new Date(2026, 9, 7 - k), mid = eveD.getTime(), morning = day(new Date(2026, 9, 8 - k)), last = k === 0;
    const drinks = last || r() < 0.33, T = (h) => mid + h * HOUR;
    const bed = T(23.3 + g() * 0.35), onset = bed + (10 + Math.abs(g()) * 6) * MIN, up = T(31.1 + g() * 0.3), wake = up - 5 * MIN;
    const stages = [{ type: 'awake', start: bed, end: onset }];
    let t = onset, c = 0;
    while (t < wake - 20 * MIN) {
      const e = Math.min(wake, t + (88 + g() * 8) * MIN), L = e - t, dF = [0.36, 0.3, 0.15, 0.06, 0.02][Math.min(c, 4)], rF = [0.08, 0.18, 0.26, 0.31, 0.34][Math.min(c, 4)], lF = 1 - dF - rF;
      let x = t; const push = (type, len) => { if (len > 30_000) stages.push({ type, start: x, end: x + len }); x += len; };
      push('light', L * lF * 0.45); push('deep', L * dF); push('light', L * lF * 0.55); push('rem', e - x);
      if (r() < 0.45 && e < wake - 30 * MIN) { const w = (2 + r() * 6) * MIN; stages.push({ type: 'awake', start: e, end: e + w }); t = e + w; } else t = e;
      c++;
    }
    if (t < wake) stages.push({ type: 'light', start: t, end: wake });
    stages.push({ type: 'awake', start: wake, end: up });
    const mins = (ty) => stages.filter((s) => s.type === ty).reduce((m, s) => m + (s.end - s.start) / MIN, 0);
    sleep.push({ id: 's' + k, start: bed, end: up, asleepMin: Math.round(mins('light') + mins('deep') + mins('rem')), awakeMin: Math.round(mins('awake')), toFallAsleepMin: Math.round((onset - bed) / MIN), nap: false,
      stageMin: { deep: Math.round(mins('deep')), light: Math.round(mins('light')), rem: Math.round(mins('rem')), awake: Math.round(mins('awake')) }, stages });
    if (r() < 0.3 && !last) { const a = T(14 + r() * 1.5); sleep.push({ id: 'n' + k, start: a, end: a + 70 * MIN, asleepMin: 62, awakeMin: 8, toFallAsleepMin: 5, nap: true, stageMin: {}, stages: [] }); }
    const low = 50 + g() * 1.2 + (drinks ? 5 : 0), lowAt = onset + (wake - onset) * (0.42 + g() * 0.04) + (drinks ? 90 * MIN : 0);
    for (let m = bed; m <= up; m += MIN) {
      const base = m < lowAt ? low + (61 - low) * (lowAt - m) / (lowAt - bed) : low + (58 - low) * (m - lowAt) / (up - lowAt);
      const st = stages.find((s) => m >= s.start && m < s.end)?.type, v = Math.round(base + (st === 'rem' ? 2 : st === 'awake' ? 5 : 0) + g() * 1.2);
      hr.push([m, v, v - 2, v + 3]);
    }
    rhr[morning] = Math.round(54 + g()); hrv[morning] = Math.round(46 + g() * 4 - (drinks ? 8 : 0));
    if (drinks) [20.67, 21.83].forEach((h, i) => entries.push({ id: `b${k}${i}`, kind: 'drink', at: T(h), name: 'Beer', ml: 500, caffeineMg: 0, alcoholG: 20, kcal: 210 }));
    entries.push({ id: 'c' + k, kind: 'drink', at: T(8.2), name: 'Coffee', ml: 250, caffeineMg: 95, alcoholG: 0, kcal: 2 });
    entries.push({ id: 'l' + k, kind: 'food', at: T(12.5), name: 'Lunch', grams: 400, macros: { kcal: 700, p: 40, c: 80, f: 22 } });
    entries.push({ id: 'd' + k, kind: 'food', at: T(19.5), name: 'Dinner', grams: 450, macros: { kcal: 750, p: 40, c: 80, f: 25 } });
    if (k > 0 || true) entries.push({ id: 'r' + k, kind: 'sleep', at: up + 60 * MIN, rating: Math.max(2, Math.min(9, Math.round(6 + g()))) });
    if (r() < 0.4 || last) workouts.push({ id: 'w' + k, template: 'Push day', startedAt: T(18), endedAt: T(19.05) });
  }
  return { sleep, hr: hr.sort((a, b) => a[0] - b[0]), rhr, hrv, entries: entries.filter((e) => e.at < NOW).sort((a, b) => a.at - b.at), workouts };
}

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const w = world();
  async function open(vw) {
    const ctx = await b.newContext({ viewport: { width: vw, height: 900 }, deviceScaleFactor: 2, isMobile: vw < 500, hasTouch: vw < 500 });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    await ctx.route(/\/api\/band\//, (rt) => {
      const u = new URL(rt.request().url()), op = u.pathname.split('/').pop(), from = +u.searchParams.get('from'), to = +u.searchParams.get('to');
      const st = { connected: true, needsReconnect: false, connectedAt: NOW - 40 * 86_400_000, lastSync: NOW - 3 * MIN, latest: w.hr.at(-1)[0], error: null, gapSec: 60 };
      const body = op === 'data' ? { hr: w.hr.filter((m) => m[0] >= from && m[0] <= to), sleep: w.sleep.filter((s) => s.end >= from && s.start <= to), rhr: w.rhr, hrv: w.hrv, ...st } : st;
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
    await pg.goto(APP + '#insights/sleep'); await pg.reload();
    await pg.waitForSelector('.sl[data-nights]');
    // the older weeks arrive after the first one
    await pg.waitForFunction(() => +document.querySelector('.sl')?.dataset.nights >= 29, null, { timeout: 15000 }).catch(() => {});
    await pg.waitForTimeout(300);
    return { ctx, pg };
  }

  // ---- laptop
  let { ctx, pg } = await open(1280);
  const nN = +(await pg.locator('.sl').getAttribute('data-nights'));
  check(`the Sleep page draws the band's nights (${nN} of the last 30)`, nN >= 29);
  check(`B on top: "Last night · Wed 7 → Thu 8 Oct" (${await pg.locator('.sl .sl-title').innerText()})`, /Last night · Wed 7 → Thu 8 Oct/.test(await pg.locator('.sl .sl-title').innerText()));
  const facts = await pg.locator('.sl .sl-facts').innerText();
  check(`what was different: the two beers and the later, higher low (${facts.split('\n').slice(1, 4).join(' / ')})`, /2 drinks, the last \d+ (min|h \d\d) before bed\./.test(facts) && /Lowest heart rate \d\d at \d\d:\d\d, (1 h \d\d|\d+ min) later than usual \(usually about \d\d\)\./.test(facts));
  check('every number of the night against your range (10 rows, each with a bar)', await pg.locator('.sl .sl-bul-r').count() === 10 && await pg.locator('.sl .sl-bul-r svg rect').count() >= 8);
  const chartTxt = (await pg.locator('.sl .sl-chart svg text').allTextContents()).join('|');
  check(`the chart: stages, the evening (beers, workout), the lowest heart rate marked (${(chartTxt.match(/lowest \d+ at \d\d:\d\d/) || [''])[0]})`, /lowest \d+ at \d\d:\d\d/.test(chartTxt) && /2 drinks/.test(chartTxt) && /Push day/.test(chartTxt) && await pg.locator('.sl .sl-chart svg rect').count() >= 20);
  await pg.locator('.sl .sl-b').screenshot({ path: OUT + 'sleep-b-laptop.png' });
  // pick another night: from the small ones, then back with ›
  check('the last 14 nights, small', await pg.locator('.sl .sl-mini').count() === 14);
  await pg.locator('.sl .sl-mini').nth(10).click();
  const t2 = await pg.locator('.sl .sl-title').innerText();
  check(`tapping a small night opens it above (${t2})`, /^Night · /.test(t2) && await pg.locator('.sl .sl-mini').nth(10).getAttribute('aria-pressed') === 'true');
  await pg.getByRole('button', { name: 'The night after' }).click();
  check('› steps to the next night', (await pg.locator('.sl .sl-title').innerText()) !== t2);
  // A: the log
  const typ = await pg.locator('.sl .sl-typical p').innerText();
  check(`a typical night, in words (${typ.slice(0, 90)}…)`, /You’re usually in bed by \d\d:\d\d, asleep \d+ minutes later, and up at \d\d:\d\d — about \d h \d\d of sleep\./.test(typ));
  const score = +(await pg.locator('.sl .sl-reg').getAttribute('data-score'));
  check(`regularity as one number (${score}/100)`, score >= 70 && score <= 98 && /How alike your days are/.test(await pg.locator('.sl .sl-reg').innerText()));
  check('a row and a button per night, 8 numbers each', await pg.locator('.sl .sl-rowbtn').count() === nN && await pg.locator('.sl .sl-colh').count() === 8);
  await pg.locator('.sl .sl-rowbtn').nth(3).click(); await pg.waitForTimeout(200);
  check('tapping a row opens that night at the top', (await pg.locator('.sl .sl-rowbtn').nth(3).getAttribute('aria-pressed')) === 'true');
  await pg.locator('.sl .sl-a').screenshot({ path: OUT + 'sleep-a-laptop.png' });
  // C: what goes with
  const cell = (f, o) => pg.locator(`.sl .sl-cell[aria-label^="${f} and ${o}:"]`);
  const attrs = async (f, o) => { const c = cell(f, o); return { sure: await c.getAttribute('data-sure'), toward: await c.getAttribute('data-toward'), text: await c.innerText() }; };
  const lowC = await attrs('Drinks that evening', 'Low HR'), atC = await attrs('Drinks that evening', 'Low at'), hrvC = await attrs('Drinks that evening', 'HRV');
  check(`drinks → lowest heart rate: clear, the other way (${lowC.text} ${lowC.sure})`, lowC.sure === 'clear' && lowC.toward === 'worse');
  check(`drinks → when the low comes: later (${atC.text} ${atC.sure})`, atC.sure === 'clear' && /^\+/.test(atC.text));
  check(`drinks → HRV: lower (${hrvC.text} ${hrvC.sure})`, hrvC.sure === 'clear' && /^−/.test(hrvC.text));
  const others = await pg.locator('.sl .sl-cell').evaluateAll((cs) => cs.filter((c) => !c.getAttribute('aria-label').startsWith('Drinks') && c.dataset.sure === 'clear').map((c) => c.getAttribute('aria-label')));
  check(`nothing planted in the other rows — none of them clear (${others.join('; ') || 'none'})`, others.length === 0);
  check('things no night (or every night) had are named once, not drawn as empty rows', await pg.locator('.sl .sl-mf').count() === 3 && /Not enough nights yet .*caffeine at bed ≥ 30 mg \(0 with, 30 without\)/.test(await pg.locator('.sl .sl-c').innerText()));
  check('a clear cell is opened to show every night behind it', await pg.locator('.sl .sl-open').count() === 1 && await pg.locator('.sl .sl-open circle').count() >= nN - 2);
  await cell('Trained that day', 'Deep').click();
  check('tapping another cell opens it', (await pg.locator('.sl .sl-open').getAttribute('data-factor')) === 'trained' && (await pg.locator('.sl .sl-open').getAttribute('data-outcome')) === 'deep');
  await pg.locator('.sl .sl-c').screenshot({ path: OUT + 'sleep-c-laptop.png' });
  // Owner, 9 Oct ("do 2"): with the band's nights the old rating / caffeine panels only repeated this page.
  check('the old rating and caffeine panels are gone with the band, and so is the header\'s period (the page has its own nights)', await pg.locator('.gl-caf, .gl-sleep').count() === 0 && await pg.locator('[aria-label="Period for the charts"]').count() === 0);
  await pg.goto(APP + '#insights/intake'); await pg.waitForTimeout(300);
  check(`drinks per week moved to Food & body (${(await pg.locator('[data-sec="intake"] .gl-drinks').innerText().catch(() => '')).split('\n').slice(0, 3).join(' · ')})`, await pg.locator('[data-sec="intake"] .gl-drinks').isVisible());
  await ctx.close();

  // ---- phone
  ({ ctx, pg } = await open(390));
  const sw = await pg.evaluate(() => document.documentElement.scrollWidth);
  check(`phone: nothing wider than the screen (${sw})`, sw <= 390);
  const yNums = (await pg.locator('.sl .sl-nums').boundingBox()).y, yChart = (await pg.locator('.sl .sl-chart').boundingBox()).y;
  check('phone: the numbers and what was different come before the chart', yNums < yChart);
  check('phone: the log keeps one number per night, with naps marked', await pg.locator('.sl .sl-colh').count() === 1 && await pg.locator('.sl .sl-nap').count() >= 1);
  check('phone: the grid fits (6 measures)', await pg.locator('.sl .sl-mh').count() === 6 && (await pg.locator('.sl .sl-matrix').boundingBox()).width <= 370);
  const bb = await pg.locator('.sl .sl-bar .ibtn').first().boundingBox();
  check(`phone: night arrows big enough to tap (${Math.round(bb.width)}×${Math.round(bb.height)})`, bb.height >= 34 && bb.width >= 44);
  await pg.locator('.sl .sl-b').screenshot({ path: OUT + 'sleep-b-phone.png' });
  await pg.locator('.sl .sl-a').screenshot({ path: OUT + 'sleep-a-phone.png' });
  await pg.locator('.sl .sl-c').screenshot({ path: OUT + 'sleep-c-phone.png' });
  await ctx.close();

  console.log('errors: ' + JSON.stringify(errs));
  await b.close();
})().catch((e) => { console.log('CRASH ' + e.message); process.exit(1); });
