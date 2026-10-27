// A food's score where you tap it (owner, 27 Oct: "CAN WE IMPLEMENT THE FOOD SCORING SYSTEM? FOR each food if i click on it it
// should show the score - based on how much macro it has, and how good it is for my goal" — "3c": in the search results and
// on a logged food). Log → Food at 13:00: searching "chicken" shows each food's score; a tap on the score says why and
// doesn't add it; a tap on the row adds it. Logged today → tapping the logged pizza shows its score and why with its values.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

const NOW = new Date('2026-10-20T13:00:00').getTime(), KEY = 'healthos.v1:u-test';

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  await ctx.route(/search\.openfoodfacts\.org|\/api\/food/, (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ hits: [], foods: [], sources: { off: 'ok', usda: 'ok' } }) }));
  const pg = await ctx.newPage();
  await pg.clock.install({ time: NOW });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  await pg.evaluate(([k, now]) => { const s = JSON.parse(localStorage.getItem(k) || '{}');
    s.entries = [{ id: 'pz', kind: 'food', at: now - 3600e3, foodId: 'basic:pizza-margherita', name: 'Pizza margherita', grams: 300, macros: { kcal: 798, p: 33, c: 99, f: 30 } }]; s.foods = [];
    localStorage.setItem(k, JSON.stringify(s)); }, [KEY, NOW]);
  await pg.goto(APP + '#log/food'); await pg.reload(); await pg.waitForSelector('input[type=search]');
  await pg.fill('input[type=search]', 'chicken'); await pg.waitForTimeout(800);
  const row = pg.locator('.li.tap', { hasText: 'Chicken breast, cooked' }).first();
  const chip = row.getByRole('button', { name: /score/ });
  check(`search: each food shows its score — chicken breast at lunch (${await chip.innerText().catch(() => 'none')})`, (await chip.innerText().catch(() => '')).trim() === '100');
  await chip.click(); await pg.waitForTimeout(200);
  const why = (await row.locator('.fd-why').innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(`a tap on it says why (${why})`, /For your goal 45\/45 .*protein per 100 kcal/.test(why) && /Quality 35\/35 Nutri-Score A/.test(why) && /Timing 20\/20 3 h or more before bed/.test(why));
  check('…and doesn\'t add it', (await pg.locator('.basket').count()) === 0);
  await row.screenshot({ path: OUT + 'foodtap-search.png' });
  check(`fits the phone (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
  await row.locator('> span').first().click({ position: { x: 20, y: 10 } }); await pg.waitForTimeout(300); // its name (a tap on the open why doesn't add)
  check('a tap on the row adds it, as before', (await pg.locator('.basket').count()) === 1 && /Chicken breast/.test(await pg.locator('.basket').innerText()));

  // a logged food: tap it, its score and why
  const logged = pg.getByRole('button', { name: /^Change Pizza margherita/ });
  await logged.scrollIntoViewIfNeeded(); await logged.click(); await pg.waitForTimeout(300);
  const item = logged.locator('xpath=..');
  const sc = (await item.locator('.fd-why').innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(`Logged today: tapping the pizza shows its score and why, with its values (${sc})`, /^Score 4\d For your goal/.test(sc) && /Quality 8\.8\/35 Nutri-Score D/.test(sc) && await item.locator('.entry-edit').count() === 1);
  await item.screenshot({ path: OUT + 'foodtap-logged.png' });
  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
