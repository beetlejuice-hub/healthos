// "Feeling weak" and what came before it (owner, 27 Oct: "make sure it can find connections between things i log like
// feeling weak and what I've been doing"). 90 days of check-ins; on the day after two beers the evening note says "felt
// weak today" 8 times in 10, else 1 in 20 (other notes are ordinary, a few say "not tired"). Insights → Findings → Leads
// must show it in plain words — "With more alcohol, you felt weak the next day more often" — drawn over 4 weeks, without
// a "Test it" (feeling weak isn't something an experiment measures yet). Control: the same notes with "weak" at random —
// no lead about feeling weak. On a phone.
const { chromium, APP, OUT, handle, tables } = require('./harness.cjs');

const NOW = new Date('2026-10-27T10:00:00').getTime(), D = 864e5, KEY = 'healthos.v1:u-test';

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  async function open(planted) {
    tables.entries.clear(); tables.docs.clear();
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    await ctx.route('**/api/ai**', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' }));
    const pg = await ctx.newPage();
    await pg.clock.install({ time: NOW });
    pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
    await pg.goto(APP);
    await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
    await pg.evaluate(([k, now, D, planted]) => {
      const s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = []; s.workouts = []; s.supplements = []; s.scout = {};
      let seed = 23; const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      let drank = false;
      for (let i = 90; i >= 1; i--) {
        const day0 = new Date(new Date(now - i * D).setHours(0, 0, 0, 0)).getTime();
        const weak = planted ? r() < (drank ? 0.8 : 0.05) : r() < 0.2;
        const note = weak ? 'felt weak today' : r() < 0.15 ? 'not tired, good day' : 'ok';
        s.entries.push({ id: 'm' + i, kind: 'feel', at: day0 + 18 * 36e5, mood: Math.max(1, Math.min(10, Math.round(6.5 + (r() - 0.5) * 3))), energy: Math.max(1, Math.min(10, Math.round(6 + (r() - 0.5) * 3))), note });
        s.entries.push({ id: 'f' + i, kind: 'food', at: day0 + 13 * 36e5, name: 'Lunch', grams: 500, macros: { kcal: 2200, p: 120, c: 250, f: 70 } });
        drank = r() < 0.3;
        if (drank) s.entries.push({ id: 'b' + i, kind: 'drink', at: day0 + 21 * 36e5, name: 'Beer', ml: 1000, caffeineMg: 0, alcoholG: 40, kcal: 430 });
      }
      s.ai = { ...(s.ai || {}), digest: { day: '2026-10-27', at: now, greeting: 'Morning.', items: [] }, night: null, chat: [], experiments: [] };
      localStorage.setItem(k, JSON.stringify(s));
    }, [KEY, NOW, D, planted]);
    await pg.goto(APP + '#insights/connections'); await pg.reload(); await pg.waitForSelector('#scout', { timeout: 8000 }).catch(() => {});
    return { ctx, pg };
  }

  let { ctx, pg } = await open(true);
  const cards = await pg.locator('#scout .scard').allInnerTexts();
  const weak = pg.locator('#scout .scard', { hasText: 'you felt weak' }).first();
  const t = (await weak.innerText().catch(() => '')).replace(/\s+/g, ' ');
  console.log('cards:', cards.map((c) => c.replace(/\s+/g, ' ').slice(0, 90)).join(' | '));
  check(`Leads: drinks → feeling weak the next day, in plain words (${t.slice(0, 140)})`, /With more alcohol, you felt weak the next day more often/.test(t) && /Held on \d+ of \d+/.test(t));
  const head = (await weak.locator('.lc .dc-head').innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(`drawn over 4 weeks (${head})`, /^alcohol on top · feeling weak, the next day under it · last 28 days$/.test(head) && await weak.locator('.lc-a .dc-day').count() === 28);
  check('no "Test it" for feeling weak (not something an experiment measures yet)', await weak.getByRole('button', { name: 'Test it' }).count() === 0);
  check(`fits the phone (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
  await weak.screenshot({ path: OUT + 'feltweak.png' });
  await ctx.close();

  ({ ctx, pg } = await open(false));
  const c = (await pg.locator('#scout').innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(`control: "weak" at random — no lead about feeling weak (${c.slice(0, 120)})`, !/felt weak/.test(c));
  await ctx.close();

  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
