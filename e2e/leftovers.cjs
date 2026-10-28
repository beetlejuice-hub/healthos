// Three leftovers from the 21 Oct review (PLAN 151; owner, 22 Oct: "do 3"), on the 60-day sample with its band, as the
// review saw them. (1) At 320 px the weigh-in's "Log kg" stuck out 1 px: Today must fit. (2) Insights → Heart at 07:30,
// 8 minutes after waking, said "Above your usual 0 h 00 of 0 h 08 awake": it waits for an hour awake — and at 15:00 says
// its numbers as before. (3) The caffeine chart's top was fixed at 200 mg: on a 12 mg morning the line lay on the floor;
// now its top fits the day (40 for 12 mg) — and a 300 mg day still fits under it.
const { chromium, APP, OUT, handle, openCard, forYou } = require('./harness.cjs');
const { sampleBand, routeBand } = require('./tools/sampleband.cjs');

const KEY = 'healthos.v1:u-test', at = (hm) => new Date(`2026-10-21T${hm}:00`).getTime();

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  async function open(now, width, edit) {
    const ctx = await b.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    await ctx.route('**/api/ai**', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' }));
    const pg = await ctx.newPage();
    await pg.clock.install({ time: now });
    pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
    await pg.goto(APP);
    await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
    await pg.goto(APP + '#dev'); await pg.getByRole('button', { name: '60 days of sample' }).click(); await pg.waitForTimeout(400);
    // today's entries of a kind swapped for the test's own (the sample's own weigh-in or coffees)
    if (edit) await pg.evaluate(([k, kind, add]) => { const s = JSON.parse(localStorage.getItem(k)), day = new Date(Date.now()).toDateString();
      s.entries = s.entries.filter((e) => !(e.kind === kind && (kind !== 'drink' || e.caffeineMg > 0) && new Date(e.at).toDateString() === day)).concat(add); localStorage.setItem(k, JSON.stringify(s)); }, [KEY, ...edit]);
    const s = await pg.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}'), KEY);
    await routeBand(ctx, sampleBand(s.entries || [], s.workouts || [], now), now);
    return { ctx, pg };
  }

  // 1. the weigh-in at 320 px (no weigh-in yet today, so it's asked for) — and at 390, as it was
  for (const width of [320, 390]) {
    const { ctx, pg } = await open(at('07:30'), width, ['weight', []]);
    await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('#feel'); await pg.waitForTimeout(800);
    await forYou(pg, '.weighin');
    const row = await pg.locator('.weighin').evaluate((e) => Math.round(e.getBoundingClientRect().right * 10) / 10).catch(() => null);
    const boxes = await pg.locator('.weighin input').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width)));
    check(`${width} px: the weigh-in row is asked for and fits (its right edge at ${row} px)`, row != null && row <= width);
    // …with boxes you can type in (a first try squeezed them to 40 px): 90 px as before where there's room
    check(`${width} px: its two boxes are usable (${boxes.join(', ')} px)`, boxes.length === 2 && boxes.every((w) => (width >= 390 ? w >= 88 : w >= 60)));
    check(`${width} px: Today fits (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= width);
    await pg.locator('.item.weight').screenshot({ path: OUT + `leftovers-weighin-${width}.png` }).catch(() => {});
    await ctx.close();
  }

  // 2. Heart at 07:30, minutes after waking; and at 15:00
  for (const [hm, early] of [['07:30', true], ['15:00', false]]) {
    const { ctx, pg } = await open(at(hm), 390);
    await pg.goto(APP + '#insights/heart'); await pg.reload(); await pg.waitForSelector('.hp-kpis', { timeout: 15000 }).catch(() => {});
    await pg.waitForTimeout(600);
    const tiles = await pg.locator('.hp-kpis .kpi').evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
    const avg = tiles.find((t) => /^Awake average/i.test(t)) || '', above = tiles.find((t) => /^Above your usual/i.test(t)) || '';
    if (early) {
      check(`07:30: "Above your usual" waits for an hour awake (${above})`, /^Above your usual — after 1 h awake · \d+ min so far$/i.test(above));
      check(`07:30: …and so does the awake average (${avg})`, /^Awake average — after 1 h awake · \d+ min so far$/i.test(avg));
      await pg.locator('.hp-kpis').screenshot({ path: OUT + 'leftovers-heart-0730.png' }).catch(() => {});
    } else {
      check(`15:00: its numbers, as before (${above} | ${avg})`, /^Above your usual \d+ h \d\d of \d+ h \d\d awake · below \d+ h \d\d$/i.test(above) && /^Awake average \d+\s*bpm [+−-]?\d+(\.\d)? vs usual so far/i.test(avg));
    }
    await ctx.close();
  }

  // 3. the caffeine chart: a 12 mg morning (a green tea at 07:00), and a 300 mg day
  for (const [tag, drinks, want] of [['12 mg', [['07:00', 12]], 40], ['300 mg', [['07:30', 150], ['09:30', 150]], 300]]) {
    const ds = drinks.map(([hm, mg], i) => ({ id: 'cf' + i, kind: 'drink', at: at(hm), name: 'Coffee', ml: 250, caffeineMg: mg, alcoholG: 0, kcal: 2 }));
    const { ctx, pg } = await open(at('10:00'), 390, ['drink', ds]);
    await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('#feel');
    await openCard(pg, 'caffeine');
    const svg = pg.locator('#caffeine svg').first();
    const max = +(await svg.getAttribute('data-max').catch(() => 0));
    // how far up the plot the curve's highest point reaches (the plot runs from y=18 to y=94 in the chart's 110)
    const rise = await svg.evaluate((s) => { const ys = [...s.querySelectorAll('polyline')].flatMap((p) => p.getAttribute('points').trim().split(' ').map((q) => +q.split(',')[1])); return Math.round(((94 - Math.min(...ys)) / 76) * 100); }).catch(() => -1);
    check(`${tag}: the chart's top fits the day (${max} mg), the curve ${rise} % of the way up`, max === want && (tag === '12 mg' ? rise >= 25 : rise <= 100 && rise >= 60));
    // …fading out, not dropping off a ledge where "under 10 mg is none" starts (19 px on this scale, first try)
    const drop = await svg.evaluate((s) => Math.max(...[...s.querySelectorAll('polyline')].map((p) => { const ys = p.getAttribute('points').trim().split(' ').map((q) => +q.split(',')[1]); return Math.max(0, ...ys.slice(1).map((y, i) => y - ys[i])); }))).catch(() => 99);
    check(`${tag}: the curve fades out, no ledge (biggest drop between two points ${drop.toFixed(1)} px)`, drop < 3);
    if (tag === '12 mg') await pg.locator('#caffeine').screenshot({ path: OUT + 'leftovers-caffeine-12mg.png' }).catch(() => {});
    await ctx.close();
  }
  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
