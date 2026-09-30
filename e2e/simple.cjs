const { chromium, APP, OUT, handle } = require('./harness.cjs');
// Simple logging: type a meal, count it, save a meal; feelings log only what you touch;
// forgotten workouts end themselves.
(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  await ctx.route(/openfoodfacts\.org/, r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ hits: [] }) }));
  const pg = await ctx.newPage();
  await pg.clock.install({ time: new Date(2026, 8, 30, 12, 0) });
  pg.on('pageerror', e => errs.push('pageerror: ' + e.message));
  pg.on('console', m => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');

  // Food: the owner's sentence.
  await pg.goto(APP + '#log/food');
  await pg.getByLabel('Type what you ate').fill('2 scrambled eggs, toast, an apple');
  await pg.getByRole('button', { name: 'Add', exact: true }).click();
  const basket = () => pg.locator('.basket').innerText();
  check('sentence fills the meal: 2 eggs, 1 slice, 1 apple', /Scrambled eggs[\s\S]*2 eggs[\s\S]*Toast[\s\S]*1 slice[\s\S]*Apple[\s\S]*1 apple/.test(await basket()));
  await pg.getByRole('button', { name: 'More Scrambled eggs' }).click();
  check('+ makes it 3 eggs', /3 eggs/.test(await basket()));
  const total = (await basket()).match(/≈ (\d+) kcal · P/)[1];
  check('≈ total rounded to 10', Number(total) % 10 === 0 && Number(total) > 300 && Number(total) < 500);
  await pg.screenshot({ path: OUT + 'simple-basket.png', fullPage: true });
  await pg.getByRole('button', { name: 'Log 3 foods' }).click(); await pg.waitForTimeout(200);
  const log = await pg.locator('text=Logged today').locator('..').innerText();
  check('log shows counted amounts', /3 eggs · ≈/.test(log) && /1 slice · ≈/.test(log) && /1 apple · ≈/.test(log));
  check('one undo for the whole meal', await pg.getByRole('status').filter({ hasText: /Logged 3 foods, ≈\d+ kcal/ }).count() === 1);

  // Save a meal, then log it by count.
  await pg.getByLabel('Type what you ate').fill('4 scrambled eggs, 2 slices of toast'); await pg.getByRole('button', { name: 'Add', exact: true }).click();
  await pg.getByRole('button', { name: 'Save as a meal…' }).click();
  await pg.getByLabel('Meal name').fill("Arnold's special"); await pg.getByLabel('Makes how many pieces?').fill('4');
  await pg.getByRole('button', { name: 'Save meal' }).click();
  check('saved meal replaces the basket as 4 pieces', /Arnold's special[\s\S]*4 pieces/.test(await basket()));
  await pg.locator('.bline button.x').click();
  await pg.getByLabel('Type what you ate').fill("3 arnold's special"); await pg.getByRole('button', { name: 'Add', exact: true }).click();
  check('typing "3 arnold\'s special" finds it', /Arnold's special[\s\S]*3 pieces/.test(await basket()));
  await pg.locator('.bline button.x').click();
  await pg.getByLabel('Type what you ate').fill('milk'); await pg.getByRole('button', { name: 'Add', exact: true }).click();
  check('unsure match asks "did you mean"', /Did you mean/.test(await basket()));
  await pg.getByLabel('Type what you ate').fill('zzqx'); await pg.getByRole('button', { name: 'Add', exact: true }).click();
  check('unknown food is said', await pg.getByText(/Couldn't find “zzqx”/).count() === 1);
  await pg.reload(); await pg.waitForTimeout(400);
  check('basket survives a reload', /Milk/.test(await basket()));

  // Feelings: only what you touch.
  await pg.goto(APP + '#today'); await pg.waitForTimeout(200);
  const stress = pg.getByLabel('stress'); await stress.scrollIntoViewIfNeeded();
  const box = await stress.boundingBox();
  await pg.mouse.click(box.x + box.width * 0.75, box.y + box.height / 2);
  await pg.waitForTimeout(150);
  const feel = await pg.locator('#feel').innerText();
  check('touching stress logs stress', /Stress\s*\n?\s*\d+ · /.test(feel));
  check('energy, mood, focus stay empty', (feel.match(/\ntap\n/g) || []).length === 3);
  await pg.goto(APP + '#log/food'); await pg.waitForTimeout(150);
  const logged = await pg.locator('text=Logged today').locator('..').innerText();
  check('the rating has stress only', /Feeling/.test(logged) && !/energy \d/.test(logged));

  // Workouts end themselves.
  await pg.goto(APP + '#workout'); await pg.getByRole('button', { name: 'Start' }).first().click(); await pg.waitForTimeout(200);
  await pg.getByRole('button', { name: /Log set/ }).first().click(); await pg.waitForTimeout(200);
  await pg.goto(APP + '#today'); await pg.waitForTimeout(200);
  check('Today shows the running workout', /Workout running[\s\S]*last set 12:0\d[\s\S]*ends by itself at 13:0\d/i.test(await pg.locator('.noticed-line.running').innerText()));
  await pg.screenshot({ path: OUT + 'simple-today.png' });
  await pg.clock.fastForward('01:10:00'); await pg.waitForTimeout(300);
  check('an hour after the last set it has ended', await pg.locator('.noticed-line.running').count() === 0);
  await pg.goto(APP + '#workout'); await pg.waitForTimeout(200);
  check('workout tab is back to choosing', await pg.getByRole('button', { name: 'Start' }).count() > 0);
  console.log('errors:', JSON.stringify(errs));
  await b.close();
})().catch(e => { console.log('CRASH', e.message); process.exit(1); });
