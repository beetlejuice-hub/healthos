// Insights → Heart (PLAN 55, owner's pick 9 Oct: C with A's one-day chart on top). Fake band: 30 Charge-6-shaped days —
// nights with stages, every minute of the day (the morning climb, coffee, meals, workouts and the way back down), daily
// resting heart rate and HRV, stress check-ins three times a day. Planted: mornings after drink evenings (about a third)
// have resting heart rate +4 and HRV −9; heart rate in the hour around a check-in runs +0.8 bpm per point of stress, and
// more stress is given in the afternoon (when heart rate is higher anyway). The page must find those and nothing else.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

const MIN = 60_000, HOUR = 3_600_000;
const NOW = new Date('2026-10-08T16:30:00').getTime();
function rng(seed) {
  let s = seed >>> 0;
  const r = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { r, g: () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()) };
}
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function world({ seed = 7, everyMin = 1 } = {}) {
  const { r, g } = rng(seed), sleep = [], hr = [], rhr = {}, hrv = {}, entries = [], workouts = [], drinkEves = [];
  let prevDrinks = false;
  for (let k = 30; k >= 0; k--) {
    const mid = new Date(2026, 9, 8 - k).getTime(), today = k === 0, T = (h) => mid + h * HOUR, date = ymd(new Date(mid));
    // the night before this day: from yesterday evening to this morning
    const bed = T(-0.6 + g() * 0.3), up = T(7.1 + g() * 0.25), onset = bed + 12 * MIN, wake = up - 5 * MIN;
    const stages = [{ type: 'awake', start: bed, end: onset }];
    for (let t = onset, c = 0; t < wake - 20 * MIN; c++) { const e = Math.min(wake, t + 90 * MIN), L = e - t; stages.push({ type: 'light', start: t, end: t + L * 0.45 }, { type: c < 2 ? 'deep' : 'light', start: t + L * 0.45, end: t + L * 0.7 }, { type: 'rem', start: t + L * 0.7, end: e }); t = e; }
    stages.push({ type: 'awake', start: wake, end: up });
    const mins = (ty) => Math.round(stages.filter((s) => s.type === ty).reduce((m, s) => m + (s.end - s.start) / MIN, 0));
    if (k < 30) sleep.push({ id: 's' + k, start: bed, end: up, asleepMin: mins('light') + mins('deep') + mins('rem'), awakeMin: mins('awake'), toFallAsleepMin: 12, nap: false, stageMin: { deep: mins('deep'), light: mins('light'), rem: mins('rem'), awake: mins('awake') }, stages });
    if (k < 30) { rhr[date] = Math.round(53 + g() * 0.8 + (prevDrinks ? 4 : 0)); hrv[date] = Math.round(46 + g() * 3 - (prevDrinks ? 9 : 0)); }
    const dow = new Date(mid).getDay(), drinks = !today && r() < (dow === 5 || dow === 6 ? 0.6 : 0.2);
    if (drinks) drinkEves.push(date);
    const coffees = [T(8.1 + r() * 0.3)]; if (today || r() < 0.35) coffees.push(T(today ? 14.25 : 14.5 + r()));
    const gym = today ? [T(11), T(11.9)] : r() < 0.4 ? [T(17.8), T(18.85)] : null;
    if (gym) workouts.push({ id: 'w' + k, template: 'Push day', startedAt: gym[0], endedAt: gym[1] });
    const checks = [10, 15, 20].map((h) => ({ at: T(h + r() * 0.4), stress: Math.max(1, Math.min(10, Math.round((h === 15 ? 6.5 : 3.5) + g() * 1.5))) }));
    const off = g() * 1.5;
    for (let m = k < 30 ? bed : T(0); m < T(24) && m <= NOW - 2 * MIN; m += everyMin * MIN) {
      if (m < T(0) && k === 30) continue;
      const h = (m - mid) / HOUR, asleep = m >= bed && m < up;
      let v;
      if (asleep) v = 52 + (prevDrinks ? 4 : 0) + Math.abs(h - 3) * 1.4 + g();
      else {
        v = 63 + off + 6 * Math.sin(((h - 9) / 14) * Math.PI) + (h - 7.1 < 1 ? -6 * (1 - (h - 7.1)) : 0);
        for (const c of coffees) { const x = (m - c) / MIN; if (x > 0 && x < 240) v += 4 * (x / 45) * Math.exp(1 - x / 45); }
        for (const c of checks) if (Math.abs(m - c.at) <= HOUR) v += 0.8 * (c.stress - 5);
        if (drinks && h >= 20.5) v += 4;
        if (gym) { if (m >= gym[0] && m < gym[1]) v = 128 + 10 * Math.sin((m - gym[0]) / 540_000) + g() * 4; else if (m >= gym[1] && m < gym[1] + 2 * HOUR) v += 55 * Math.exp(-((m - gym[1]) / MIN) / 18); }
        v += g() * 2;
      }
      if (m >= T(-0.6) && m < T(24)) { const a = Math.round(v); hr.push([m, a, a - 2, a + 3]); }
    }
    coffees.forEach((at, i) => entries.push({ id: `c${k}${i}`, kind: 'drink', at, name: 'Coffee', ml: 250, caffeineMg: 95, alcoholG: 0, kcal: 2 }));
    if (drinks) [20.6, 21.7].forEach((hh, i) => entries.push({ id: `b${k}${i}`, kind: 'drink', at: T(hh), name: 'Beer', ml: 500, caffeineMg: 0, alcoholG: 20, kcal: 210 }));
    checks.forEach((c, i) => entries.push({ id: `f${k}${i}`, kind: 'feel', at: c.at, stress: c.stress, mood: 6 }));
    entries.push({ id: 'l' + k, kind: 'food', at: T(12.9), name: 'Lunch', grams: 400, macros: { kcal: 700, p: 40, c: 80, f: 22 } });
    prevDrinks = drinks;
  }
  const hrs = [...new Map(hr.map((m) => [m[0], m])).values()].sort((a, b) => a[0] - b[0]);
  return { sleep, hr: hrs, rhr, hrv, entries: entries.filter((e) => e.at < NOW).sort((a, b) => a.at - b.at), workouts: workouts.filter((w) => w.startedAt < NOW), drinkEves };
}

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  async function open(vw, w) {
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
    await pg.goto(APP + '#insights/heart'); await pg.reload();
    await pg.waitForSelector('.hp[data-sec]');
    // the older weeks arrive after the first one: wait until the grid has its 30 mornings
    await pg.waitForFunction(() => /\d+ vs \d+ mornings/.test(document.querySelector('.hp')?.innerText ?? '') && (document.querySelector('.hp-morn')?.querySelectorAll('circle').length ?? 0) > 60, null, { timeout: 20000 }).catch(() => {});
    await pg.waitForTimeout(400);
    return { ctx, pg };
  }
  const noOverflow = (pg) => pg.evaluate(() => document.documentElement.scrollWidth);
  const w = world();
  const today = '2026-10-08';

  // ---- laptop
  let { ctx, pg } = await open(1280, w);
  const page = pg.locator('.hp');
  const kp = await pg.locator('.hp-kpis').innerText();
  check(`one day: today, resting ${w.rhr[today]} and HRV ${w.hrv[today]} from the band (${kp.replace(/\n/g, ' ')})`, /Today/.test(await pg.locator('.hp-day .sl-title').innerText()) && new RegExp(`Resting\\s*${w.rhr[today]}\\s*bpm`, 'i').test(kp) && new RegExp(`HRV\\s*${w.hrv[today]}\\s*ms`, 'i').test(kp));
  check(`one day: awake average against your usual so far, the workout left out (${(kp.match(/Awake average[\s\S]*?out/i) || [''])[0].replace(/\n/g, ' ')})`, /Awake average\s*\d+\s*bpm\s*[+−±]\d\.\d vs usual so far · workout left out/i.test(kp));
  check(`one day: time above / below your usual (${(kp.match(/Above your usual[\s\S]*$/i) || [''])[0].replace(/\n/g, ' ')})`, /Above your usual\s*\d+ h \d\d\s*of \d+ h \d\d awake · below \d+ h \d\d/i.test(kp));
  const day = pg.locator('.hp-chart svg');
  const lens = await day.evaluate((s) => [...s.querySelectorAll('path')].map((p) => [p.getAttribute('stroke'), p.getAttribute('fill'), (p.getAttribute('d') || '').length]));
  const drawn = (col, kind) => lens.filter(([st, fi]) => (kind === 'line' ? st : fi) === col).reduce((a, x) => a + x[2], 0);
  const belowMin = (() => { const m = kp.match(/below (\d+) h (\d\d)/i); return m ? +m[1] * 60 + +m[2] : -1; })();
  check(`one day: the line drawn red above, grey within, and blue exactly when the numbers say time below (${drawn('#f0806e', 'line')}/${drawn('#7aa3ea', 'line')}/${drawn('#c3cdd0', 'line')} chars; below ${belowMin} min)`,
    drawn('#f0806e', 'line') > 200 && drawn('#c3cdd0', 'line') > 500 && belowMin >= 0 && (drawn('#7aa3ea', 'line') > 0) === (belowMin > 0));
  const dt = await day.innerText().catch(async () => (await day.textContent()) ?? '');
  check(`one day: the workout named with its peak and the way back (${(dt.match(/Push day · peak[^\n]*?min/) || [''])[0]})`, /Push day · peak \d{3}back to usual in \d+ min/.test(dt));
  check(`one day: lowest asleep marked, "now 16:30", coffee and check-ins on top (${(dt.match(/lowest \d+ at \d\d:\d\d/) || [''])[0]})`, /lowest \d+ at 0\d:\d\d/.test(dt) && /now 16:30/.test(dt) && await day.locator('circle[fill="var(--caf)"]').count() === 2 && await day.locator('rect[stroke="#d55181"]').count() === 2);
  const box = await day.boundingBox();
  await pg.mouse.move(box.x + box.width * (14.5 / 24) * 0.96, box.y + 150); await pg.waitForTimeout(150);
  const tip = await pg.locator('.hp-tip').innerText().catch(() => '');
  check(`one day: pointing shows the time, bpm and your usual then (${tip.replace(/\n/g, ' ')})`, /^1[34]:\d\d · \d+ bpm\s*usual \d+–\d+$/.test(tip));
  await pg.mouse.move(0, 0);
  await pg.locator('.hp-day').screenshot({ path: OUT + 'heartpage-day-laptop.png' });
  await pg.getByRole('button', { name: 'The day before' }).first().click(); await pg.waitForTimeout(250);
  const y1 = await pg.locator('.hp-day .sl-title').innerText(), kp2 = await pg.locator('.hp-kpis').innerText();
  check(`‹ the day before: Wed 7 Oct, its own resting ${w.rhr['2026-10-07']}, no "so far" (${y1}; ${(kp2.match(/vs usual[^\n]*/) || [''])[0]})`, /Wed · 7 Oct/.test(y1) && new RegExp(`Resting\\s*${w.rhr['2026-10-07']}`, 'i').test(kp2) && !/so far/.test(kp2) && !(await day.textContent()).includes('now 16:30'));
  await pg.getByRole('button', { name: 'The day after' }).first().click(); await pg.waitForTimeout(200);
  check('› back to today, and › is off there', /Today/.test(await pg.locator('.hp-day .sl-title').innerText()) && await pg.getByRole('button', { name: 'The day after' }).first().isDisabled());

  // mornings
  const morn = pg.locator('.hp-morn');
  const dots = await morn.locator('circle[fill="#ef7d6d"]').count(), hdots = await morn.locator('circle[fill="#9fd7c7"]').count(), adots = await morn.locator('circle[fill="#c3cdd0"]').count();
  check(`mornings: a dot per morning for resting and HRV, awake for every finished day (${dots}/${hdots}/${adots})`, dots === 30 && hdots === 30 && adots >= 27 && adots <= 29);
  const dia = await morn.locator('svg path[fill="var(--alc)"]').count(), want = w.drinkEves.filter((d) => d >= '2026-09-08').length;
  check(`mornings: a drinks mark on each morning after a drink evening (${dia} marks, ${want} evenings in the 30 days)`, Math.abs(dia - want) <= 1 && dia >= 5);
  const mt = await morn.textContent();
  check(`mornings: last values labelled (${(mt.match(/\d+ bpm|\d+ ms/g) || []).join(', ')})`, mt.includes(`${w.rhr[today]} bpm`) && mt.includes(`${w.hrv[today]} ms`));
  await morn.screenshot({ path: OUT + 'heartpage-mornings-laptop.png' });
  // the grid
  const cell = (f, o) => pg.locator('.hp .sl-cell').evaluateAll((els, [f, o]) => { const e = els.find((x) => x.getAttribute('aria-label')?.startsWith(`${f} and ${o}:`)); return e ? [e.dataset.sure, e.dataset.toward, e.textContent] : null; }, [f, o]);
  const rc = await cell('Drinks that evening', 'Resting HR'), hc = await cell('Drinks that evening', 'HRV');
  check(`grid: drinks → next morning's resting HR, clear and toward a higher one (${rc})`, rc && rc[0] === 'clear' && rc[1] === 'worse' && /^\+\d/.test(rc[2]));
  check(`grid: drinks → next morning's HRV, clear and lower (${hc})`, hc && hc[0] === 'clear' && hc[1] === 'worse' && /^−\d/.test(hc[2]));
  const clears = await pg.locator('.hp .sl-cell[data-sure="clear"]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label').split(':')[0]));
  check(`grid: nothing else clear (${clears.join(' | ')})`, clears.length === 2 && clears.every((c) => c.startsWith('Drinks')));
  // after coffee / after a workout (lib/hrusual, unchanged)
  const he = await pg.locator('.hp .he-card').innerText();
  const hb = await pg.locator('.hp .he-card').boundingBox(), svgR = await pg.locator('.hp .he-card svg').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().right)));
  check(`after coffee / workout: both charts inside the card (card right ${Math.round(hb.x + hb.width)}, charts end ${svgR.join(', ')})`, svgR.length === 2 && svgR.every((r) => r <= hb.x + hb.width - 15));
  await pg.locator('.hp .he-card').screenshot({ path: OUT + 'heartpage-after-laptop.png' });
  check(`after coffee and after a workout still there (${(he.match(/\d+ coffees over[^\n]*/) || [''])[0].slice(0, 70)})`, /\d+ coffees over \d+ days/.test(he) && /\d+ workouts\./.test(he));
  // around a check-in
  const st = await pg.locator('.hp-st').innerText();
  const slope = +((st.match(/goes with ([+−]\d\.\d) bpm/) || [])[1] || 'x').replace('−', '-');
  check(`check-ins: the planted +0.8 bpm per point found, not the afternoon (${(st.match(/\d+ check-ins[^\n]*/) || [''])[0]})`, slope >= 0.5 && slope <= 1.1 && /How sure: (clear|likely)\./.test(st));
  await pg.locator('.hp-st').screenshot({ path: OUT + 'heartpage-checkins-laptop.png' });
  check(`laptop: nothing sticks out (${await noOverflow(pg)} px)`, await noOverflow(pg) <= 1280);
  await page.screenshot({ path: OUT + 'heartpage-laptop.png' });
  // a morning, tapped, opens that day on top
  await morn.scrollIntoViewIfNeeded(); await pg.waitForTimeout(100);
  const mb = await morn.locator('svg').boundingBox();
  // column 25 of 30 is 4 days before today
  await pg.mouse.click(mb.x + 8 + (mb.width - 56) * (25.5 / 30), mb.y + 60); await pg.waitForTimeout(250);
  check(`tapping a morning opens that day above (${await pg.locator('.hp-day .sl-title').innerText()})`, /Sun · 4 Oct/.test(await pg.locator('.hp-day .sl-title').innerText()));
  await ctx.close();

  // ---- phone
  ({ ctx, pg } = await open(390, w));
  check(`phone: nothing sticks out (${await noOverflow(pg)} px)`, await noOverflow(pg) <= 390);
  const kb = await pg.locator('.hp-kpis .kpi').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width)]; }));
  check(`phone: the four numbers two by two (${JSON.stringify(kb)})`, kb.length === 4 && kb[0][1] === kb[1][1] && kb[2][1] > kb[0][1] && kb.every((k) => k[2] >= 150));
  const ph = await pg.locator('.hp-chart svg').boundingBox();
  check(`phone: the day chart fits and is tall enough (${Math.round(ph.width)}×${Math.round(ph.height)})`, ph.width <= 390 && ph.height >= 250);
  await pg.locator('.hp-day').screenshot({ path: OUT + 'heartpage-day-phone.png' });
  await pg.locator('.hp-morn').screenshot({ path: OUT + 'heartpage-mornings-phone.png' });
  const gridBox = await pg.locator('.hp .sl-c').boundingBox();
  check(`phone: the grid's three columns fit (${Math.round(gridBox.width)} px)`, gridBox.width <= 390 && await pg.locator('.hp .sl-mh').count() === 3);
  await pg.locator('.hp .sl-c').screenshot({ path: OUT + 'heartpage-grid-phone.png' });
  await pg.locator('.hp-st').screenshot({ path: OUT + 'heartpage-checkins-phone.png' });
  await pg.locator('.hp').screenshot({ path: OUT + 'heartpage-phone.png' });
  const pm = pg.locator('.hp-morn svg'); await pm.scrollIntoViewIfNeeded(); const pb = await pm.boundingBox();
  await pg.touchscreen.tap(pb.x + 8 + (pb.width - 56) * (25.5 / 30), pb.y + 60); await pg.waitForTimeout(250);
  check(`phone: a tap on a morning opens that day (${await pg.locator('.hp-day .sl-title').innerText()})`, /Sun · 4 Oct/.test(await pg.locator('.hp-day .sl-title').innerText()));
  await ctx.close();

  // ---- a band that reads every 15 minutes still draws the day
  const sparse = world({ seed: 8, everyMin: 15 });
  ({ ctx, pg } = await open(1280, sparse));
  const sl = await pg.locator('.hp-chart svg').evaluate((s) => [...s.querySelectorAll('path')].filter((p) => ['#f0806e', '#7aa3ea', '#c3cdd0'].includes(p.getAttribute('stroke'))).reduce((a, p) => a + (p.getAttribute('d') || '').length, 0));
  check(`readings 15 min apart: the day's line is still drawn (${sl} chars)`, sl > 1000);
  await pg.locator('.hp-day').screenshot({ path: OUT + 'heartpage-sparse.png' });
  await ctx.close();

  console.log('errors:', JSON.stringify(errs));
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
