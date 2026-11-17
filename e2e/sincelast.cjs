// Since you last looked (PLAN 225; owner, 17 Nov: "3"). 120 days: weight falling, focus lower the day after drinks. A
// first visit only takes note: no card. Then a visit two days ago is planted as the one before, when weight was steady,
// a link held that doesn't now, and nothing linked drinks to focus: the card lists weight turned to getting better, the
// drinks → focus link as new, the old one as gone. A reload in the same visit keeps the same list. Phone width.
const { chromium, APP, OUT, handle, tables } = require('./harness.cjs');

const NOW = new Date('2026-11-17T15:00:00').getTime(), D = 864e5, KEY = 'healthos.v1:u-test';

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  tables.entries.clear(); tables.docs.clear();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  await ctx.route(/\/api\/band\//, (rt) => rt.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"the band isn\'t set up on this server"}' }));
  await ctx.route('**/api/ai**', (rt) => rt.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' }));
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
      s.entries.push({ id: 'w' + i, kind: 'weight', at: day0 + 7 * 36e5, kg: Math.round((81 - (120 - i) * 0.03 + g() * 0.2) * 10) / 10 });
      s.entries.push({ id: 'm' + i, kind: 'feel', at: day0 + 15 * 36e5, mood: Math.round(6 + g()), energy: Math.round(6 + g()), stress: Math.round(4 + g()), focus: Math.round(Math.max(1, Math.min(10, 7 - 0.6 * prev + g() * 0.7))) });
      s.entries.push({ id: 'f' + i, kind: 'food', at: day0 + 13 * 36e5, name: 'e2e lunch', grams: 500, macros: { kcal: 2200, p: Math.round(110 + r() * 60), c: 250, f: 70 } });
      prev = Math.floor(r() * 4);
      for (let k = 0; k < prev; k++) s.entries.push({ id: `b${i}-${k}`, kind: 'drink', at: day0 + (20 + k) * 36e5, name: 'e2e wine', ml: 150, caffeineMg: 0, alcoholG: 14, kcal: 120 });
    }
    s.ai = { ...(s.ai || {}), digest: { day: '2026-11-17', at: now, greeting: 'Hi.', items: [] }, night: null, chat: [], experiments: [] };
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.removeItem('healthos.sincelast');
  }, [KEY, NOW, D]);
  const card = pg.getByRole('region', { name: 'Since you last looked' });
  const visit = async () => { await pg.goto(APP + '#insights/week'); await pg.reload(); await pg.getByRole('region', { name: 'Every trend' }).waitFor({ timeout: 15000 }).catch(() => {}); await pg.waitForTimeout(800); };

  await visit();
  check('first visit: nothing to compare yet — no card', await card.count() === 0);
  const kept = await pg.evaluate(() => JSON.parse(localStorage.getItem('healthos.sincelast') || 'null'));
  check(`…but it took note (${kept && Object.keys(kept.last.marks).length} marks)`, !!kept && !kept.base && Object.keys(kept.last.marks).length > 5 && kept.last.marks['t:weight']);

  // the visit before: two days ago, weight steady, an old link, no drinks → focus
  await pg.evaluate((now) => {
    const k = JSON.parse(localStorage.getItem('healthos.sincelast'));
    const marks = Object.fromEntries(Object.entries(k.last.marks).filter(([key]) => !key.startsWith('l:')));
    marks['t:weight'] = { ...marks['t:weight'], state: 'steady' };
    marks['l:steps>mood@0'] = { kind: 'link', name: 'More steps goes with better mood the same day', state: '+', href: '#insights/connections' };
    localStorage.setItem('healthos.sincelast', JSON.stringify({ base: null, last: { at: now - 2 * 864e5, marks } }));
  }, NOW);
  await visit();
  const items = await card.locator('li').evaluateAll((ls) => ls.map((l) => `${l.dataset.tag}|${l.dataset.tone}|${l.innerText.replace(/\s+/g, ' ')}`));
  check(`the card, from two days ago (${(await card.locator('h2').innerText().catch(() => '')).replace(/\s+/g, ' ')})`, await card.count() === 1 && /Sun 15 Nov/.test(await card.locator('h2').innerText()));
  check(`weight turned to getting better, in green (${items.find((x) => /Weight/.test(x))})`, items.some((x) => /^turned\|good\|TURNED Weight: steady → getting better$/i.test(x)));
  check(`the drinks → focus link is new (${items.filter((x) => x.startsWith('new')).join(' / ')})`, items.some((x) => /^new\|quiet\|NEW .*rink.*focus/i.test(x)));
  check(`the old link is gone (${items.find((x) => x.startsWith('gone'))})`, items.some((x) => /^gone\|quiet\|GONE No longer holds: more steps goes with better mood/i.test(x)));
  check(`at most six (${items.length})`, items.length >= 3 && items.length <= 6);
  check(`it comes first on the page (${await pg.evaluate(() => { const a = document.querySelector('.since'), t = document.querySelector('.tw'); return !!a && !!t && !!(a.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING); })})`, await pg.evaluate(() => { const a = document.querySelector('.since'), t = document.querySelector('.tw'); return !!a && !!t && !!(a.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING); }));
  await card.screenshot({ path: OUT + 'sincelast.png' });
  // the same visit: a reload keeps the same list
  await pg.clock.fastForward(20 * 60_000); await visit();
  const again = await card.locator('li').evaluateAll((ls) => ls.map((l) => `${l.dataset.tag}|${l.dataset.tone}|${l.innerText.replace(/\s+/g, ' ')}`));
  check('a reload in the same visit: the same list', JSON.stringify(again) === JSON.stringify(items));
  check(`fits the phone (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
