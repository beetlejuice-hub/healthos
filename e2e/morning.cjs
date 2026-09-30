const { chromium, APP, OUT, handle } = require('./harness.cjs');
// A morning: weigh in from Today, breakfast with coffee in one sentence, a quiet stack list.
(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  const pg = await ctx.newPage();
  await pg.clock.install({ time: new Date(2026, 9, 1, 7, 30) });
  pg.on('pageerror', e => errs.push('pageerror: ' + e.message));
  pg.on('console', m => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');

  await pg.goto(APP + '#today'); await pg.waitForTimeout(200);
  check('Today asks for a morning weigh-in', await pg.getByText('Morning weigh-in').count() === 1);
  await pg.getByLabel('Weight in kg').fill('80.4'); await pg.getByRole('button', { name: 'Log kg' }).click(); await pg.waitForTimeout(150);
  check('weighing in clears it, with undo', await pg.getByText('Morning weigh-in').count() === 0 && await pg.getByRole('status').filter({ hasText: 'Logged 80.4 kg' }).count() === 1);
  await pg.screenshot({ path: OUT + 'morning-today.png' });

  await pg.goto(APP + '#log/food');
  await pg.getByLabel('Type what you ate').fill('2 scrambled eggs, toast, 2 coffees'); await pg.getByRole('button', { name: 'Add', exact: true }).click();
  const basket = await pg.locator('.basket').innerText();
  check('coffee lands in the meal as a drink with its caffeine', /Filter coffee[\s\S]*190 mg caffeine[\s\S]*2 ×/.test(basket));
  check('nothing reported as not found', await pg.getByText(/Couldn't find/).count() === 0);
  await pg.screenshot({ path: OUT + 'morning-basket.png' });
  await pg.getByRole('button', { name: 'Log 3 items' }).click(); await pg.waitForTimeout(150);
  const log = await pg.locator('text=Logged today').locator('..').innerText();
  check('coffee logged as a drink', /2 × Filter coffee[\s\S]*190 mg caffeine/.test(log));
  await pg.goto(APP + '#today'); await pg.waitForTimeout(200);
  check('Today counts the caffeine', /mg\s+of caffeine in you/.test(await pg.locator('.sum').innerText()));

  await pg.goto(APP + '#log/stack'); await pg.waitForTimeout(150);
  check('stack is a compact list', await pg.locator('.supp-row').count() === 5 && await pg.getByLabel('Name').count() === 0);
  await pg.locator('.supp-row').first().getByRole('button', { name: 'Edit' }).click();
  await pg.getByLabel('Dose').fill('3 g'); await pg.getByRole('button', { name: 'Done' }).click();
  check('editing one row saves it', /Creatine 3 g/.test(await pg.locator('.supp-row').first().innerText()));
  await pg.getByRole('button', { name: '+ Add supplement' }).click(); await pg.getByRole('button', { name: 'Done' }).click();
  check('an unnamed new supplement is dropped, not left blank', await pg.locator('.supp-row').count() === 5);
  await pg.screenshot({ path: OUT + 'morning-stack.png', fullPage: true });
  console.log('errors:', JSON.stringify(errs));
  await b.close();
})().catch(e => { console.log('CRASH', e.message); process.exit(1); });
