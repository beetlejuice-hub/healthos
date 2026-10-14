// Insights → Training, C · what training goes with afterwards (PLAN 64; owner, 13 Oct: all three boards, "go"). 12 fake
// weeks of Push / Pull / Legs (Mon/Wed/Fri + some Saturdays, mornings or evenings), every working set, two check-ins a day,
// the band's nights, morning HRV and resting HR, and heart rate every 2 minutes. Planted: a heavy session (more kg than that
// template's last sessions — the app's own rule, computed here the same way) → the next morning's HRV −6 ms; heart rate
// back to usual after a session 1 min faster each week (38 → 27). Nothing for sleep, resting HR, energy or mood, and no
// link between a week's kg and its energy. The page must find those two, and nothing else clear.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

const MIN = 60_000, H = 3_600_000, D = 86_400_000, NOW = new Date('2026-10-14T21:00:00').getTime();
const at = (k, h = 0) => new Date(2026, 6, 20 + k).getTime() + h * H; // day k from Mon 20 Jul
const day = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
function rng(seed) {
  let s = seed >>> 0;
  const r = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { r, g: () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()) };
}
const LIFTS = { Push: [['Bench press', 100], ['Overhead press', 60]], Pull: [['Barbell row', 85], ['Lat pulldown', 70]], Legs: [['Squat', 130], ['Romanian deadlift', 110]] };
const median = (v) => { const s = [...v].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
function world() {
  const { r, g } = rng(23), entries = [], workouts = [], sleep = [], hr = [], rhr = {}, hrv = {}, sess = [];
  let n = 0;
  const DAYS = Math.floor((NOW - at(0)) / D) + 1;
  for (let k = 0; k < DAYS; k++) {
    const dow = new Date(at(k)).getDay(), wk = Math.floor(k / 7);
    for (const h of [10, 16]) if (at(k, h) < NOW) entries.push({ id: `f${k}-${h}`, kind: 'feel', at: at(k, h), energy: Math.max(1, Math.min(10, Math.round(6.5 + 0.8 * g()))), mood: Math.max(1, Math.min(10, Math.round(6.6 + 0.8 * g()))) });
    if (!(dow === 1 || dow === 3 || dow === 5 || (dow === 6 && r() < 0.35))) continue;
    const tpl = ['Push', 'Pull', 'Legs'][n++ % 3], late = r() < 0.5, start = at(k, late ? 18 + r() : 8 + r()), id = `w${k}`;
    if (start + H > NOW) continue;
    workouts.push({ id, template: tpl, startedAt: start, endedAt: start + H });
    let vol = 0;
    for (const [ex, b] of LIFTS[tpl]) {
      const kg = Math.round(b * 0.8 * (1 + 0.006 * wk) * (1 + 0.1 * g()) / 2.5) * 2.5;
      for (let q = 0; q < 3; q++) { entries.push({ id: `${id}${ex}${q}`, kind: 'set', at: start + (q + 1) * 3 * MIN, workoutId: id, exercise: ex, kg, reps: 5 }); vol += kg * 5; }
    }
    sess.push({ id, tpl, start, end: start + H, vol, wk, back: 38 - wk + g() });
  }
  // heavy as the app has it: more than the median of that template's last 6 sessions, once it has 3
  const prior = {}, heavyDays = new Set();
  for (const s of sess) { const p = prior[s.tpl] ?? (prior[s.tpl] = []); if (p.length >= 3 && s.vol > median(p.slice(-6))) heavyDays.add(day(s.start)); p.push(s.vol); }
  for (let k = 0; k < DAYS; k++) {
    const bed = at(k - 1, 23 + g() * 0.2), onset = bed + 12 * MIN, wake = at(k, 6.9 + g() * 0.2), up = wake + 6 * MIN; // the night ending morning k
    if (up > NOW) continue;
    const stages = [{ type: 'awake', start: bed, end: onset }];
    for (let t = onset, c = 0; t < wake - 20 * MIN; c++) { const e = Math.min(wake, t + 90 * MIN), L = e - t; stages.push({ type: 'light', start: t, end: t + L * 0.45 }, { type: c < 2 ? 'deep' : 'light', start: t + L * 0.45, end: t + L * 0.7 }, { type: 'rem', start: t + L * 0.7, end: e }); t = e; }
    stages.push({ type: 'awake', start: wake, end: up });
    sleep.push({ id: 's' + k, start: bed, end: up, asleepMin: Math.round((wake - onset) / MIN), awakeMin: 10, toFallAsleepMin: 12, nap: false, stageMin: {}, stages });
    hrv[day(at(k))] = Math.round((46 + 3.5 * g() - (heavyDays.has(day(at(k - 1))) ? 6 : 0)) * 10) / 10;
    rhr[day(at(k))] = Math.round(53 + 0.9 * g());
  }
  // heart rate every 2 minutes from 15 days before the first session: a daily rhythm, 130 during a session, and after it a
  // fall back that's within 3 bpm of the rhythm at the planted minute
  for (let t = at(-15), i = 0; t < NOW; t += 2 * MIN) {
    while (i < sess.length && sess[i].end + 3 * H < t) i++;
    let v = 62 + 8 * Math.sin(2 * Math.PI * ((t - at(-15)) / D - 0.3)) + g();
    const s = sess[i];
    if (s && t >= s.start && t < s.end) v = 130 + 3 * g();
    else if (s && t >= s.end) v += 50 * Math.exp(-((t - s.end) / MIN) / (s.back / Math.log(50 / 3)));
    const a = Math.round(v); hr.push([t, a, a - 2, a + 2]);
  }
  return { entries, workouts, sleep, hr, rhr, hrv, sess, heavyDays };
}

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const w = world();
  const templates = Object.entries(LIFTS).map(([name, xs], i) => ({ id: 't' + i, name, exercises: xs.map(([nm]) => ({ name: nm, sets: 3, reps: 5, restSec: 120 })) }));
  for (const [vw, vh] of [[390, 900], [1280, 900]]) {
    const ctx = await b.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 2, ...(vw < 500 ? { isMobile: true, hasTouch: true } : {}) });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    await ctx.route(/\/api\/band\//, (rt) => {
      const u = new URL(rt.request().url()), op = u.pathname.split('/').pop(), from = +u.searchParams.get('from'), to = +u.searchParams.get('to');
      const st = { connected: true, needsReconnect: false, connectedAt: NOW - 100 * D, lastSync: NOW - 3 * MIN, latest: w.hr.at(-1)[0], error: null, gapSec: 120 };
      const inR = (t) => t >= from && t <= to;
      rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(op === 'data' ? { hr: w.hr.filter((m) => inR(m[0])), steps: [], sleep: w.sleep.filter((x) => x.end >= from - D && x.start <= to), rhr: w.rhr, hrv: w.hrv, ...st } : st) });
    });
    const pg = await ctx.newPage();
    await pg.clock.install({ time: NOW });
    pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
    await pg.goto(APP);
    await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
    await pg.evaluate((x) => { const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = x.entries; s.workouts = x.workouts; s.templates = x.templates; localStorage.setItem(k, JSON.stringify(s)); }, { ...w, templates });
    await pg.goto(APP + '#insights/training'); await pg.reload(); await pg.waitForSelector('.tp-c', { timeout: 15000 });
    // the band's 12 weeks arrive in pieces; the grid settles once the nights are in
    await pg.waitForFunction(() => +document.querySelector('.tp-c')?.dataset.days >= 80, null, { timeout: 20000 }).catch(() => {});
    await pg.waitForTimeout(500);
    const tag = vw < 500 ? 'phone' : 'laptop';
    if (vw < 500) {
      const days = +(await pg.locator('.tp-c').getAttribute('data-days'));
      check(`grid: a row per day from the first session, each with its night (${days})`, days >= 80 && days <= 87);
      const cell = (f, o) => pg.locator('.tp-c .sl-cell').evaluateAll((els, [f, o]) => { const e = els.find((x) => x.getAttribute('aria-label')?.startsWith(`${f} and ${o}:`)); return e ? [e.dataset.sure, e.dataset.toward, e.textContent] : null; }, [f, o]);
      const heavy = await cell('Heavy session', 'HRV');
      check(`heavy session → next morning's HRV, planted −6 ms, found (${heavy})`, heavy && (heavy[0] === 'clear' || heavy[0] === 'likely') && heavy[1] === 'worse' && /^−[3-9]/.test(heavy[2]));
      const other = await pg.locator('.tp-c .sl-cell').evaluateAll((els) => els.filter((x) => x.dataset.sure === 'clear' && !/ and HRV:/.test(x.getAttribute('aria-label') || '')).map((x) => x.getAttribute('aria-label')));
      check(`nothing clear where nothing was planted (${other.join(' | ') || 'none'})`, other.length === 0);
      const op = await pg.locator('.tp-c .sl-open').evaluateAll((els) => els.map((e) => [e.dataset.factor, e.dataset.outcome, e.querySelectorAll('circle').length]));
      check(`the opened cell is heavy → HRV, every session a dot (${op.join(' | ')})`, op.length === 1 && op[0][0] === 'heavy' && op[0][1] === 'hrv' && op[0][2] >= 25);
      // weeks: one bar per week with sessions, the kg the fake world lifted, this week "so far"
      const bars = await pg.locator('.tp-weeks rect.kg').evaluateAll((els) => els.map((e) => [+e.dataset.week, +e.dataset.kg, e.classList.contains('so-far')]));
      const wkKg = new Map(); for (const s of w.sess) { const d = new Date(s.start); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); wkKg.set(d.getTime(), (wkKg.get(d.getTime()) ?? 0) + s.vol); }
      const off = bars.filter(([t, kg]) => Math.abs((wkKg.get(t) ?? -1) - kg) > 1);
      check(`weeks: ${bars.length} bars, each the kg lifted that week (off: ${off.length}), the last "so far"`, bars.length === wkKg.size && off.length === 0 && bars.at(-1)[2] && bars.filter((x) => x[2]).length === 1);
      const ww = await pg.locator('.tp-weeks .he-words').innerText();
      check(`weeks: nothing planted between kg and energy, so not clear (${ww})`, /haven't gone clearly/.test(ww));
      // recovery: planted 1 min faster a week
      const rw = await pg.locator('.tp-back .he-words').innerText(), dots = await pg.locator('.tp-back circle.back-dot').count();
      const mins = +(rw.match(/About (\d+) min faster than in Jul/) || [])[1];
      check(`heart rate back to usual: about 11 min faster since July, found (${rw}; ${dots} sessions)`, mins >= 6 && mins <= 16 && /\((clear|likely)\)/.test(rw) && dots >= 30);
    }
    check(`${tag}: nothing wider than the screen (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= vw);
    await pg.locator('.tp-c').screenshot({ path: OUT + `training-c-${tag}.png` });
    await ctx.close();
  }
  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
