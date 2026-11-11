// Connecting the dots (PLAN 206; owner, 10–11 Nov: "connecting the dots" · "interesting connections" · "i like charts that
// show a trend … lots of data"). 110 days planted: 0–3 drinks in the evening, and the next day's focus 0.6 lower a drink;
// protein at random. Insights → Findings: "Each drink goes with focus … lower the next day", its days as dots with the line
// through them, how sure; nothing about protein. Control: focus at random — nothing holds. Fits 390.
const { chromium, APP, OUT, handle, tables } = require('./harness.cjs');

const NOW = new Date('2026-11-11T15:00:00').getTime(), D = 864e5, KEY = 'healthos.v1:u-test';

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  async function open(width, planted) {
    tables.entries.clear(); tables.docs.clear();
    const ctx = await b.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
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
      s.ai = { ...(s.ai || {}), digest: { day: '2026-11-11', at: now, greeting: 'Hi.', items: [] }, night: null, chat: [], experiments: [] };
      let x = 7; const r = () => { x = (x * 16807) % 2147483647; return x / 2147483647; };
      const g = () => (r() + r() + r() - 1.5) * 1.1;
      let prev = 0;
      for (let i = 110; i >= 1; i--) {
        const day0 = new Date(new Date(now - i * D).setHours(0, 0, 0, 0)).getTime();
        const focus = planted ? 7 - 0.6 * prev + g() * 0.7 : 6 + g() * 1.2;
        s.entries.push({ id: 'm' + i, kind: 'feel', at: day0 + 15 * 36e5, mood: Math.round(6 + g()), energy: Math.round(6 + g()), stress: Math.round(4 + g()), focus: Math.round(Math.max(1, Math.min(10, focus))) });
        s.entries.push({ id: 'f' + i, kind: 'food', at: day0 + 13 * 36e5, name: 'Lunch', grams: 500, macros: { kcal: 2200, p: Math.round(90 + r() * 80), c: 250, f: 70 } });
        prev = Math.floor(r() * 4);
        for (let k = 0; k < prev; k++) s.entries.push({ id: `b${i}-${k}`, kind: 'drink', at: day0 + (20 + k) * 36e5, name: 'Wine', ml: 150, caffeineMg: 0, alcoholG: 14, kcal: 120 });
      }
      localStorage.setItem(k, JSON.stringify(s));
    }, [KEY, NOW, D, planted]);
    await pg.goto(APP + '#insights/connections'); await pg.reload();
    await pg.getByRole('region', { name: 'Connecting the dots' }).waitFor({ timeout: 15000 }).catch(() => {});
    return { ctx, pg };
  }

  let { ctx, pg } = await open(390, true);
  const sec = pg.getByRole('region', { name: 'Connecting the dots' });
  const links = (await sec.locator('.cd-list li p').allInnerTexts()).map((t) => t.replace(/\s+/g, ' '));
  const drink = links.find((t) => /^Each drink goes with focus/.test(t)) ?? '';
  const n = +((drink.match(/focus ([\d.]+) lower/) || [])[1]);
  check(`planted: each drink → focus lower the next day, about 0.6 (${drink})`, /^Each drink goes with focus [\d.]+ lower the next day\.$/.test(drink) && n > 0.4 && n < 0.8);
  check(`…nothing about protein, nor calories (the wine's are left out of them) (${links.join(' | ')})`, !links.some((t) => /protein|kcal/i.test(t)));
  const li = sec.locator('li[data-link="drinks>focus"]');
  check(`…its days as dots with the line (${await li.locator('.cd-dot').count()} dots)`, await li.locator('.cd-dot').count() >= 90 && await li.locator('.cd-fit.bad').count() === 1 && /very sure|fairly sure/.test(await li.locator('small').innerText()));
  check(`390: fits (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
  await sec.screenshot({ path: OUT + 'connectdots.png' });
  await ctx.close();

  ({ ctx, pg } = await open(390, false));
  const sec2 = pg.getByRole('region', { name: 'Connecting the dots' });
  check(`control: focus at random — nothing holds (${(await sec2.innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 160)})`, await sec2.locator('.cd-list li').count() === 0 && /Nothing holds yet/.test(await sec2.innerText()));
  await ctx.close();
  console.log('errors: ' + JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH ' + e.message); process.exit(1); });
