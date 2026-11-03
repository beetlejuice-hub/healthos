// Asking harder and the new signals (PLAN 188 phases 3–4; owner, 3 Nov: "do 1 and 2").
// 1. "Nearly sure?": 40 days, Saffron taken on all but 4, mood planted 1.5 lower the day after taking it. Too few days
//    without to be sure: For you says so, with the numbers so far and what would settle it, and "Try 7 days without"
//    starts that experiment (the ask goes). Control, the same world afresh: "Not now" rests it two weeks.
// 2. The weather: Open-Meteo faked for Budapest (the time zone's city); mood planted 1.5 lower on rainy days. Noticed on
//    Insights finds it ("On rainy days, your mood is … lower"); control — Open-Meteo unreachable — nothing about rain,
//    and no errors.
const { chromium, APP, OUT, handle, forYou } = require('./harness.cjs');

const NOW = new Date('2026-11-03T10:00:00').getTime(), D = 864e5, KEY = 'healthos.v1:u-test';
const ymd = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

async function open(b, write, { weather = null } = {}) {
  const errs = [], asked = [];
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: 'Europe/Budapest' });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  await ctx.route('**/api/ai**', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' }));
  await ctx.route('https://api.open-meteo.com/**', (r) => { asked.push(r.request().url()); return weather ? r.fulfill({ contentType: 'application/json', body: JSON.stringify(weather) }) : r.abort(); });
  const pg = await ctx.newPage();
  await pg.clock.install({ time: NOW });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource|500|ERR_FAILED/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  for (let k = 0; k < 3; k++) {
    await pg.waitForLoadState('networkidle');
    await pg.evaluate(write, [KEY, NOW, D]);
    await pg.reload(); await pg.waitForLoadState('networkidle'); await pg.waitForTimeout(200);
    if ((await pg.evaluate((k) => (JSON.parse(localStorage.getItem(k)).entries || []).length, KEY)) > 20) break;
  }
  return { ctx, pg, errs, asked };
}

const saffronWorld = ([k, now, D]) => {
  const s = JSON.parse(localStorage.getItem(k) || '{}'); let seed = 7; const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  s.workouts = []; s.supplements = [{ id: 'saf', name: 'Saffron', dose: '30 mg', slot: 'morning', at: 480, active: true }]; s.entries = []; s.ai = { ...(s.ai || {}), experiments: [], settleRest: {}, digest: null, night: null };
  let took = false;
  for (let i = 40; i >= 1; i--) {
    const day0 = new Date(new Date(now - i * D).setHours(0, 0, 0, 0)).getTime();
    s.entries.push({ id: 'f' + i, kind: 'feel', at: day0 + 20 * 36e5, mood: Math.max(1, Math.min(10, Math.round(7 + (r() - 0.5) * 2 - (took ? 1.5 : 0)))), energy: 6 });
    took = ![30, 22, 14, 6].includes(i);
    if (took) s.entries.push({ id: 's' + i, kind: 'supp', at: day0 + 8 * 36e5, suppId: 'saf', status: 'taken' });
  }
  localStorage.setItem(k, JSON.stringify(s));
};

(async () => {
  const b = await chromium.launch();
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };

  // 1. Nearly sure?
  let { ctx, pg, errs } = await open(b, saffronWorld);
  await pg.goto(APP + '#today'); await pg.waitForSelector('#feel');
  const found = await forYou(pg, 'settle');
  const card = pg.locator('.fy-item[data-current] .settle'), t = (await card.innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(`For you: "Nearly sure?" — Saffron → mood, the numbers so far, what would settle it (${t.slice(0, 220)})`, found && /^NEARLY SURE\? early · could be chance Saffron → mood So far your mood is lower with it: \d\.\d on \d+ days with, \d\.\d on 4 without\. About \d+ more days skipping Saffron would settle it\./i.test(t));
  check(`…and offers the try: leave it out 7 days (${(await card.locator('button').allInnerTexts()).join(' | ')})`, (await card.locator('button').allInnerTexts()).join('|') === 'Try 7 days without|Not now');
  check(`390: fits (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
  await card.screenshot({ path: OUT + 'settle.png' });
  await card.getByRole('button', { name: 'Try 7 days without' }).click(); await pg.waitForTimeout(300);
  const xs = await pg.evaluate((k) => JSON.parse(localStorage.getItem(k)).ai.experiments, KEY);
  check(`"Try": the experiment starts — 7 days, measured on mood (${JSON.stringify(xs.map((x) => [x.name, x.days, x.measure]))})`, xs.length === 1 && xs[0].name === 'No saffron for 7 days' && xs[0].days === 7 && xs[0].measure === 'mood');
  check('…and the ask goes', await pg.locator('.settle').count() === 0);
  console.log('errors: ' + JSON.stringify(errs)); check('no page errors', errs.length === 0);
  await ctx.close();
  ({ ctx, pg, errs } = await open(b, saffronWorld));
  await pg.goto(APP + '#today'); await pg.waitForSelector('#feel'); await forYou(pg, 'settle');
  await pg.locator('.fy-item[data-current] .settle').getByRole('button', { name: 'Not now' }).click(); await pg.waitForTimeout(300);
  const rest = await pg.evaluate((k) => JSON.parse(localStorage.getItem(k)).ai.settleRest, KEY);
  check(`control: "Not now" rests it two weeks, no experiment (${JSON.stringify(rest)})`, rest['supp-saf:mood'] === '2026-11-17' && await pg.locator('.settle').count() === 0 && (await pg.evaluate((k) => JSON.parse(localStorage.getItem(k)).ai.experiments.length, KEY)) === 0);
  await ctx.close();

  // 2. the weather
  const days = Array.from({ length: 93 }, (_, i) => ymd(NOW - (92 - i) * D)), rainy = new Set(days.filter((_, i) => i % 3 === 0));
  const weather = { daily: { time: days, precipitation_sum: days.map((d) => (rainy.has(d) ? 8 : 0)), temperature_2m_max: days.map(() => 14), daylight_duration: days.map(() => 36000) } };
  const rainWorld = ([k, now, D]) => {
    const s = JSON.parse(localStorage.getItem(k) || '{}'); let seed = 11; const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const ymd = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
    s.workouts = []; s.supplements = []; s.entries = []; s.ai = { ...(s.ai || {}), experiments: [], digest: null, night: null };
    for (let i = 60; i >= 1; i--) {
      const day0 = new Date(new Date(now - i * D).setHours(0, 0, 0, 0)).getTime(), rain = (92 - i) % 3 === 0;
      s.entries.push({ id: 'f' + i, kind: 'feel', at: day0 + 20 * 36e5, mood: Math.max(1, Math.min(10, Math.round(7 + (r() - 0.5) * 2 - (rain ? 1.5 : 0)))), energy: 6 });
      void ymd;
    }
    localStorage.setItem(k, JSON.stringify(s));
  };
  ({ ctx, pg, errs } = await open(b, rainWorld, { weather }));
  let asked = [];
  await ctx.route('https://api.open-meteo.com/**', (r) => { asked.push(r.request().url()); return r.fulfill({ contentType: 'application/json', body: JSON.stringify(weather) }); });
  await pg.evaluate(() => localStorage.removeItem('healthos.weather'));
  await pg.goto(APP + '#insights/connections'); await pg.reload(); await pg.waitForSelector('#noticed', { timeout: 10000 }).catch(() => {}); await pg.waitForTimeout(1500);
  const noticed = (await pg.locator('#noticed').innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(`the weather asked for Budapest (${asked[0] ? asked[0].slice(0, 90) : 'none'})`, asked.some((u) => /latitude=47\.5&longitude=19\.04/.test(u)));
  check(`Noticed finds the rain: mood lower on rainy days (${(noticed.match(/On rainy days[^.]*/) || [''])[0]})`, /On rainy days, your mood is 1\.\d points lower/.test(noticed));
  console.log('errors: ' + JSON.stringify(errs)); check('no page errors', errs.length === 0);
  await ctx.close();
  ({ ctx, pg, errs } = await open(b, rainWorld));
  await pg.evaluate(() => localStorage.removeItem('healthos.weather'));
  await pg.goto(APP + '#insights/connections'); await pg.reload(); await pg.waitForTimeout(2000);
  const off = (await pg.locator('#noticed').innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(`control: Open-Meteo unreachable — nothing about rain, no errors (${errs.length})`, !/rain/i.test(off) && errs.length === 0);
  await ctx.close();
  await b.close();
})().catch((e) => { console.log('CRASH ' + e.message); process.exit(1); });
