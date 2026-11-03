// Tonight's bet (PLAN 187 phase 2; owner, 3 Nov: "App could do prediction vs real so it predicts based on drinks workout
// food etc to sleep"; picked B on the canvas: "simpler, cleaner"). 63 fake band nights; planted: each drink that evening
// heart rate asleep +2.5, HRV −5, 25 min less sleep. Morning (08:00): the last night was a bad one with no drinks — the
// card says the real score, what the app bet, "Missed by …", the week of bets, and asks; "Stressed" tags last night.
// Evening (21:30) after 2 beers: the bet is under the usual and says it's mostly the drinks; why lists them. Control: an
// evening with no drinks — near the usual, no "mostly 2 drinks". 320 px fits.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

const MIN = 60_000, HOUR = 3_600_000, D = 86_400_000, KEY = 'healthos.v1:u-test';
const MORNING = new Date('2026-10-27T08:00:00').getTime(), EVENING = new Date('2026-10-27T21:30:00').getTime();
const ymd = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
function rng(seed) {
  let s = seed >>> 0;
  const r = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { r, g: () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()) };
}
function world() {
  const { r, g } = rng(33), sleep = [], hr = [], hrv = {}, rhr = {}, entries = [];
  for (let k = 63; k >= 1; k--) {
    const eve0 = new Date(2026, 9, 27 - k).getTime(), T = (h) => eve0 + h * HOUR;
    const bad = k === 1; // last night: a rough one the drinks don't explain
    const drinks = bad ? 0 : r() < 0.35 ? 1 + Math.floor(r() * 3) : 0;
    for (let j = 0; j < drinks; j++) entries.push({ id: `b${k}-${j}`, kind: 'drink', at: T(20 + j * 0.5), name: 'Beer', ml: 500, caffeineMg: 0, alcoholG: 20, kcal: 215 });
    const bed = T(23.25 + g() * 0.3), onset = bed + 12 * MIN, wake = T(31.4) - drinks * 25 * MIN - (bad ? 110 * MIN : 0), up = wake + 5 * MIN;
    const deep = Math.round(82 + g() * 6 - (bad ? 40 : 0)), sHr = 54 + 2.5 * drinks + (bad ? 7 : 0) + g() * 0.8;
    const stages = [{ type: 'awake', start: bed, end: onset }, { type: 'deep', start: onset, end: onset + deep * MIN }, { type: 'light', start: onset + deep * MIN, end: wake - 90 * MIN }, { type: 'rem', start: wake - 90 * MIN, end: wake }, { type: 'awake', start: wake, end: up }];
    sleep.push({ id: 's' + k, start: bed, end: up, asleepMin: Math.round((wake - onset) / MIN), awakeMin: 0, toFallAsleepMin: 12, nap: false, stageMin: {}, stages });
    for (let t = bed - HOUR; t < up; t += 5 * MIN) { const v = Math.round((t >= onset && t < wake ? sHr : 64) * 10) / 10; hr.push([t, v, v - 2, v + 2]); }
    hrv[ymd(up)] = Math.round(52 - 5 * drinks - (bad ? 16 : 0) + g() * 2);
    rhr[ymd(up)] = Math.round(54 + drinks + g());
  }
  return { hr: hr.sort((a, b) => a[0] - b[0]), sleep, hrv, rhr, entries };
}

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const w = world();
  const ctx = await b.newContext({ viewport: { width: 320, height: 760 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  await ctx.route('**/api/ai**', (rt) => rt.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' }));
  await ctx.route(/\/api\/band\//, (rt) => {
    const u = new URL(rt.request().url()), op = u.pathname.split('/').pop(), from = +u.searchParams.get('from'), to = +u.searchParams.get('to');
    const st = { connected: true, needsReconnect: false, connectedAt: MORNING - 90 * D, lastSync: MORNING - 3 * MIN, latest: w.hr.at(-1)[0], error: null, gapSec: 300 };
    const inR = (t) => t >= from && t <= to;
    rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(op === 'data' ? { hr: w.hr.filter((m) => inR(m[0])), steps: [], sleep: w.sleep.filter((x) => x.end >= from && x.start <= to), rhr: w.rhr, hrv: w.hrv, ...st } : st) });
  });
  const pg = await ctx.newPage();
  await pg.clock.install({ time: MORNING });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  await pg.evaluate(([k, es]) => { const s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = es; s.workouts = []; localStorage.setItem(k, JSON.stringify(s)); }, [KEY, w.entries]);
  await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('text=Settings');
  const card = (name) => pg.getByRole('region', { name });
  await card("Last night's bet").waitFor({ timeout: 20000 }).catch(() => {});
  // the band's months of nights come in pieces: wait for the week strip to fill
  await pg.waitForFunction(() => document.querySelectorAll('.fc-week i').length >= 7, null, { timeout: 15000 }).catch(() => {});
  const m = (await card("Last night's bet").innerText().catch(() => '')).replace(/\s+/g, ' ');
  const nums = m.match(/^(\d+) sleep score · the app bet (\d+) Missed by (\d+)/);
  check(`morning: the real score, the bet, "Missed by" a rough night the drinks don't explain (${m.slice(0, 90)})`, !!nums && +nums[1] < +nums[2] - 5 && +nums[3] === +nums[2] - +nums[1]);
  check(`…the week of bets (${await pg.locator('.fc-week i').count()} squares, ${(m.match(/\d+ of \d+/) || [''])[0]})`, await pg.locator('.fc-week i').count() === 7 && /\d of 7/.test(m));
  check(`…and it asks what it didn't see (${(m.match(/Worse than it bet[^?]*\?/) || [''])[0]})`, /Worse than it bet — something it didn't see\?/.test(m));
  check(`320: fits (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 320);
  await card("Last night's bet").screenshot({ path: OUT + 'forecast-morning.png' });
  await card("Last night's bet").getByRole('button', { name: 'Stressed' }).click(); await pg.waitForTimeout(300);
  const tags = await pg.evaluate((k) => JSON.parse(localStorage.getItem(k)).entries.filter((e) => e.kind === 'sleep').map((e) => [e.at, e.tags]), KEY);
  check(`"Stressed": last night tagged, for the Sleep page and the bet to learn (${JSON.stringify(tags)})`, tags.length === 1 && tags[0][1].includes('stressed') && /Noted — stressed/.test(await card("Last night's bet").innerText()));

  // 21:30 after 2 beers
  await pg.evaluate(([k, at]) => { const s = JSON.parse(localStorage.getItem(k)); s.entries.push({ id: 'tb1', kind: 'drink', at, name: 'Beer', ml: 500, caffeineMg: 0, alcoholG: 20, kcal: 215 }, { id: 'tb2', kind: 'drink', at: at + 30 * 60_000, name: 'Beer', ml: 500, caffeineMg: 0, alcoholG: 20, kcal: 215 }); localStorage.setItem(k, JSON.stringify(s)); }, [KEY, new Date('2026-10-27T20:00:00').getTime()]);
  await pg.clock.setFixedTime(EVENING); await pg.reload(); await pg.waitForSelector('text=Settings');
  await card("Tonight's bet").waitFor({ timeout: 20000 }).catch(() => {});
  await pg.waitForTimeout(1500);
  const e = (await card("Tonight's bet").innerText().catch(() => '')).replace(/\s+/g, ' ');
  const en = e.match(/The app bets on a (\d+) tonight usual (\d+) · mostly 2 drinks \(−(\d+)\)/);
  check(`evening, 2 beers: under the usual, mostly the drinks (${e.slice(0, 90)})`, !!en && +en[1] < +en[2] - 3 && +en[3] >= 4);
  await card("Tonight's bet").getByRole('button', { name: /Why, and what would move it/ }).click();
  const why = (await card("Tonight's bet").innerText()).replace(/\s+/g, ' ');
  check(`why: its range, in bed at your usual time, the drinks listed (${why.slice(why.indexOf('Likely'), why.indexOf('Likely') + 120)})`, /Likely \d+–\d+, with you in bed at your usual time/.test(why) && /2 drinks −\d+/.test(why));
  await card("Tonight's bet").screenshot({ path: OUT + 'forecast-evening.png' });

  // control: the same evening without the beers
  await pg.evaluate((k) => { const s = JSON.parse(localStorage.getItem(k)); s.entries = s.entries.filter((x) => !x.id.startsWith('tb')); localStorage.setItem(k, JSON.stringify(s)); }, KEY);
  await pg.reload(); await pg.waitForSelector('text=Settings');
  await card("Tonight's bet").waitFor({ timeout: 20000 }).catch(() => {});
  await pg.waitForTimeout(1500);
  const c = (await card("Tonight's bet").innerText().catch(() => '')).replace(/\s+/g, ' ');
  const cn = c.match(/The app bets on a (\d+) tonight usual (\d+)/);
  check(`control: no drinks — at or above the usual, no "mostly 2 drinks" (${c.slice(0, 80)})`, !!cn && +cn[1] >= +cn[2] - 2 && !/drinks \(−/.test(c));
  console.log('errors: ' + JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH ' + e.message); process.exit(1); });
