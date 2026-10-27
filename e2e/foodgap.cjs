// Days not logged, asked about once (PLAN 174; owner, 27 Oct: "i had this weekend skipped fully... make sure app can still
// assume some things or recognize that im not logging anything, that means im still eating, and living just not logging"
// — "2 yes"). Monday 26 Oct, 09:00: weekdays logged at ~2,300 with the usual lunch and dinner, the weekend not (a coffee on
// Saturday). Today asks once about Sat–Sun — not three meal rows for Sunday as well; "More" keeps an answer on each day,
// the card goes, Undo brings it back. A control week with the weekend logged asks nothing.
const { chromium, APP, OUT, handle, tables } = require('./harness.cjs');

const NOW = new Date('2026-10-26T09:00:00').getTime(), D = 864e5, KEY = 'healthos.v1:u-test';

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  for (const control of [false, true]) {
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
    await pg.evaluate(([k, now, D, control]) => { const s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = []; s.supplements = [];
      for (let i = 28; i >= 1; i--) {
        const at = now - i * D, wd = new Date(at).getDay(), day0 = new Date(new Date(at).setHours(0, 0, 0, 0)).getTime();
        if (wd !== 0 && wd !== 6 || control) { s.entries.push({ id: 'l' + i, kind: 'food', at: day0 + 12.5 * 36e5, name: 'Lunch', grams: 500, macros: { kcal: 1000, p: 60, c: 100, f: 30 } }, { id: 'd' + i, kind: 'food', at: day0 + 19 * 36e5, name: 'Dinner', grams: 600, macros: { kcal: 1300, p: 70, c: 120, f: 40 } }); }
        else if (wd === 6) s.entries.push({ id: 'c' + i, kind: 'drink', at: day0 + 9 * 36e5, name: 'Coffee', ml: 250, caffeineMg: 95, alcoholG: 0, kcal: 2 });
      }
      localStorage.setItem(k, JSON.stringify(s)); }, [KEY, NOW, D, control]);
    await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('#feel'); await pg.waitForTimeout(600);
    const card = pg.getByRole('region', { name: 'Days not logged' });
    if (control) { check('control: the weekend logged — nothing asked', await card.count() === 0); await ctx.close(); continue; }
    const t = (await card.innerText().catch(() => '')).replace(/\s+/g, ' ');
    check(`Today asks once about the weekend, against the usual day (${t})`, /^Not logged Sat 24 – Sun 25 Oct How did you eat\? Kept as a guess — your usual day \(2,300 kcal\) and your goal leave these days out either way\. As usual More Less Not sure · Log them instead$/i.test(t));
    const meals = await pg.locator('#catchup .cu-row[data-kind=meal]').count();
    check(`…not meal by meal for Sunday as well (${meals} meal rows)`, meals === 0);
    check(`fits the phone (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
    await card.evaluate((e) => e.scrollIntoView({ block: 'center' })); await pg.waitForTimeout(200);
    await pg.screenshot({ path: OUT + 'foodgap-ask.png' });
    await card.getByRole('button', { name: 'More' }).click(); await pg.waitForTimeout(300);
    const said = async () => (await pg.evaluate((k) => JSON.parse(localStorage.getItem(k)).entries, KEY)).filter((e) => e.kind === 'answer' && e.key.startsWith('ate:')).map((e) => `${e.key}=${e.answer}`).sort();
    let a = []; for (let i = 0; i < 20 && a.length < 2; i++) { a = await said(); await pg.waitForTimeout(100); }
    check(`"More" kept on each day, as a guess — not as food (${a.join(', ')})`, a.join() === 'ate:2026-10-24=more,ate:2026-10-25=more');
    check('the card is gone', await card.count() === 0);
    await pg.getByRole('button', { name: 'Undo' }).click({ timeout: 2000 }).catch(() => {}); await pg.waitForTimeout(300);
    check(`Undo takes them back and asks again (${(await said()).join(', ') || 'none'})`, (await said()).length === 0 && await card.count() === 1);
    await ctx.close();
  }
  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
