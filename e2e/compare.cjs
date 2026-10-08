// Timeline → Compare (canvas board "Compare", owner's pick 8 Oct). Fake world, 21 days: coffee most mornings and
// some afternoons; heart rate climbs after waking whatever you drink, plus 3.5 bpm per 100 mg of caffeine in the
// body 40 minutes earlier (planted). Check-ins with nothing planted. Compare must find the caffeine one at about
// the right size and delay, and must NOT call the mood one clear. Laptop and phone.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

const MIN = 60_000;
const NOW = new Date('2026-10-08T16:30:00').getTime();
function rng(seed) {
  let s = seed >>> 0;
  const r = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { r, g: () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()) };
}
function world({ days, perMg = 0.035, seed = 7 }) {
  const { r, g } = rng(seed), hr = [], doses = [], meals = [], checks = [], workouts = [];
  const base = (md) => md < 390 ? 56 : md < 510 ? 56 + ((md - 390) / 120) * 14 : md < 1320 ? 70 + 2 * Math.sin((md - 510) / 180) : md < 1410 ? 70 - ((md - 1320) / 90) * 14 : 56;
  const caf = (t) => doses.reduce((s, at) => s + (t >= at ? 95 * Math.pow(0.5, (t - at) / MIN / 300) : 0), 0);
  for (let k = days - 1; k >= 0; k--) {
    const mid = new Date(2026, 9, 8 - k).getTime();
    if (r() < 0.8) doses.push(mid + (450 + Math.floor(r() * 120)) * MIN);
    if (r() < 0.5) doses.push(mid + (780 + Math.floor(r() * 150)) * MIN);
    meals.push(mid + 12.5 * 3600_000);
    [9.5, 14, 20].forEach((h) => { if (mid + h * 3600_000 < NOW) checks.push({ at: mid + h * 3600_000, mood: Math.max(1, Math.min(10, Math.round(6 + g() * 1.5))) }); });
    if (k === 1) workouts.push({ id: 'w1', template: 'Push day', startedAt: mid + 17 * 3600_000, endedAt: mid + 18 * 3600_000 });
  }
  let slow = 0;
  for (let k = days - 1; k >= 0; k--) {
    const mid = new Date(2026, 9, 8 - k).getTime(), off = g() * 2;
    for (let md = 0; md < 1440; md++) {
      const t = mid + md * MIN; if (t > NOW - 2 * MIN) break;
      if (md % 30 === 0) slow = 0.8 * slow + g() * 1.2;
      let v = base(md) + off + slow + g() * 2.5 + perMg * caf(t - 40 * MIN);
      for (const w of workouts) if (t >= w.startedAt && t < w.endedAt) v = 130 + g() * 6;
      const a = Math.round(v); hr.push([t, a, a - 3, a + 4]);
    }
  }
  return { hr, doses, meals, checks, workouts };
}

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  async function open(vw, w, hash, timezoneId) {
    const ctx = await b.newContext({ viewport: { width: vw, height: 900 }, deviceScaleFactor: 2, isMobile: vw < 500, hasTouch: vw < 500, ...(timezoneId ? { timezoneId } : {}) });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    await ctx.route(/\/api\/band\//, (rt) => {
      const u = new URL(rt.request().url()), op = u.pathname.split('/').pop();
      const st = { connected: true, needsReconnect: false, connectedAt: NOW - 30 * 86_400_000, lastSync: NOW - 3 * MIN, latest: w.hr.at(-1)[0], error: null, gapSec: 60 };
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
    await pg.evaluate((w) => { const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k) || '{}');
      s.entries = [
        ...w.doses.map((at, i) => ({ id: 'c' + i, kind: 'drink', at, name: 'Coffee', ml: 250, caffeineMg: 95, alcoholG: 0, kcal: 2 })),
        ...w.meals.map((at, i) => ({ id: 'm' + i, kind: 'food', at, name: 'Lunch', grams: 400, macros: { kcal: 700, p: 40, c: 80, f: 22 } })),
        ...w.checks.map((c, i) => ({ id: 'f' + i, kind: 'feel', at: c.at, mood: c.mood })),
      ].sort((a, b) => a.at - b.at);
      s.workouts = w.workouts; localStorage.setItem(k, JSON.stringify(s)); }, w);
    await pg.goto(APP + hash); await pg.reload();
    return { ctx, pg };
  }
  const settled = (pg) => pg.waitForFunction(() => { const s = document.querySelector('.cmp')?.getAttribute('data-sure'); return s && s !== 'working'; }, null, { timeout: 15000 });
  const attrs = (pg) => pg.locator('.cmp').evaluate((e) => ({ sure: e.dataset.sure, best: +e.dataset.best, slope: +e.dataset.slope, span: (e.dataset.span || '').split('-').map(Number), days: +e.dataset.days }));

  const w = world({ days: 21 });
  // ---- laptop
  let { ctx, pg } = await open(1280, w, '#insights/timeline'), laptop;
  await pg.waitForSelector('.master');
  await pg.getByRole('button', { name: 'Compare', exact: true }).click();
  await pg.waitForSelector('.cmp'); await settled(pg);
  check('Compare opens from the Timeline page, and the address says so', /#insights\/timeline\/compare$/.test(pg.url()) && await pg.locator('.master').count() === 0);
  // Heart rate needs 14 days of band data; the first load brings a week, so wait for the older weeks to arrive.
  await pg.waitForFunction(() => +document.querySelector('.cmp')?.dataset.days >= 13 && document.querySelector('.cmp')?.dataset.sure !== 'working', null, { timeout: 15000 }).catch(() => {});
  await pg.waitForTimeout(300);
  let a = await attrs(pg);
  // 14 days of this world is on the edge (unit calibration: clear about 5 times in 6) — found means clear or likely.
  check(`caffeine → heart rate, 14 days: the planted effect found (${a.sure}, ${a.days} days)`, /^(clear|likely)$/.test(a.sure) && a.days >= 13);
  laptop = a;
  check(`…at about the right delay: strongest ${a.best} min, likely ${a.span.join('–')} min, planted 40`, a.best >= 20 && a.best <= 70 && a.span[0] <= 40 && a.span[1] >= 40);
  check(`…and about the right size: ${a.slope} bpm per 100 mg, planted 3.5`, a.slope >= 2 && a.slope <= 5);
  const say = await pg.locator('.cmp-say').innerText();
  check(`words: "goes with", how much later, how sure (${(say.match(/More caffeine[^\n]+/) || [''])[0].slice(0, 120)}…)`, /More caffeine in your body goes with higher heart rate about \d+ min later \(likely somewhere \d+–\d+ min\): about \+\d\.\d bpm per 100 mg\./.test(say) && /How sure: (clear|likely)\./.test(say) && !/cause[sd]? /.test(say.replace('proof of cause', '')));
  check('three charts drawn: aligned, scatter with band averages, delay with the chance band', await pg.locator('.cmp-al svg').count() === 1 && await pg.locator('.cmp-sc svg circle').count() >= 3 && await pg.locator('.cmp-lg svg path').count() >= 2);
  check('the aligned chart marks the workout as left out', /workout · left out/.test(await pg.locator('.cmp-al').innerText()));
  const gl = await pg.locator('.cmp-grid').evaluate((e) => [...e.children].map((c) => { const r = c.getBoundingClientRect(); return [c.className.split(' ')[1], Math.round(r.x), Math.round(r.y), Math.round(r.width)]; }));
  const pos = Object.fromEntries(gl.map(([k, x, y, wd]) => [k, { x, y, wd }]));
  check(`laptop layout: aligned left, scatter and delay stacked right, the words below (${JSON.stringify(gl)})`, pos['cmp-sc'].x > pos['cmp-al'].x + 200 && pos['cmp-lg'].y > pos['cmp-sc'].y && pos['cmp-say'].y > pos['cmp-lg'].y);
  await pg.locator('.cmp').screenshot({ path: OUT + 'compare-laptop.png' });
  // Nothing planted: mood against caffeine must not come up clear.
  await pg.getByLabel('With this, later').selectOption('mood'); await settled(pg); a = await attrs(pg);
  const say2 = await pg.locator('.cmp-say').innerText();
  check(`caffeine → mood (nothing planted): not clear (${a.sure}) — "${(say2.split('\n').find((l) => /clear|Not enough|goes with/.test(l)) || '').slice(0, 90)}…"`, a.sure !== 'clear' && a.sure !== 'working');
  await pg.locator('.cmp').screenshot({ path: OUT + 'compare-mood.png' });
  // No alcohol logged: says so instead of drawing nothing.
  await pg.getByLabel('Compare this').selectOption('alc'); await settled(pg);
  check('alcohol with none logged: says how to start', (await attrs(pg)).sure === 'empty' && /No alcohol logged in these 14 days\. Log a drink/.test(await pg.locator('.cmp').innerText()));
  await pg.getByLabel('Compare this').selectOption('caf'); await pg.getByLabel('With this, later').selectOption('hr');
  await pg.getByRole('button', { name: '30D', exact: true }).click(); await settled(pg);
  await pg.waitForFunction(() => +document.querySelector('.cmp')?.dataset.days >= 20, null, { timeout: 15000 }).catch(() => {}); a = await attrs(pg);
  check(`30 days: uses every day there is (${a.days}), still clear`, a.days >= 20 && a.sure === 'clear');
  // Straight from the address; Read goes back to the panes.
  await pg.goto(APP + '#insights/timeline/compare'); await pg.reload(); await pg.waitForSelector('.cmp');
  check('the address opens Compare directly', await pg.locator('.cmp').count() === 1 && await pg.getByRole('button', { name: 'Compare', exact: true }).getAttribute('aria-pressed') === 'true');
  await pg.getByRole('button', { name: 'Read', exact: true }).click(); await pg.waitForSelector('.master');
  check('Read goes back to the panes', await pg.locator('.cmp').count() === 0 && /#insights\/timeline$/.test(pg.url()));
  await ctx.close();

  // ---- phone
  ({ ctx, pg } = await open(390, w, '#insights/timeline/compare'));
  await pg.waitForSelector('.cmp'); await settled(pg);
  await pg.waitForFunction(() => +document.querySelector('.cmp')?.dataset.days >= 13 && document.querySelector('.cmp')?.dataset.sure !== 'working', null, { timeout: 15000 }).catch(() => {});
  await pg.waitForTimeout(300); a = await attrs(pg);
  // Opened straight from a link, before the band's data is in: it still lands on heart rate, not mood.
  check(`phone: opened from a link, heart rate is picked once the band's data arrives (${await pg.getByLabel('With this, later').inputValue()})`, await pg.getByLabel('With this, later').inputValue() === 'hr');
  check(`phone: the same answer as the laptop (${a.sure}, ${a.best} min, ${a.slope} per 100 mg)`, a.sure === laptop.sure && a.best === laptop.best && a.slope === laptop.slope);
  const ph = await pg.locator('.cmp-grid').evaluate((e) => [...e.children].map((c) => { const r = c.getBoundingClientRect(); return [c.className.split(' ')[1], Math.round(r.y), Math.round(r.right)]; }));
  const ys = Object.fromEntries(ph.map(([k, y]) => [k, y]));
  check(`phone: the words first, then aligned, scatter, delay (${JSON.stringify(ph)})`, ys['cmp-say'] < ys['cmp-al'] && ys['cmp-al'] < ys['cmp-sc'] && ys['cmp-sc'] < ys['cmp-lg'] && ph.every(([, , r]) => r <= 390));
  const sw = await pg.evaluate(() => document.documentElement.scrollWidth);
  check(`phone: nothing wider than the screen (${sw})`, sw <= 390);
  const sel = await pg.getByLabel('Compare this').boundingBox();
  check(`phone: the pickers are big enough to tap (${Math.round(sel.height)} px)`, sel.height >= 32);
  await pg.locator('.cmp').screenshot({ path: OUT + 'compare-phone.png' });
  await ctx.close();

  // ---- Budapest: the clock on the axis is the local one (midnight shows as the day, then 06:00, 12:00, 18:00).
  ({ ctx, pg } = await open(1280, w, '#insights/timeline/compare', 'Europe/Budapest'));
  await pg.waitForSelector('.cmp-al svg'); await settled(pg);
  const ticks = await pg.locator('.cmp-al svg text.he-t').allTextContents();
  const times = ticks.filter((t) => /^\d\d:\d\d$|^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/.test(t));
  check(`Budapest: time ticks on the local clock (${times.join(' ')})`, times.length >= 6 && times.every((t) => /^(06|12|18):00$|^[A-Z][a-z]{2}$/.test(t)) && times.some((t) => /^[A-Z]/.test(t)));
  await ctx.close();

  console.log('errors: ' + JSON.stringify(errs));
  await b.close();
})().catch((e) => { console.log('CRASH ' + e.message); process.exit(1); });
