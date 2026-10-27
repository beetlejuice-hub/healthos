// Today's lead (PLAN 176; owner, 27 Oct: "Rn it just summarizes my day and tells me to eat more protein and sleep better
// basically" · "really have to make ai smarter. more likely for graphs and connections between things and research/studies").
// 90 days where two beers one evening go with a low mood the next day (planted). The morning read is asked to explain THAT
// link — its numbers, why (searched), a chain, a test — and the item it comes back as is drawn by the app: alcohol on top,
// next-day mood under it, the drinking days lit. A control world with no link sends no lead.
const { chromium, APP, OUT, handle, tables } = require('./harness.cjs');

const NOW = new Date('2026-10-27T08:30:00').getTime(), D = 864e5, KEY = 'healthos.v1:u-test';
const ITEMS = [
  { type: 'connection', title: 'Two beers, a flat next day', text: 'Your mood runs ~2 points lower the day after drinks — 9 of 10 times.', sure: 'yours',
    chain: [{ step: 'Alcohol fragments the second half of sleep', sure: 'strong' }, { step: 'Less REM goes with lower mood next day', sure: 'some' }], tip: 'Skip the beers on 3 weeknights; the app watches your mood', source: { title: 'Alcohol and sleep architecture', url: 'https://example.org/alcohol-sleep' } },
  { type: 'try', title: 'Glycine before bed', text: '3 g glycine shortened time to deep sleep in small trials.', sure: 'some', tip: 'Try 3 g at 22:00', source: { title: 'Glycine and sleep', url: 'https://example.org/glycine' } },
  { type: 'study', title: 'Morning light and mood', text: '30 min outdoor light before 10 lifted mood in a 2025 trial.', sure: 'some', tip: 'Walk before 10', measure: 'mood', source: { title: 'Morning light trial', url: 'https://example.org/light' } },
];

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  for (const planted of [true, false]) {
    tables.entries.clear(); tables.docs.clear();
    const sent = [];
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    await ctx.route('**/api/ai/usage**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ usage: null, cap: 50, on: true }) }));
    await ctx.route('**/api/ai?**', (r) => {
      const body = r.request().postDataJSON(); sent.push(body);
      if (body.task !== 'digest') return r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' });
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ answer: { greeting: 'Morning.', items: ITEMS }, usage: null, costUsd: 0.05, model: 'sonnet' }) });
    });
    const pg = await ctx.newPage();
    await pg.clock.install({ time: NOW });
    pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
    await pg.goto(APP);
    await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
    await pg.evaluate(([k, now, D, planted]) => {
      const s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = []; s.workouts = []; s.supplements = [];
      let seed = 11; const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      let drank = false;
      for (let i = 90; i >= 1; i--) {
        const day0 = new Date(new Date(now - i * D).setHours(0, 0, 0, 0)).getTime();
        const mood = Math.max(1, Math.min(10, Math.round(7 + (r() - 0.5) * 2 - (planted && drank ? 2.5 : 0))));
        s.entries.push({ id: 'm' + i, kind: 'feel', at: day0 + 18 * 36e5, mood, energy: 6 });
        s.entries.push({ id: 'f' + i, kind: 'food', at: day0 + 13 * 36e5, name: 'Lunch', grams: 500, macros: { kcal: 2200, p: 120, c: 250, f: 70 } });
        drank = r() < 0.3;
        if (drank) s.entries.push({ id: 'b' + i, kind: 'drink', at: day0 + 21 * 36e5, name: 'Beer', ml: 1000, caffeineMg: 0, alcoholG: 40, kcal: 430 });
      }
      s.entries.push({ id: 'sl', kind: 'sleep', at: now - 36e5, rating: 7 });
      s.ai = { ...(s.ai || {}), digest: null, night: null, dive: null, reviews: [], chat: [], failed: [], leads: [] };
      localStorage.setItem(k, JSON.stringify(s));
    }, [KEY, NOW, D, planted]);
    await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('#feel');
    for (let i = 0; i < 80 && !sent.some((x) => x.task === 'digest'); i++) await pg.waitForTimeout(100);
    const ctxText = sent.find((x) => x.task === 'digest')?.context ?? '';
    if (!planted) { check(`control: no link planted — no lead sent (${/## Today's lead/.test(ctxText) ? 'sent' : 'none'})`, ctxText && !/## Today's lead/.test(ctxText)); await ctx.close(); continue; }
    const lead = (ctxText.match(/^## Today's lead — a link[^\n]*\n- ([^\n]*)\n- ([^\n]*)/m) || []).slice(1).join(' | ');
    check(`the morning read is handed the planted link, with its numbers (${lead.slice(0, 200)})`, /alcohol/i.test(lead) && /mood/i.test(lead) && /held on \d+ of \d+ days/.test(lead) && /alcohol one day, mood the next/.test(lead));
    check('…as its "pattern" item, a connection', /Angle for the "pattern" item: Today's lead — a "connection"/.test(ctxText));
    const card = pg.locator('section.morning:not(.mr-pending)');
    await card.waitFor({ timeout: 8000 }).catch(() => {});
    await card.locator('.mr-head').click(); await card.locator('.mr-row').first().click(); await pg.waitForTimeout(300);
    const kind = await card.locator('.mr-row').first().locator('.mr-kind').innerText();
    const chart = card.locator('.lc');
    const head = (await chart.locator('.dc-head').innerText().catch(() => '')).replace(/\s+/g, ' ');
    const lit = await chart.locator('.lc-a .dc-day[data-lit]').count();
    check(`the item is drawn by the app — alcohol on top, next-day mood under it, the drinking days lit (${kind}; ${head}; ${lit} lit)`, /tested/i.test(kind) && /^alcohol on top · mood, the next day under it · last 14 days$/i.test(head) && lit >= 2);
    const st = await pg.evaluate((k) => JSON.parse(localStorage.getItem(k)).ai, KEY);
    check(`…and the lead rests for 3 weeks now (${JSON.stringify(st.leads)})`, st.leads?.length === 1 && st.leads[0].day === '2026-10-27' && st.digest.items[0].lead?.a === 'alcohol');
    check(`fits the phone (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
    await card.locator('.mr-list > li').first().screenshot({ path: OUT + 'lead-item.png' });
    await ctx.close();
  }
  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
