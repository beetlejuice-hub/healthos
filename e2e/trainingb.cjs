// Insights → Training, B · what goes with a strong session (PLAN 64; owner, 9 Oct: "Make sure app sees connection between
// food intake, calorie, carbs, and strength in gym"). 12 fake weeks: Push/Pull/Legs Mon/Wed/Fri (+ some Saturdays), a meal
// 1–3 h before each (carb-heavy about half the time), the band's night before, coffee before ~60 %, creatine answered most
// days. Planted: carbs ≥ 60 g in the 4 h before → +3.5 % against each lift's line; under 6 h 30 asleep → −4 %. Nothing for
// coffee, creatine or evening. The page must say carbs (and the short night), and not coffee.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

const MIN = 60_000, H = 3_600_000, D = 86_400_000, NOW = new Date('2026-10-12T21:00:00').getTime();
function rng(seed) {
  let s = seed >>> 0;
  const r = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { r, g: () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()) };
}
const LIFTS = { Push: [['Bench press', 100], ['Overhead press', 60]], Pull: [['Deadlift', 160], ['Barbell row', 85]], Legs: [['Squat', 130], ['Romanian deadlift', 110]] };
function world() {
  const { r, g } = rng(41), entries = [], workouts = [], sleep = [], hr = [], truth = {};
  const t0 = new Date(2026, 6, 20).getTime(); let n = 0;
  for (let k = 0; k < 84; k++) {
    const day0 = t0 + k * D; if (day0 > NOW) break;
    const dow = new Date(day0).getDay(), wk = Math.floor(k / 7);
    entries.push({ id: `l${k}`, kind: 'food', at: day0 + 12.5 * H, name: 'Lunch', grams: 400, macros: { kcal: 700, p: 40, c: 70, f: 20 } });
    if (r() < 0.85) entries.push({ id: `c${k}`, kind: 'supp', at: day0 + 8 * H, suppId: 'crea', status: r() < 0.8 ? 'taken' : 'skipped', slot: 'morning' });
    // the night ending this morning
    const asleep = Math.max(320, Math.min(520, 415 + g() * 45)), short = asleep < 390, bed = day0 - 1.3 * H, onset = bed + 12 * MIN, wake = onset + asleep * MIN, up = wake + 5 * MIN;
    const stages = [{ type: 'awake', start: bed, end: onset }];
    for (let t = onset, c = 0; t < wake - 10 * MIN; c++) { const e = Math.min(wake, t + 90 * MIN), L = e - t; stages.push({ type: 'light', start: t, end: t + L * 0.45 }, { type: c < 2 ? 'deep' : 'light', start: t + L * 0.45, end: t + L * 0.7 }, { type: 'rem', start: t + L * 0.7, end: e }); t = e; }
    stages.push({ type: 'awake', start: wake, end: up });
    sleep.push({ id: 's' + k, start: bed, end: up, asleepMin: Math.round(asleep), awakeMin: 10, toFallAsleepMin: 12, nap: false, stageMin: {}, stages });
    for (let t = bed; t < up; t += 5 * MIN) { const v = 55 + Math.round(g()); hr.push([t, v, v - 2, v + 2]); }
    const trains = dow === 1 || dow === 3 || dow === 5 || (dow === 6 && r() < 0.35);
    if (!trains) continue;
    const tpl = ['Push', 'Pull', 'Legs'][n++ % 3], evening = r() < 0.6, start = day0 + (evening ? 17.5 + r() * 2 : 9 + r() * 1.5) * H, id = `w${k}`;
    if (start > NOW - 2 * H) continue;
    const carbs = r() < 0.5, coffee = r() < 0.6;
    entries.push(carbs ? { id: `m${k}`, kind: 'food', at: start - (1 + r() * 2) * H, name: 'Rice', grams: 300, macros: { kcal: 500, p: 20, c: Math.round(70 + r() * 45), f: 8 } }
      : { id: `m${k}`, kind: 'food', at: start - (1 + r() * 2) * H, name: 'Eggs', grams: 200, macros: { kcal: 300, p: 25, c: Math.round(5 + r() * 25), f: 20 } });
    if (coffee) entries.push({ id: `cf${k}`, kind: 'drink', at: start - (0.3 + r()) * H, name: 'Coffee', ml: 250, caffeineMg: 95, alcoholG: 0, kcal: 2 });
    const eff = (carbs ? 3.5 : 0) - (short ? 4 : 0);
    truth[id] = { carbs, short };
    workouts.push({ id, template: tpl, startedAt: start, endedAt: start + H });
    for (const [ex, b] of LIFTS[tpl]) {
      const e1 = b * (1 + 0.006 * wk) * (1 + (eff + g() * 1.2) / 100), kg = e1 / (1 + 5 / 30);
      for (let q = 0; q < 3; q++) entries.push({ id: `${id}${ex}${q}`, kind: 'set', at: start + (q + 1) * MIN, workoutId: id, exercise: ex, kg: Math.round((q ? kg * 0.95 : kg) * 10) / 10, reps: 5 });
    }
    entries.push({ id: `fa${k}`, kind: 'feel', at: start + 1.5 * H, energy: Math.max(1, Math.min(10, Math.round(6.5 + g() * 0.8))) });
  }
  return { entries: entries.sort((a, b) => a.at - b.at), workouts, sleep, hr: hr.sort((a, b) => a[0] - b[0]), truth };
}

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const w = world();
  const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  await ctx.route(/\/api\/band\//, (rt) => {
    const u = new URL(rt.request().url()), op = u.pathname.split('/').pop(), from = +u.searchParams.get('from'), to = +u.searchParams.get('to');
    const st = { connected: true, needsReconnect: false, connectedAt: NOW - 100 * D, lastSync: NOW - 3 * MIN, latest: w.hr.at(-1)[0], error: null, gapSec: 300 };
    const inR = (t) => t >= from && t <= to;
    rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(op === 'data' ? { hr: w.hr.filter((m) => inR(m[0])), steps: [], sleep: w.sleep.filter((x) => x.end >= from - D && x.start <= to), rhr: {}, hrv: {}, ...st } : st) });
  });
  const pg = await ctx.newPage();
  await pg.clock.install({ time: NOW });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  await pg.evaluate((w) => { const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = w.entries; s.workouts = w.workouts;
    s.supplements = [{ id: 'crea', name: 'Creatine', dose: '5 g', slot: 'morning', at: 480, active: true }]; localStorage.setItem(k, JSON.stringify(s)); }, w);
  await pg.goto(APP + '#insights/training'); await pg.reload(); await pg.waitForSelector('.tp-b', { timeout: 15000 });
  // the band's 12 weeks arrive in pieces; the words settle once the nights are in
  await pg.waitForFunction(() => /under 6 h 30/.test(document.querySelector('.tp-bwords .mp-big')?.textContent ?? ''), null, { timeout: 15000 }).catch(() => {});
  const words = await pg.locator('.tp-bwords .mp-big').innerText();
  check(`in words: carbs before and the short night (${words})`, /carbs ≥ 60 g in the 4 h before \(\+\d\.\d %, (clear|likely)\)/.test(words) && /under 6 h 30 asleep the night before \(−\d\.\d %, (clear|likely)\)/.test(words) && !/coffee/i.test(words));
  const cell = (f, o) => pg.locator('.tp-b .sl-cell').evaluateAll((els, [f, o]) => { const e = els.find((x) => x.getAttribute('aria-label')?.startsWith(`${f} and ${o}:`)); return e ? [e.dataset.sure, e.dataset.toward, e.textContent] : null; }, [f, o]);
  const c1 = await cell('Carbs ≥ 60 g in the 4 h before', 'Strength'), c2 = await cell('Coffee in the 2 h before', 'Strength'), c3 = await cell('Creatine that day', 'Strength');
  check(`grid: carbs → strength, planted +3.5 %, found (${c1})`, c1 && (c1[0] === 'clear' || c1[0] === 'likely') && c1[1] === 'better');
  check(`grid: coffee and creatine, nothing planted, nothing clear (${c2} | ${c3})`, c2 && c2[0] !== 'clear' && c3 && c3[0] !== 'clear');
  const sw = await pg.locator('.tp-carbs .he-words').innerText().catch(() => '');
  check(`carbs as a number: a rising line (${sw})`, /^Strength goes with \+\d\.\d % per 10 g of carbs in the 4 h before · (clear|likely)\.$/.test(sw));
  // B2: every session in the lanes, highlighted where the fake world put carbs before or a short night
  const measured = +(await pg.locator('.tp-b .cmp-k', { hasText: 'Your strong sessions' }).innerText()).match(/(\d+) sessions/i)[1];
  const lanes = await pg.locator('.tp-lanes g[data-session]').evaluateAll((els) => els.map((e) => [e.dataset.session, e.dataset.hot.split(','), +e.dataset.pct, !!e.querySelector('rect.up')]));
  check(`lanes: one column per measured session (${lanes.length} of ${measured})`, lanes.length === measured && measured >= 30);
  const off = (k) => lanes.filter(([id, hot]) => w.truth[id] && hot.includes(k) !== w.truth[id][k]).map(([id]) => id);
  check(`lanes: carbs highlighted exactly where the meal before had 60 g+ (${lanes.filter((l) => l[1].includes('carbs')).length} sessions, off: ${off('carbs').join(' ') || 'none'})`, off('carbs').length === 0);
  check(`lanes: short nights highlighted exactly where the band's night was under 6 h 30 (${lanes.filter((l) => l[1].includes('short')).length}, off: ${off('short').join(' ') || 'none'})`, off('short').length === 0);
  check(`lanes: each strength bar points the way of its session's % (${lanes.filter((l) => Math.abs(l[2]) >= 0.1 && (l[2] > 0) !== l[3]).length} wrong)`, lanes.every((l) => Math.abs(l[2]) < 0.1 || (l[2] > 0) === l[3]));
  await pg.locator('.tp-lanes').screenshot({ path: OUT + 'training-b2-lanes-phone.png' });
  await pg.locator('.tp-b').screenshot({ path: OUT + 'training-b-phone.png' });
  check(`phone: nothing wider than the screen (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
