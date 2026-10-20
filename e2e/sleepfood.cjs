// Food and activities against sleep (PLAN 88). Owner, 13 Oct: "I'm big on sleep and how it affects me and foods and
// activities like late night scrolling how it affects sleep score deep sleep etc". 30 fake nights from the band with dinner
// logged at different times and magnesium answered most days. Planted: dinner within 2 h of bed → 20 min longer to fall
// asleep; magnesium taken that day → more deep sleep. On a phone the grid shows every column, scrolling sideways with the
// row names fixed.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

const MIN = 60_000, HOUR = 3_600_000, NOW = new Date('2026-10-09T16:30:00').getTime();
function rng(seed) {
  let s = seed >>> 0;
  const r = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { r, g: () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()) };
}
function world() {
  const { r, g } = rng(5), hr = [], sleep = [], entries = [];
  for (let k = 30; k >= 1; k--) {
    const day0 = new Date(2026, 9, 9 - k).getTime(), T = (h) => day0 + h * HOUR; // the evening's day
    const bed = T(23.2 + g() * 0.15), dinner = T(18 + r() * 4.8), late = bed - dinner < 2 * HOUR;
    const ans = r(), mag = ans < 0.5;
    entries.push({ id: 'f' + k, kind: 'food', at: dinner, name: 'Dinner', grams: 450, macros: { kcal: 750, p: 40, c: 80, f: 25 } });
    if (ans < 0.5) entries.push({ id: 'm' + k, kind: 'supp', at: T(21.5), suppId: 'mag', status: 'taken', slot: 'evening' });
    else if (ans < 0.85) entries.push({ id: 'm' + k, kind: 'supp', at: T(21.5), suppId: 'mag', status: 'skipped', slot: 'evening' });
    const onset = bed + (12 + Math.abs(g() * 3) + (late ? 20 : 0)) * MIN, up = T(31 + g() * 0.2), wake = up - 6 * MIN;
    const stages = [{ type: 'awake', start: bed, end: onset }];
    for (let t = onset, c = 0; t < wake - 20 * MIN; c++) { const e = Math.min(wake, t + 90 * MIN), L = e - t; stages.push({ type: 'light', start: t, end: t + L * 0.45 }, { type: c < (mag ? 3 : 2) ? 'deep' : 'light', start: t + L * 0.45, end: t + L * 0.7 }, { type: 'rem', start: t + L * 0.7, end: e }); t = e; }
    stages.push({ type: 'awake', start: wake, end: up });
    sleep.push({ id: 's' + k, start: bed, end: up, asleepMin: Math.round((wake - onset) / MIN), awakeMin: 20, toFallAsleepMin: Math.round((onset - bed) / MIN), nap: false, stageMin: {}, stages });
    for (let t = bed - HOUR; t < up; t += MIN) { const v = Math.round((t > onset && t < wake ? 54 : 64) + g()); hr.push([t, v, v - 2, v + 2]); }
    entries.push({ id: 'r' + k, kind: 'sleep', at: up + 30 * MIN, rating: 7 });
  }
  return { hr: hr.sort((a, b) => a[0] - b[0]), sleep, entries: entries.sort((a, b) => a.at - b.at) };
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
    rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(op === 'data' ? { hr: w.hr.filter((m) => inR(m[0])), steps: [], sleep: w.sleep.filter((x) => x.end >= from - 86_400_000 && x.start <= to), rhr: {}, hrv: {}, ...st } : st) });
  });
  const pg = await ctx.newPage();
  await pg.clock.install({ time: NOW });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  await pg.evaluate((es) => { const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = es; s.workouts = [];
    s.supplements = [{ id: 'mag', name: 'Magnesium', dose: '200 mg', slot: 'evening', at: 1290, active: true }]; localStorage.setItem(k, JSON.stringify(s)); }, w.entries);
  await pg.goto(APP + '#insights/sleep'); await pg.reload(); await pg.waitForSelector('.sl[data-nights]');
  await pg.waitForFunction(() => +document.querySelector('.sl')?.dataset.nights >= 25, null, { timeout: 15000 }).catch(() => {});
  await pg.waitForTimeout(400);
  const cell = (f, o) => pg.locator('.sl .sl-cell').evaluateAll((els, [f, o]) => { const e = els.find((x) => x.getAttribute('aria-label')?.startsWith(`${f} and ${o}:`)); return e ? [e.dataset.sure, e.dataset.toward, e.textContent] : null; }, [f, o]);
  const rowN = (name) => pg.locator('.sl .sl-mf').evaluateAll((els, name) => { const e = els.find((x) => x.firstChild.textContent === name); const m = e?.querySelector('small')?.textContent.match(/(\d+) vs (\d+)/); return m ? +m[1] + +m[2] : null; }, name);
  const cols = await pg.locator('.sl .sl-mh').allInnerTexts();
  check(`every column on a phone, "Fell asleep" and "Rating" among them (${cols.join(', ')})`, cols.includes('Fell asleep') && cols.includes('Rating') && cols.includes('Woke up') && cols.length === 10);
  const late = await cell('Ate within 2 h of bed', 'Fell asleep');
  check(`dinner within 2 h of bed → longer to fall asleep, planted +20 min, found (${late})`, late && (late[0] === 'clear' || late[0] === 'likely') && late[1] === 'worse' && /^\+\d+m$/.test(late[2]));
  const mag = await cell('Magnesium that day', 'Deep'), magN = await rowN('Magnesium that day');
  const answered = w.entries.filter((e) => e.kind === 'supp').length, firstK = Math.max(...w.entries.filter((e) => e.kind === 'supp').map((e) => +e.id.slice(1)));
  check(`magnesium days → more deep, found (${mag})`, mag && (mag[0] === 'clear' || mag[0] === 'likely') && mag[1] === 'better');
  // not logged = not taken (owner, 20 Oct): every day the app was used counts from its first log — the unanswered ones as without
  check(`magnesium: every used day from its first log counts, unlogged ones as without (${magN} of 30 nights; ${answered} logged; from night ${31 - firstK})`, magN != null && magN > answered && magN <= firstK && magN >= firstK - 2);
  const nothing = await pg.locator('.sl .sl-cell').evaluateAll((els) => els.filter((x) => /^(Magnesium that day|Ate within 2 h of bed) and Woke up:/.test(x.getAttribute('aria-label') || '') && x.dataset.sure === 'clear').length);
  check(`nothing planted on waking up: not clear (${nothing})`, nothing === 0);
  // sideways on a phone, the names fixed
  const sc = pg.locator('.sl .sl-mscroll');
  const dims = await sc.evaluate((el) => [el.scrollWidth, el.clientWidth]);
  check(`the grid scrolls sideways inside its card (${dims[0]} in ${dims[1]} px), the page doesn't (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, dims[0] > dims[1] && await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
  const name = pg.locator('.sl .sl-mf').first(), x0 = (await name.boundingBox()).x;
  await sc.evaluate((el) => { el.scrollLeft = 200; }); await pg.waitForTimeout(100);
  check(`…and the row names stay put while it scrolls (${Math.round(x0)} → ${Math.round((await name.boundingBox()).x)} px)`, Math.abs((await name.boundingBox()).x - x0) < 2);
  await sc.evaluate((el) => { el.scrollLeft = 0; });
  await pg.locator('.sl .sl-c').screenshot({ path: OUT + 'sleepfood-grid.png' });
  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
