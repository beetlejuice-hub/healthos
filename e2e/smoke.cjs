// Cigarettes, one question a day (PLAN 177; owner, 27 Oct: "cigarettes lets do B" — "i may not log them immediately").
// Always about yesterday (PLAN 201; owner, 9 Nov: "it should ask abput yesterday, always"). 09:00: Today asks "Cigarettes
// yesterday?"; 3–5 keeps an answer on yesterday; the card goes; Undo brings it back; answered again it stays answered.
// Logged says it in words. The afternoon still asks when it wasn't answered. Controls: 21:30 with yesterday answered asks
// nothing — never "today?"; 02:00, the night, asks nothing.
const { chromium, APP, OUT, handle, tables, forYou } = require('./harness.cjs');

const KEY = 'healthos.v1:u-test';

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  async function open(time, seed = []) {
    tables.entries.clear(); tables.docs.clear();
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    await ctx.route('**/api/ai**', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' }));
    const pg = await ctx.newPage();
    await pg.clock.install({ time: new Date(time).getTime() });
    pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
    await pg.goto(APP);
    await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
    await pg.evaluate(([k, seed]) => { const s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = seed; localStorage.setItem(k, JSON.stringify(s)); }, [KEY, seed]);
    await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('.t2-head'); await pg.waitForTimeout(500);
    await forYou(pg, 'smoke');
    return { ctx, pg };
  }
  const answers = (pg) => pg.evaluate((k) => JSON.parse(localStorage.getItem(k)).entries.filter((e) => e.kind === 'answer' && e.key.startsWith('smoke:')).map((e) => `${e.key}=${e.answer}`), KEY);
  const card = (pg) => pg.getByRole('region', { name: 'Cigarettes' });

  // 1 · the morning
  let { ctx, pg } = await open('2026-10-28T09:00:00');
  const t = (await card(pg).innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(`09:00: Today asks about yesterday, one tap (${t})`, /^Cigarettes yesterday\? None 1–2 3–5 6\+ Don't remember$/i.test(t));
  check(`fits the phone (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
  await card(pg).evaluate((e) => e.scrollIntoView({ block: 'center' })); await card(pg).screenshot({ path: OUT + 'smoke-ask.png' });
  await card(pg).getByRole('button', { name: '3–5' }).click(); await pg.waitForTimeout(300);
  let a = []; for (let i = 0; i < 20 && !a.length; i++) { a = await answers(pg); await pg.waitForTimeout(100); }
  check(`3–5 kept on yesterday (${a.join(', ')})`, a.join() === 'smoke:2026-10-27=3-5');
  check('the card is gone', await card(pg).count() === 0);
  await pg.getByRole('button', { name: 'Undo' }).click({ timeout: 2000 }).catch(() => {}); await pg.waitForTimeout(300);
  check(`Undo takes it back and asks again (${(await answers(pg)).join(', ') || 'none'})`, (await answers(pg)).length === 0 && await card(pg).count() === 1);
  await card(pg).getByRole('button', { name: 'None' }).click(); await pg.waitForTimeout(300);
  // the answer is kept on yesterday at 21:00: Logged shows that day's, so look on the 27th
  await pg.clock.setFixedTime(new Date('2026-10-27T22:00:00').getTime()); await pg.goto(APP + '#log'); await pg.reload(); await pg.waitForTimeout(600);
  const row = (await pg.locator('.li', { hasText: 'Cigarettes' }).first().innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(`Logged says it in words (${row})`, /^Cigarettes 21:00 · None/.test(row));
  await pg.clock.setFixedTime(new Date('2026-10-28T21:30:00').getTime()); await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('#feel'); await pg.waitForTimeout(300);
  check('control: 21:30, yesterday answered — nothing asked, never "today?"', await card(pg).count() === 0);
  await ctx.close();

  // 2 · the afternoon, not answered: still asks; 3 · the night: nothing
  ({ ctx, pg } = await open('2026-10-28T15:00:00'));
  const m = (await card(pg).innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(`the afternoon, not answered: still asks about yesterday (${m})`, /^Cigarettes yesterday\?/i.test(m));
  await ctx.close();
  ({ ctx, pg } = await open('2026-10-28T02:00:00'));
  check('control: 02:00, the night — nothing asked', await card(pg).count() === 0);
  await ctx.close();
  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
