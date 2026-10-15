// The night out of 100 (PLAN 97; owner, 14 Oct: "should do a 100/… pointing for my sleep based on all the sleep data,
// length, etc i get and also add in my rating"; 15 Oct: on the studies' ranges, not your usual, drawn so it reads). 20 fake
// nights from the band: in bed ~23:30, ~7 h 40 asleep with stages, heart rate, HRV, each morning rated 8. Last night: in
// bed 01:30 (2 h late), 5 h asleep, not rated yet. The card must show its parts with the right points, each on a bar in
// the study's zones with this night's dot and your usual's tick, say the rating isn't in yet, and the strip must show
// every night's score.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

const MIN = 60_000, HOUR = 3_600_000, D = 86_400_000, NOW = new Date('2026-10-14T09:30:00').getTime();
const ymd = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
function rng(seed) {
  let s = seed >>> 0;
  const r = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { r, g: () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()) };
}
function world() {
  const { g } = rng(3), sleep = [], hr = [], entries = [], hrv = {}, rhr = {};
  for (let k = 20; k >= 1; k--) {
    const last = k === 1, day0 = new Date(2026, 9, 14 - k).getTime(), T = (h) => day0 + h * HOUR; // the evening's day
    const bed = T(last ? 25.5 : 23.5 + g() * 0.1), onset = bed + 12 * MIN, asleepMin = last ? 300 : 460 + g() * 10, wake = onset + asleepMin * MIN, up = wake + 6 * MIN;
    const stages = [{ type: 'awake', start: bed, end: onset }];
    for (let t = onset, c = 0; t < wake - 1; c++) { const e = Math.min(wake, t + 90 * MIN), L = e - t; stages.push({ type: 'light', start: t, end: t + L * 0.45 }, { type: c < 2 ? 'deep' : 'light', start: t + L * 0.45, end: t + L * 0.7 }, { type: 'rem', start: t + L * 0.7, end: e }); t = e; }
    stages.push({ type: 'awake', start: wake, end: up });
    sleep.push({ id: 's' + k, start: bed, end: up, asleepMin: Math.round(asleepMin), awakeMin: 18, toFallAsleepMin: 12, nap: false, stageMin: {}, stages });
    for (let t = bed - HOUR; t < up; t += 2 * MIN) { const v = Math.round((t > onset && t < wake ? 52 : 63) + g()); hr.push([t, v, v - 2, v + 2]); }
    hrv[ymd(up)] = Math.round(48 + g() * 2); rhr[ymd(up)] = 54;
    if (!last) entries.push({ id: 'r' + k, kind: 'sleep', at: up + 20 * MIN, rating: 8 });
  }
  return { hr: hr.sort((a, b) => a[0] - b[0]), sleep, entries, hrv, rhr };
}

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const w = world();
  const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  await ctx.route(/\/api\/band\//, (rt) => {
    const u = new URL(rt.request().url()), op = u.pathname.split('/').pop(), from = +u.searchParams.get('from'), to = +u.searchParams.get('to');
    const st = { connected: true, needsReconnect: false, connectedAt: NOW - 40 * D, lastSync: NOW - 3 * MIN, latest: w.hr.at(-1)[0], error: null, gapSec: 120 };
    const inR = (t) => t >= from && t <= to;
    rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(op === 'data' ? { hr: w.hr.filter((m) => inR(m[0])), steps: [], sleep: w.sleep.filter((x) => x.end >= Math.min(from, NOW - 40 * D) - D && x.start <= to), rhr: w.rhr, hrv: w.hrv, ...st } : st) });
  });
  const pg = await ctx.newPage();
  await pg.clock.install({ time: NOW });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  await pg.evaluate((es) => { const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = es; s.workouts = []; localStorage.setItem(k, JSON.stringify(s)); }, w.entries);
  await pg.goto(APP + '#insights/sleep'); await pg.reload(); await pg.waitForSelector('.sl[data-nights]');
  await pg.waitForFunction(() => +document.querySelector('.sl')?.dataset.nights >= 20, null, { timeout: 15000 }).catch(() => {});
  await pg.waitForTimeout(300);
  const card = pg.locator('.sl .sl-score');
  const part = (id) => card.locator(`.sl-sp[data-part="${id}"]`).evaluate((e) => [+e.dataset.got, e.querySelector('.why').textContent, e.dataset.zone, e.querySelector('.ref')?.textContent,
    parseFloat(e.querySelector('.zb .dot')?.style.left), parseFloat(e.querySelector('.zb .u')?.style.left), e.querySelector('.zb .dot')?.className]).catch(() => null);
  const score = +(await card.getAttribute('data-score'));
  check(`last night: 5 h, not rated — "fair", not good (${(await card.locator('.sl-score-n').innerText()).replace(/\n/g, ' ')})`, score >= 60 && score < 80 && /\/ 100 ·\s*fair/.test(await card.locator('.sl-score-n').innerText()));
  const len = await part('length'), bt = await part('bedtime');
  // 5 h is under the NSF's 6: poor, 6.3 of 25 — whatever your usual; drawn at 1/7 of the 4–11 h bar, your usual 7 h 40 past half
  check(`length: 5 h asleep is poor, 6.3 of 25, ideal and usual said (${len})`, len && len[0] === 6.3 && len[1] === '5 h 00' && len[2] === 'poor' && /^ideal 7–9 h · your usual 7 h [34]\d$/.test(len[3]));
  check(`length's bar: the dot red at 5 h, your usual's tick at 7 h 40 (${len && len.slice(4)})`, len && Math.abs(len[4] - 14.3) < 0.5 && len[5] > 50 && len[5] < 55 && /\bpoor\b/.test(len[6]));
  // asleep at 01:42: past the study's window — poor, about 1 of 5
  check(`fell asleep at 01:42: poor, about 1 of 5, against 22:00–23:00 (${bt})`, bt && bt[0] > 0.5 && bt[0] < 1.6 && bt[1] === '01:42' && bt[2] === 'poor' && /^ideal 22:00–23:00 · your usual 23:[34]\d$/.test(bt[3]));
  const zs = await card.locator('.sl-sp.z').evaluateAll((els) => els.map((e) => [e.dataset.part, e.dataset.zone, e.querySelectorAll('.zb .dot').length, getComputedStyle(e.querySelector('.zb .dot')).backgroundColor]));
  check(`every part on its zones, one dot each, the zone in words and colour (${zs.map((z) => z[0] + ':' + z[1]).join(' ')})`, zs.length === 10 && zs.every((z) => z[2] === 1 && /ideal|fair|poor/.test(z[1]))
    && new Set(zs.filter((z) => z[1] === 'poor').map((z) => z[3])).size === 1 && zs.find((z) => z[1] === 'poor')[3] !== zs.find((z) => z[1] === 'ideal')?.[3]);
  check('the key: this night, your usual, the three zones', /this night[\s\S]*your usual[\s\S]*ideal[\s\S]*fair[\s\S]*poor/.test(await card.locator('.sl-key').innerText().catch(() => '')));
  check(`not rated yet: said, and left out — not counted as 0 (${await card.locator('.sl-note').innerText().catch(() => '')})`, /your rating/.test(await card.locator('.sl-note').innerText().catch(() => '')) && await card.locator('.sl-sp[data-part="rating"]').count() === 0);
  const minis = await pg.locator('.sl .sl-mini').evaluateAll((els) => els.map((e) => +e.dataset.score));
  check(`the strip: every night's score, last night's the lowest (${minis.join(' ')})`, minis.length === 14 && minis.every((x) => x > 0 && x <= 100) && minis.at(-1) === score && minis.slice(0, -1).every((x) => x > score + 10));
  check(`fits the phone (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
  await card.screenshot({ path: OUT + 'sleepscore-last.png' });
  // Today, this morning, before rating: the same number in the check-in, "so far", a link to the parts
  await pg.goto(APP + '#today'); await pg.waitForSelector('#feel');
  await pg.waitForSelector('.hn-fell .hn-score', { timeout: 15000 }).catch(() => {});
  const t1 = await pg.locator('.hn-fell').innerText().catch(() => '');
  check(`Today, unrated: "score ${score}/100 so far" in the check-in (${t1})`, new RegExp(`score ${score}/100 so far`).test(t1) && await pg.locator('.hn-fell .hn-score').getAttribute('href') === '#insights/sleep');
  await pg.locator('#feel').screenshot({ path: OUT + 'sleepscore-today.png' });
  await pg.goto(APP + '#insights/sleep'); await pg.waitForSelector('.sl[data-nights]'); await pg.waitForFunction(() => +document.querySelector('.sl')?.dataset.nights >= 20, null, { timeout: 15000 }).catch(() => {}); await pg.waitForTimeout(200);
  // a rated, ordinary night: the rating is in it, 8/10 → 16 of 20
  await pg.locator('.sl .sl-mini').nth(10).click(); await pg.waitForTimeout(200);
  const rated = await part('rating'), s2 = +(await card.getAttribute('data-score'));
  check(`an earlier night: rated 8 → 12 of 15, its score the strip's (${rated}; ${s2})`, rated && rated[0] === 12 && s2 === minis[10] && await card.locator('.sl-note').count() === 0);
  await card.screenshot({ path: OUT + 'sleepscore-rated.png' });
  // rating last night (on Today) puts it in
  await pg.evaluate(() => { const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries.push({ id: 'rlast', kind: 'sleep', at: Date.now() - 30 * 60_000, rating: 4 }); localStorage.setItem(k, JSON.stringify(s)); });
  await pg.reload(); await pg.waitForSelector('.sl[data-nights]'); await pg.waitForFunction(() => +document.querySelector('.sl')?.dataset.nights >= 20, null, { timeout: 15000 }).catch(() => {}); await pg.waitForTimeout(300);
  const r4 = await part('rating');
  check(`rated 4 this morning: 6 of 15, and the note's gone (${r4})`, r4 && r4[0] === 6 && await card.locator('.sl-note').count() === 0);
  const s4 = +(await card.getAttribute('data-score'));
  await pg.goto(APP + '#today'); await pg.waitForSelector('#feel'); await pg.waitForSelector('.hn-slept .hn-score', { timeout: 15000 }).catch(() => {});
  const t2 = await pg.locator('.hn-slept').innerText().catch(() => '');
  check(`Today, rated: "Last night 4 / 10 · ${s4}/100", the Sleep page's number (${t2})`, new RegExp(`Last night 4 / 10 · ${s4}/100(?! so far)`).test(t2));
  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
