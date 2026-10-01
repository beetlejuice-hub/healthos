const { chromium, APP, OUT, handle } = require('./harness.cjs');
// Owner's 1 Oct list: log earlier, drinks in search, make your own food, supplements running low/out,
// weight chart, today's chips and next answer, caffeine traces.
(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  await ctx.route(/openfoodfacts\.org/, r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ hits: [] }) }));
  const pg = await ctx.newPage();
  await pg.clock.install({ time: new Date(2026, 9, 1, 15, 0) });
  pg.on('dialog', (d) => d.accept());
  pg.on('pageerror', e => errs.push('pageerror: ' + e.message));
  pg.on('console', m => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');

  await pg.goto(APP + '#today'); await pg.waitForTimeout(200);
  check('Today shows five chips with what\'s missing', await pg.locator('.daychips button').count() === 5 && /5 taps to complete/.test(await pg.locator('.daychips').innerText()));
  check('Today shows the next answer it\'s working towards', /Next answer[\s\S]*needs/i.test(await pg.locator('.nextanswer').innerText()));

  // It's 15:00; log the 11:00 coffee from the sentence.
  await pg.goto(APP + '#log/food');
  await pg.getByLabel('Type what you ate').fill('coffee at 11'); await pg.getByRole('button', { name: 'Add', exact: true }).click();
  check('"coffee at 11" sets the time to 11:00', await pg.locator('.basket input[type=time]').inputValue() === '11:00');
  await pg.locator('.basket').getByRole('button', { name: 'Log it' }).click(); await pg.waitForTimeout(150);
  check('logged at 11:00', /11:00 · 95 mg caffeine/.test(await pg.locator('text=Logged today').locator('..').innerText()));
  // Drink tab: one tap for "1 h ago".
  await pg.goto(APP + '#log/drink'); await pg.getByRole('button', { name: '1 h ago' }).click();
  check('"1 h ago" sets 14:00', await pg.locator('input[type=time]').first().inputValue() === '14:00');
  await pg.getByLabel('Find a drink').fill('espr');
  check('drinks are searchable', await pg.locator('.drinks button').count() === 2);
  // Drinks in the food search.
  await pg.goto(APP + '#log/food'); await pg.getByLabel('Search food').fill('beer'); await pg.waitForTimeout(500);
  check('food search also lists drinks', /Beer 500 ml/.test(await pg.locator('h3:has-text("Drinks") + .list').innerText()));

  // Make your own food from ingredients.
  await pg.getByLabel('Search food').fill('');
  await pg.getByRole('button', { name: '+ Make your own food' }).click();
  await pg.getByLabel('Type what you ate').fill('200g chicken breast cooked, 1 bowl rice, 1 tbsp olive oil'); await pg.getByRole('button', { name: 'Add', exact: true }).click();
  await pg.getByRole('button', { name: 'Save as a meal…' }).click();
  await pg.getByLabel('Meal name').fill('Chicken rice bowl'); await pg.getByLabel('Makes how many pieces?').fill('2'); await pg.getByRole('button', { name: 'Save meal' }).click();
  check('your own food saved, counted in portions', /Chicken rice bowl[\s\S]*2 pieces/.test(await pg.locator('.basket').innerText()));

  // Supplements: running low → reminder → ran out → restocked.
  await pg.goto(APP + '#log/stack'); await pg.locator('.supp-row').filter({ hasText: 'Saffron' }).getByRole('button', { name: 'Edit' }).click();
  await pg.getByRole('button', { name: 'Running low' }).click(); await pg.getByRole('button', { name: 'Done' }).click();
  check('row says running low', /running low/.test(await pg.locator('.supp-row').filter({ hasText: 'Saffron' }).innerText()));
  await pg.goto(APP + '#today'); await pg.waitForTimeout(200);
  check('Today reminds to buy more', await pg.getByText('Running low: Saffron').count() === 1);
  await pg.getByRole('button', { name: "It's out" }).click(); await pg.waitForTimeout(100);
  check('then: out of Saffron, Restocked button', await pg.getByText('Out of Saffron').count() === 1);
  await pg.getByRole('button', { name: 'Restocked' }).click(); await pg.waitForTimeout(100);
  check('restocked clears it', await pg.getByText(/Out of Saffron|Running low/).count() === 0);

  // Weight chart.
  await pg.goto(APP + '#log/body'); await pg.getByLabel('kg', { exact: true }).fill('80.2'); await pg.getByRole('button', { name: 'Log weight' }).click();
  await pg.clock.fastForward('24:00:00'); await pg.goto(APP + '#log/body'); await pg.getByLabel('kg', { exact: true }).fill('80.0'); await pg.getByRole('button', { name: 'Log weight' }).click(); await pg.waitForTimeout(150);
  check('Body tab draws the weight chart', await pg.locator('.wchart svg').count() === 1 && /trend line appears after 8 weigh-ins/.test(await pg.locator('.wchart').innerText()));
  await pg.screenshot({ path: OUT + 'round-body.png', fullPage: true });

  // The next day: yesterday's coffee is gone (under 10 mg counts as none), not "5 mg" or "a trace".
  await pg.goto(APP + '#today'); await pg.waitForTimeout(200);
  const cafCard = await pg.locator('.card').filter({ hasText: 'Caffeine' }).first().innerText();
  check('a day-old coffee reads as none', /none now/i.test(cafCard) && !/trace|\b[1-9] mg now/i.test(cafCard));
  await pg.screenshot({ path: OUT + 'round-today.png', fullPage: true });
  console.log('errors:', JSON.stringify(errs));
  await b.close();
})().catch(e => { console.log('CRASH', e.message); process.exit(1); });
