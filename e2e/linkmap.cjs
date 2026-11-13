// What goes with what, as a map (renovation part 3; owner, 13 Nov, on the canvas: "i like A, b is okay but i want these
// things listed not me picking · c is hard to read"). 110 days planted: each drink goes with focus 0.6 lower the next
// day, focus slipping over the months, and more drinks in the last 30 days. Insights → Findings: drinks on the left, focus
// on the right marked slipping, a red line between; tapping drinks shows only its links in words; focus's bars listed with
// drinks on the worse side. Insights' landing: "What to look at" says focus is slipping and drinks go with it, more lately.
// Control: focus at random — no map, nothing to look at. Fits 390.
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
        const focus = planted ? 7.6 - 1.6 * (1 - i / 110) - 0.6 * prev + g() * 0.6 : 6 + g() * 1.2;
        s.entries.push({ id: 'm' + i, kind: 'feel', at: day0 + 15 * 36e5, mood: Math.round(6 + g()), energy: Math.round(6 + g()), stress: Math.round(4 + g()), focus: Math.round(Math.max(1, Math.min(10, focus))) });
        s.entries.push({ id: 'f' + i, kind: 'food', at: day0 + 13 * 36e5, name: 'Lunch', grams: 500, macros: { kcal: 2200, p: Math.round(90 + r() * 80), c: 250, f: 70 } });
        prev = Math.min(3, Math.floor(r() * 4) + (planted && i <= 31 && r() < 0.6 ? 1 : 0));
        for (let k = 0; k < prev; k++) s.entries.push({ id: `b${i}-${k}`, kind: 'drink', at: day0 + (20 + k) * 36e5, name: 'Wine', ml: 150, caffeineMg: 0, alcoholG: 14, kcal: 120 });
      }
      localStorage.setItem(k, JSON.stringify(s));
    }, [KEY, NOW, D, planted]);
    await pg.goto(APP + '#insights/connections'); await pg.reload();
    await pg.getByRole('region', { name: 'Connecting the dots' }).waitFor({ timeout: 15000 }).catch(() => {});
    return { ctx, pg };
  }

  let { ctx, pg } = await open(390, true);
  const map = pg.getByRole('region', { name: 'The map: what goes with what' });
  await map.waitFor({ timeout: 10000 }).catch(() => {});
  check('the map: drinks on the left, focus on the right marked slipping', await map.locator('[data-node="drinks"]').count() === 1 && await map.locator('[data-node="focus"]').getAttribute('data-tone').catch(() => '') === 'worse');
  check('…a red line between them', await map.locator('[data-edge="drinks>focus"] .lm-edge.bad').count() === 1);
  await map.locator('[data-node="drinks"]').click();
  const said = (await map.locator('.lm-list').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  check(`tap drinks: only its links, in words (${said})`, await map.locator('[data-node="drinks"]').getAttribute('aria-pressed') === 'true' && /^Each drink goes with focus [\d.]+ lower the next day\./.test(said));
  const row = map.locator('.lm-out[data-outcome="focus"] [data-row="drinks"] .lm-dot');
  check('focus listed with its bars, drinks on the worse side', await row.count() === 1 && /bad/.test(await row.getAttribute('class')));
  check(`390: fits (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
  await map.screenshot({ path: OUT + 'linkmap.png' });
  // Insights' landing: what to look at
  await pg.goto(APP + '#insights'); await pg.reload();
  const look = pg.getByRole('region', { name: 'What to look at' });
  await look.waitFor({ timeout: 10000 }).catch(() => {});
  const lt = (await look.locator('.la-say').innerText().catch(() => '')).trim();
  check(`landing: focus is slipping, drinks go with it, more lately (${lt})`, /^Focus is slipping \([\d.]+ → [\d.]+ over 90 days\)\. One thing you do goes with lower focus: drinks, the next day\. Lately: more drinks, the last 30 days against the 30 before\.$/.test(lt));
  await look.screenshot({ path: OUT + 'lookat.png' }).catch(() => {});
  await ctx.close();

  ({ ctx, pg } = await open(390, false));
  await pg.waitForTimeout(800);
  check('control: focus at random — no map', await pg.getByRole('region', { name: 'The map: what goes with what' }).count() === 0);
  await pg.goto(APP + '#insights'); await pg.reload(); await pg.waitForTimeout(1500);
  check('control: nothing to look at', await pg.getByRole('region', { name: 'What to look at' }).count() === 0);
  await ctx.close();
  console.log('errors: ' + JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH ' + e.message.split('\n')[0]); process.exit(1); });
