// The heart-rate lane, owner's pick on the canvas (8 Oct): A — against your usual for the hour (band,
// red above / blue below, zoomed scale) — and B — a labelled window after each coffee and workout. Fake band
// data: 15 days of minutes shaped like a real day, coffees with +7 bpm planted, two workouts. Laptop and phone.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

const MIN = 60_000;
const NOW = new Date('2026-10-08T16:30:00').getTime();
function rng(seed) {
  let s = seed >>> 0;
  const r = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { r, g: () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()) };
}
/** Minutes for `days` days up to NOW, every `everyMin` minutes; coffees (+7 bpm planted) and workouts. */
function world({ days, everyMin = 1, seed = 1 }) {
  const { r, g } = rng(seed), hr = [], doses = [], workouts = [];
  const base = (md) => md < 390 ? 56 : md < 510 ? 56 + ((md - 390) / 120) * 14 : md < 1320 ? 70 + 2 * Math.sin((md - 510) / 180) : md < 1410 ? 70 - ((md - 1320) / 90) * 14 : 56;
  for (let k = days - 1; k >= 0; k--) {
    const mid = new Date(2026, 9, 8 - k).getTime(), off = g() * 2;
    const cups = k === 0 ? [8 * 60 + 10, 13 * 60 + 40] : r() < 0.6 ? [450 + Math.floor(r() * 120)] : [];
    cups.forEach((m) => doses.push(mid + m * MIN));
    if (k === 1) workouts.push({ id: 'w1', template: 'Push day', startedAt: mid + 17 * 3600_000, endedAt: mid + 18 * 3600_000 + 5 * MIN });
    if (k === 0) workouts.push({ id: 'w0', template: 'Pull day', startedAt: mid + 11 * 3600_000, endedAt: mid + 11 * 3600_000 + 50 * MIN });
    for (let md = 0; md < 1440; md += everyMin) {
      const t = mid + md * MIN; if (t > NOW - 2 * MIN) break;
      let v = base(md) + off + g() * 2;
      for (const c of doses) if (t > c && t - c < 4 * 3600_000) { const x = (t - c) / MIN; v += 7 * (x / 45) * Math.exp(1 - x / 45); }
      for (const w of workouts) { if (t >= w.startedAt && t < w.endedAt) v = 132 + g() * 6 + 8 * Math.sin((t - w.startedAt) / 600_000); if (t >= w.endedAt) v += (128 - base(md)) * Math.exp(-((t - w.endedAt) / MIN) / 13) * (t - w.endedAt < 3 * 3600_000 ? 1 : 0); }
      const a = Math.round(v); hr.push([t, a, a - 3, a + 4]);
    }
  }
  return { hr, doses, workouts };
}

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };

  async function open(vw, w) {
    const ctx = await b.newContext({ viewport: { width: vw, height: 900 }, deviceScaleFactor: 2, isMobile: vw < 500, hasTouch: vw < 500 });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    await ctx.route(/\/api\/band\//, (rt) => {
      const u = new URL(rt.request().url()), op = u.pathname.split('/').pop();
      const st = { connected: true, needsReconnect: false, connectedAt: NOW - 20 * 86_400_000, lastSync: NOW - 3 * MIN, latest: w.hr.at(-1)[0], error: null, gapSec: 5 };
      const body = op === 'data' ? { hr: w.hr.filter((m) => m[0] >= +u.searchParams.get('from') && m[0] <= +u.searchParams.get('to')), sleep: [], rhr: {}, hrv: {}, ...st } : st;
      rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    const pg = await ctx.newPage();
    await pg.clock.install({ time: NOW });
    pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
    await pg.goto(APP);
    await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
    await pg.evaluate(([doses, workouts]) => { const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k) || '{}');
      s.entries = doses.map((at, i) => ({ id: 'c' + i, kind: 'drink', at, name: 'Coffee', ml: 250, caffeineMg: 95, alcoholG: 0, kcal: 2 }));
      s.workouts = workouts; localStorage.setItem(k, JSON.stringify(s)); }, [w.doses, w.workouts]);
    await pg.goto(APP + '#insights/timeline'); await pg.reload(); await pg.waitForSelector('.master');
    await pg.waitForFunction(() => /usual|learning/.test(document.querySelector('.mg-canvas')?.getAttribute('data-hr') ?? ''), null, { timeout: 8000 }).catch(() => {});
    await pg.waitForTimeout(400);
    return { ctx, pg };
  }
  const geom = async (pg) => {
    const cv = pg.locator('.mg-canvas');
    const [t0, t1] = (await cv.getAttribute('data-view')).split(',').map(Number), [L, R] = (await cv.getAttribute('data-plot')).split(',').map(Number);
    const [state, nc, ng, top, h, range] = (await cv.getAttribute('data-hr')).split(',');
    const [lo, hi] = (range || '').split('-').map(Number);
    const box = await cv.boundingBox();
    return { cv, t0, t1, L, R, state, nc: +nc, ng: +ng, top: +top, h: +h, lo, hi, box, xOf: (t) => box.x + L + ((t - t0) / (t1 - t0)) * (box.width - L - R) };
  };
  /** Pixels in the lane by colour family (canvas pixels, devicePixelRatio 2). */
  const colours = (pg, top, h) => pg.locator('.mg-canvas').evaluate((el, [top, h]) => {
    const d = el.getContext('2d').getImageData(0, top * 2, el.width, h * 2).data; let red = 0, blue = 0, grey = 0;
    for (let i = 0; i < d.length; i += 4) {
      const [r, g, b, a] = [d[i], d[i + 1], d[i + 2], d[i + 3]]; if (a < 200) continue;
      if (r > 200 && g > 100 && g < 150 && b > 90 && b < 130) red++;
      else if (b > 190 && r > 70 && r < 120 && g > 130 && g < 175) blue++;
      else if (Math.abs(r - 0x93) < 10 && Math.abs(g - 0xa0) < 10 && Math.abs(b - 0xa4) < 10) grey++;
    }
    return { red, blue, grey };
  }, [top, h]);
  const at = (h, m = 0) => new Date(2026, 9, 8, h, m).getTime();

  // ---- laptop
  const w = world({ days: 15 });
  let { ctx, pg } = await open(1280, w);
  let g = await geom(pg);
  check(`laptop: lane knows your usual (${g.state}), ${g.h} px tall`, g.state === 'usual' && g.h >= 130);
  const ro = await pg.locator('.readout').innerText();
  check(`readout at now: heart rate against your usual (${(ro.match(/Heart rate\s*(.+)/) || [])[1]})`, /Heart rate\s*\d+ bpm · [+−]\d+ vs usual \d+/.test(ro));
  await pg.getByRole('button', { name: '1D', exact: true }).click(); await pg.waitForTimeout(300);
  g = await geom(pg);
  check(`one day in view: today's 2 coffees and the workout windows (${g.nc} coffee, ${g.ng} workout)`, g.nc >= 2 && g.ng >= 1);
  await pg.mouse.move(g.xOf(at(14, 30)), g.box.y + g.top + 40); await pg.waitForTimeout(150);
  let r2 = await pg.locator('.readout').innerText();
  const delta = +((r2.match(/After coffee\s*13:40 · ([+−]\d+) bpm vs usual/) || [])[1] || 'x').replace('−', '-');
  check(`pointing after the 13:40 coffee: "+N bpm vs usual", N near the planted 7 (${(r2.match(/After coffee\s*(.+)/) || [])[1]})`, delta >= 3 && delta <= 12 && /peak \d\d:\d\d/.test(r2));
  await pg.mouse.move(g.xOf(at(11, 20)), g.box.y + g.top + 40); await pg.waitForTimeout(150);
  r2 = await pg.locator('.readout').innerText();
  check(`pointing in the workout: name, peak, average, back in N min (${(r2.match(/Workout\s*(.+)/) || [])[1]})`, /Workout\s*Pull day · peak \d+ · avg \d+ · back in \d+ min/.test(r2) && (r2.match(/^Workout/gm) || []).length === 1);
  await pg.mouse.move(0, 0); await pg.waitForTimeout(150);
  const c1 = await colours(pg, g.top, g.h);
  check(`drawn: grey inside your usual, red above it (after coffee, the workout) (${JSON.stringify(c1)})`, c1.red > 300 && c1.grey > 300);
  await pg.screenshot({ path: OUT + 'heart-laptop.png', clip: { x: g.box.x, y: g.box.y + g.top - 30, width: g.box.width, height: g.h + 40 } });
  // Owner, 8 Oct: the scale fits what's on screen, like TradingView — a workout in view is the new top;
  // zoomed into a calm stretch, 60–80 fills the lane.
  check(`fit: with the workout in view the top reaches its peak (${g.lo}–${g.hi})`, g.hi >= 140);
  for (let k = 0; k < 4; k++) await pg.getByRole('button', { name: 'Zoom in' }).click();
  await pg.waitForTimeout(200); g = await geom(pg);
  check(`fit: zoomed into the early morning (${Math.round((g.t1 - g.t0) / 3600_000 * 10) / 10} h), the scale closes in (${g.lo}–${g.hi})`, g.hi <= 100 && g.hi - g.lo <= 40);
  await pg.screenshot({ path: OUT + 'heart-fit-zoomed.png', clip: { x: g.box.x, y: g.box.y + g.top - 30, width: g.box.width, height: g.h + 40 } });
  await pg.getByRole('button', { name: '1D', exact: true }).click();
  await pg.getByRole('button', { name: 'Log', exact: true }).click(); await pg.waitForTimeout(200); g = await geom(pg);
  check('log scale: switches, line still drawn', await pg.locator('.master').getAttribute('data-scale') === 'log' && (await colours(pg, g.top, g.h)).red > 300);
  await pg.screenshot({ path: OUT + 'heart-log.png', clip: { x: g.box.x, y: g.box.y + g.top - 30, width: g.box.width, height: g.h + 40 } });
  await pg.getByRole('button', { name: 'Fit', exact: true }).click();
  // Full screen.
  await pg.getByRole('button', { name: '⤢ Full screen' }).first().click(); await pg.waitForTimeout(300); g = await geom(pg);
  const mb = await pg.locator('.master').boundingBox();
  check(`full screen: covers the window, heart rate ~half of it (${Math.round(mb.width)}×${Math.round(mb.height)}, lane ${g.h} px)`, mb.x === 0 && mb.y === 0 && mb.width >= 1270 && mb.height >= 890 && g.h >= 0.4 * 900 - 2);
  await pg.screenshot({ path: OUT + 'heart-big-laptop.png' });
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(200);
  check('full screen: Esc closes it', !(await pg.locator('.master').getAttribute('class')).includes('big'));
  // C: after every coffee, after a workout.
  await pg.goto(APP + '#insights/heart'); await pg.waitForTimeout(600);
  const card = pg.locator('#ins-heart');
  check('the Heart page is in the sidebar and shows the card', await pg.locator('.secbar button', { hasText: 'Heart' }).count() === 1 && await card.isVisible());
  const ct = await card.innerText();
  const nCof = +((ct.match(/(\d+) coffees over/) || [])[1] || 0);
  check(`card: the planted coffee effect found, in "goes with" words (${(ct.match(/\d+ coffees over[^\n]+/) || [])[0]})`, nCof >= 8 && /Coffee goes with \+\d\.\d bpm 30–90 min after, against the same hours on days without\. How sure: (clear|likely)\./.test(ct));
  check(`card: workouts and the way back down (${(ct.match(/\d workouts?\.[^\n]+/) || [])[0]})`, /2 workouts\. Back to your usual in \d+ min on average\./.test(ct));
  check('card: both charts drawn, the coffee one with a line per coffee', await card.locator('svg').count() === 2 && await card.locator('svg').first().locator('path').count() >= nCof + 1);
  await card.screenshot({ path: OUT + 'heart-card-laptop.png' });
  await card.getByRole('button', { name: '⤢ Full screen' }).click(); await pg.waitForTimeout(300);
  const hb = await pg.locator('.he-card').boundingBox(), sh = await pg.locator('.he-card svg').first().evaluate((e) => e.getBoundingClientRect().height);
  check(`card full screen: covers the window, charts tall (${Math.round(hb.width)}×${Math.round(hb.height)}, chart ${Math.round(sh)} px)`, hb.x === 0 && hb.y === 0 && hb.width >= 1270 && sh >= 400);
  await pg.screenshot({ path: OUT + 'heart-card-big.png' });
  await pg.getByRole('button', { name: '✕ Close' }).click(); await pg.waitForTimeout(200);
  await ctx.close();

  // ---- phone
  ({ ctx, pg } = await open(390, w));
  g = await geom(pg);
  check(`phone: opens on one day once the band is in (${Math.round((g.t1 - g.t0) / 3600_000)} h)`, Math.abs((g.t1 - g.t0) - 86_400_000) < 60_000);
  check(`phone: the lane is big enough to read (${g.h} px) and nothing sticks out (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, g.h >= 110 && await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
  const c2 = await colours(pg, g.top, g.h);
  check(`phone: the line is there, red and grey (${JSON.stringify(c2)})`, c2.red > 150 && c2.grey > 150);
  await pg.locator('.mg-canvas').evaluate((el) => { el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -120); }); await pg.waitForTimeout(150);
  g = await geom(pg);
  await pg.screenshot({ path: OUT + 'heart-phone.png', clip: { x: 0, y: Math.max(0, g.box.y + g.top - 30), width: 390, height: g.h + 40 } });
  await pg.getByRole('button', { name: '⤢ Full screen' }).first().click(); await pg.waitForTimeout(400); g = await geom(pg);
  const cvb = await pg.locator('.mg-canvas').boundingBox(), side = await pg.locator('.mg-side').boundingBox();
  check(`phone full screen: heart rate lane ${g.h} px, chart full width (${Math.round(cvb.width)} px), side panel below it, nothing sticks out`, g.h >= 240 && cvb.width >= 380 && side.y >= cvb.y + cvb.height - 1 && await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
  await pg.screenshot({ path: OUT + 'heart-big-phone.png' });
  await pg.getByRole('button', { name: '✕ Close' }).click(); await pg.waitForTimeout(200);
  await pg.goto(APP + '#insights/heart'); await pg.waitForTimeout(600);
  const pc = pg.locator('#ins-heart .he-card');
  check(`phone: a Heart tab, the card fits (${Math.round((await pc.boundingBox())?.width ?? 0)} px, page ${await pg.evaluate(() => document.documentElement.scrollWidth)})`, await pc.isVisible() && (await pc.boundingBox()).width <= 390 && await pg.evaluate(() => document.documentElement.scrollWidth) <= 390 && !(await pg.locator('.master').isVisible()));
  await pc.screenshot({ path: OUT + 'heart-card-phone.png' });
  await ctx.close();

  // ---- a new band: two days, no usual yet
  const fresh = world({ days: 2, seed: 2 });
  ({ ctx, pg } = await open(1280, fresh));
  g = await geom(pg);
  const ro3 = await pg.locator('.readout').innerText();
  check(`new band: "learning", heart rate without a made-up usual (${g.state}; ${(ro3.match(/Heart rate\s*(.+)/) || [])[1]})`, g.state === 'learning' && /Heart rate\s*\d+ bpm\s*$/m.test(ro3));
  await pg.getByRole('button', { name: '1D', exact: true }).click(); await pg.waitForTimeout(300); g = await geom(pg);
  await pg.mouse.move(g.xOf(at(14, 30)), g.box.y + g.top + 40); await pg.waitForTimeout(150);
  check(`new band: coffee window measured against the half hour before (${((await pg.locator('.readout').innerText()).match(/After coffee\s*(.+)/) || [])[1]})`, /After coffee\s*13:40 · [+−]\d+ bpm vs the half hour before/.test(await pg.locator('.readout').innerText()));
  await pg.mouse.move(0, 0); await pg.waitForTimeout(100);
  await pg.screenshot({ path: OUT + 'heart-learning.png', clip: { x: g.box.x, y: g.box.y + g.top - 30, width: g.box.width, height: g.h + 40 } });
  const ct2 = await pg.locator('#ins-heart').innerText();
  check(`new band: the card says it's too early, no verdict (${(ct2.match(/(No coffee|\d+ coffees?)[^\n]+/) || [])[0]})`, /Still checking|No coffee to measure yet/.test(ct2) && !/How sure/.test(ct2));
  await ctx.close();

  // ---- a band that only sends every 15 minutes still draws a line
  const sparse = world({ days: 3, everyMin: 15, seed: 3 });
  ({ ctx, pg } = await open(1280, sparse));
  await pg.getByRole('button', { name: '1D', exact: true }).click(); await pg.waitForTimeout(300); g = await geom(pg);
  const c3 = await colours(pg, g.top, g.h);
  check(`readings 15 min apart: still a visible line (${c3.red} red pixels)`, c3.red > 400);
  await pg.screenshot({ path: OUT + 'heart-sparse.png', clip: { x: g.box.x, y: g.box.y + g.top - 30, width: g.box.width, height: g.h + 40 } });
  await ctx.close();

  console.log('errors:', JSON.stringify(errs));
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
