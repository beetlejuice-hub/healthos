// Every trend (PLAN 207; owner, 11 Nov: "nice letsgo. build all" — K, L and M of the Insights canvas). 120 days planted:
// weight falling 2.4 kg, HRV from the band rising, resting heart flat, focus 0.6 lower the day after each drink. Insights'
// landing: a panel per measure — weight "↘ … kg in 90 days" counted as getting better, HRV better, resting heart steady;
// the range switch (30 days); every day a dot and the 7-day average line. The surest link under them, opening Findings,
// where what it started is shown — a planted researched protocol, "Try it" starts the experiment. On a phone: compact rows.
const { chromium, APP, OUT, handle, tables } = require('./harness.cjs');

const NOW = new Date('2026-11-11T15:00:00').getTime(), D = 864e5, KEY = 'healthos.v1:u-test', MIN = 60_000;
const day = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  let x = 11; const r = () => { x = (x * 16807) % 2147483647; return x / 2147483647; };
  const g = () => (r() + r() + r() - 1.5) * 1.1;
  const hrv = {}, rhr = {};
  for (let i = 120; i >= 1; i--) { const d = day(NOW - i * D); hrv[d] = Math.round(55 + (120 - i) * 0.07 + g() * 4); rhr[d] = Math.round(55 + g() * 1.2); }
  async function open(width) {
    tables.entries.clear(); tables.docs.clear();
    const ctx = await b.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2, isMobile: width < 600, hasTouch: width < 600 });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    await ctx.route('**/api/ai**', (rt) => rt.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' }));
    await ctx.route(/\/api\/band\//, (rt) => {
      const op = new URL(rt.request().url()).pathname.split('/').pop();
      const st = { connected: true, needsReconnect: false, connectedAt: NOW - 200 * D, lastSync: NOW - MIN, latest: NOW - 2 * MIN, error: null, gapSec: 60 };
      rt.fulfill({ contentType: 'application/json', body: JSON.stringify(op === 'data' ? { hr: [], steps: [], sleep: [], rhr, hrv, ...st } : st) });
    });
    const pg = await ctx.newPage();
    await pg.clock.install({ time: NOW });
    pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
    await pg.goto(APP);
    await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
    await pg.evaluate(([k, now, D]) => {
      const s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = []; s.workouts = []; s.supplements = []; s.scout = {};
      let x = 7; const r = () => { x = (x * 16807) % 2147483647; return x / 2147483647; };
      const g = () => (r() + r() + r() - 1.5) * 1.1;
      let prev = 0;
      for (let i = 120; i >= 1; i--) {
        const day0 = new Date(new Date(now - i * D).setHours(0, 0, 0, 0)).getTime();
        s.entries.push({ id: 'w' + i, kind: 'weight', at: day0 + 7 * 36e5, kg: Math.round((81 - (120 - i) * 0.02 + g() * 0.2) * 10) / 10 });
        s.entries.push({ id: 'm' + i, kind: 'feel', at: day0 + 15 * 36e5, mood: Math.round(6 + g()), energy: Math.round(6 + g()), stress: Math.round(4 + g()), focus: Math.round(Math.max(1, Math.min(10, 7 - 0.6 * prev + g() * 0.7))) });
        s.entries.push({ id: 'f' + i, kind: 'food', at: day0 + 13 * 36e5, name: 'Lunch', grams: 500, macros: { kcal: 2200, p: Math.round(110 + r() * 60), c: 250, f: 70 } });
        prev = Math.floor(r() * 4);
        for (let k = 0; k < prev; k++) s.entries.push({ id: `b${i}-${k}`, kind: 'drink', at: day0 + (20 + k) * 36e5, name: 'Wine', ml: 150, caffeineMg: 0, alcoholG: 14, kcal: 120 });
      }
      s.ai = { ...(s.ai || {}), digest: { day: '2026-11-11', at: now, greeting: 'Hi.', items: [] }, night: null, chat: [], experiments: [],
        researched: [{ key: 'mine:each-drink>focus', area: 'mine', name: 'your own data', title: 'Why one drink shows up in tomorrow\'s focus', known: 'Even small amounts cut REM late in the night.', forYou: '', tip: '', found: [{ title: 'Alcohol and REM', text: 'a review, 2023', source: { title: 'Alcohol and sleep — a review', url: 'https://pubmed.ncbi.nlm.nih.gov/123/' } }], sure: 'moderate',
          protocol: { name: 'Dry weekdays', how: 'No drinks Monday to Thursday.', days: 14, measure: 'focus' }, at: now - 2 * D, day: '2026-11-09', usd: 0.05 }] };
      localStorage.setItem(k, JSON.stringify(s));
    }, [KEY, NOW, D]);
    await pg.goto(APP + '#insights/week'); await pg.reload();
    await pg.getByRole('region', { name: 'Every trend' }).waitFor({ timeout: 15000 }).catch(() => {});
    await pg.waitForTimeout(800);
    return { ctx, pg };
  }
  const flat = (t) => t.replace(/\s+/g, ' ').trim();

  let { ctx, pg } = await open(1280);
  const wall = pg.getByRole('region', { name: 'Every trend' });
  const panel = (k) => wall.locator(`[data-trend="${k}"]`);
  const w = flat(await panel('weight').innerText().catch(() => ''));
  check(`weight: falling, better, "−… kg in 90 days" (${w})`, await panel('weight').getAttribute('data-tone') === 'better' && /↘ −[12]\.\d kg in 90 days/.test(w));
  check(`HRV rising, better; resting heart steady (${flat(await panel('hrv').innerText().catch(() => '')).slice(0, 50)} · ${flat(await panel('rhr').innerText().catch(() => '')).slice(0, 50)})`, await panel('hrv').getAttribute('data-tone') === 'better' && await panel('rhr').getAttribute('data-tone') === 'steady');
  check(`each day a dot (89: none weighed yet today), the average a line (${await panel('weight').locator('.tw-dot').count()} dots)`, await panel('weight').locator('.tw-dot').count() === 89 && await panel('weight').locator('.tw-avg').count() === 1);
  // PLAN 215: red and green days, and a trend opened big
  const g0 = await panel('hrv').locator('.tw-dot.better').count(), r0 = await panel('hrv').locator('.tw-dot.worse').count();
  check(`HRV's days in green and red against your usual (${g0} green, ${r0} red of 90)`, g0 > 10 && r0 > 10 && g0 + r0 < 70);
  check(`calories, neither way better: no red or green (${await panel('kcal').locator('.tw-dot.better, .tw-dot.worse').count()})`, await panel('kcal').locator('.tw-dot.better, .tw-dot.worse').count() === 0);
  await panel('hrv').click(); await pg.waitForTimeout(300);
  const big = pg.locator('[data-trend-big="hrv"]'), dayBox = big.getByTestId('trend-day');
  check(`tap HRV: it opens big, on the last day (${flat(await dayBox.innerText().catch(() => ''))})`, await big.isVisible() && /Tue 10 Nov/.test(flat(await dayBox.innerText())) && new RegExp(`^.*${hrv['2026-11-10']}`).test(flat(await dayBox.innerText())));
  await big.getByRole('button', { name: 'Day before' }).click();
  check(`‹ the day before, with its value (${flat(await dayBox.innerText())})`, /9 Nov/.test(flat(await dayBox.innerText())) && flat(await dayBox.innerText()).includes(String(hrv['2026-11-09'])));
  const inRange = Object.entries(hrv).filter(([d]) => d >= day(NOW - 90 * D)), top = Math.max(...inRange.map(([, v]) => v));
  await big.getByRole('button', { name: /Best day/ }).click();
  const bd = flat(await dayBox.innerText());
  check(`best day: the highest HRV in the 90 days, said against your usual (${bd})`, bd.includes(String(top)) && /above your usual \d+ — better/.test(bd) && await dayBox.getAttribute('class').then((c) => /better/.test(c)));
  const sv = big.locator('.tb-svg'), box = await sv.boundingBox();
  await pg.mouse.click(box.x + box.width * 0.12, box.y + box.height / 2);
  check(`tap the chart early on: an August/September day (${flat(await dayBox.innerText()).slice(0, 30)})`, /Aug|Sept?/.test(flat(await dayBox.innerText())));
  check(`the list: day by day, newest first (${await big.locator('.tb-list li').count()})`, await big.locator('.tb-list li').count() === 14 && /10 Nov/.test(await big.locator('.tb-list li').first().innerText()));
  await big.screenshot({ path: OUT + 'trends-big-1280.png' });
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(200);
  check('Escape closes it', await big.count() === 0);
  const tally = flat(await wall.locator('.tw-tally').innerText());
  check(`the tally (${tally})`, /^\d+ getting better \d+ slipping \d+ steady$/.test(tally) && +tally.match(/^(\d+)/)[1] >= 2);
  await wall.getByRole('button', { name: 'Last 30 days' }).click(); await pg.waitForTimeout(300);
  check(`30 days: 29 dots, said in 30 days (${await panel('weight').locator('.tw-dot').count()})`, await panel('weight').locator('.tw-dot').count() === 29 && /in 30 days|steady/.test(await panel('weight').innerText()));
  const link = wall.locator('.tw-link');
  check(`the surest link under them (${flat(await link.innerText().catch(() => ''))})`, /Each drink goes with focus [\d.]+ lower the next day\./.test(await link.innerText().catch(() => '')));
  await wall.screenshot({ path: OUT + 'trends-1280.png' });
  await link.click(); await pg.waitForTimeout(800);
  const started = pg.locator('.cd-started');
  check(`Findings: what it started, its protocol (${flat(await started.innerText().catch(() => '')).slice(0, 160)})`, /What it started looking into/i.test(await started.innerText().catch(() => '')) && /Dry weekdays — No drinks Monday to Thursday\. \(14 days; the app watches focus\)/.test(flat(await started.innerText())));
  await started.getByRole('button', { name: 'Try it for 14 days' }).click(); await pg.waitForTimeout(300);
  const ex = await pg.evaluate((k) => JSON.parse(localStorage.getItem(k)).ai.experiments.map((e) => e.name), KEY);
  check(`"Try it" starts the experiment (${ex.join(', ')})`, ex.includes('Dry weekdays') && /Running/i.test(await started.innerText()));
  await ctx.close();

  ({ ctx, pg } = await open(390));
  const wall2 = pg.getByRole('region', { name: 'Every trend' });
  const areas = await wall2.locator('[data-trend="weight"]').evaluate((e) => getComputedStyle(e).gridTemplateAreas).catch(() => '');
  check(`phone: compact rows (${areas})`, /"name svg ch" "now svg ch"/.test(areas) && await wall2.locator('.tw-foot').first().isHidden());
  check(`390: fits (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
  await wall2.screenshot({ path: OUT + 'trends-390.png' });
  await wall2.locator('[data-trend="asleep"], [data-trend="hrv"]').first().click(); await pg.waitForTimeout(300);
  const big2 = pg.locator('[data-trend-big]');
  check(`phone: tapped, big, fits (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await big2.isVisible() && await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
  await pg.screenshot({ path: OUT + 'trends-big-390.png' });
  await ctx.close();
  console.log('errors: ' + JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH ' + e.message); process.exit(1); });
