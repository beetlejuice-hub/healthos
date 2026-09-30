const { chromium, APP, OUT, handle } = require('./harness.cjs');
(async () => {
  const b = await chromium.launch(); const errs = []; const out = OUT;
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  await ctx.route(/openfoodfacts\.org/, r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ hits: [{ code: '599', product_name: 'Zabpehely Brand', brands: ['Brand'], nutriments: { 'energy-kcal_100g': 372, proteins_100g: 13, carbohydrates_100g: 60, fat_100g: 7 } }] }) }));
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errs.push('pageerror: ' + e.message));
  pg.on('console', m => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });

  // A confirmation link must not sign this browser in.
  await pg.goto(APP + '#access_token=tok-u-me&refresh_token=r&type=signup&expires_in=3600');
  await pg.waitForTimeout(800);
  check('confirmation link does not sign in', await pg.getByRole('button', { name: 'Sign in' }).count() === 1);
  check('confirmation link says confirmed', await pg.getByText('Email confirmed. Sign in below.').count() === 1);
  check('tokens are wiped from the address bar', !pg.url().includes('access_token'));

  await pg.fill('input[type=email]', 'lukacsarnold9@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');

  // Usual drink: empty at first, pick one, one-tap log, undo, clear.
  await pg.goto(APP + '#today');
  check('usual drink starts empty', await pg.getByRole('button', { name: '☆ Set usual drink' }).count() === 1);
  await pg.getByRole('button', { name: '☆ Set usual drink' }).click();
  await pg.getByRole('button', { name: /^Red Bull 250 ml/ }).click();
  await pg.getByRole('button', { name: '+ Red Bull 250 ml' }).click(); await pg.waitForTimeout(200);
  check('undo toast appears', await pg.getByRole('status').filter({ hasText: 'Logged Red Bull' }).count() === 1);
  const cafBefore = await pg.locator('.card h3', { hasText: 'Caffeine' }).innerText();
  check(`caffeine card counts the drink (${cafBefore.replace(/\s+/g, ' ')})`, /\b8\d mg now/.test(cafBefore) || /\b[6-8]\d mg now/.test(cafBefore));
  await pg.getByRole('button', { name: 'Undo' }).click(); await pg.waitForTimeout(200);
  check('undo removes it', /0 mg now/.test(await pg.locator('.card h3', { hasText: 'Caffeine' }).innerText()));
  await pg.getByRole('button', { name: /Clear usual drink/ }).click();
  check('✕ clears the usual drink', await pg.getByRole('button', { name: '☆ Set usual drink' }).count() === 1);

  // Scrub the curve: log a drink, hover the curve, read a label.
  await pg.getByRole('button', { name: '☆ Set usual drink' }).click(); await pg.getByRole('button', { name: /^Espresso/ }).first().click();
  await pg.getByRole('button', { name: '+ Espresso' }).click(); await pg.waitForTimeout(200);
  const svg = pg.locator('svg[aria-label^="Caffeine in your body"]'); const box = await svg.boundingBox();
  await pg.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.5); await pg.waitForTimeout(150);
  const probe = await svg.locator('text', { hasText: ' mg' }).last().textContent();
  check(`hovering the curve shows time and mg (${probe})`, /^\d\d:\d\d · \d+ mg/.test(probe || ''));
  await pg.screenshot({ path: out + 'f-today.png', fullPage: true });

  // Stack by slot, Took all, then undo.
  const morning = pg.locator('#stack .h', { hasText: 'Morning' });
  check('stack is grouped by slot', await morning.count() === 1 && await pg.locator('#stack .h', { hasText: 'Evening' }).count() === 1);
  await morning.getByRole('button', { name: 'Took all' }).click(); await pg.waitForTimeout(150);
  check('Took all ticks the morning three', /3 of 5 taken/.test(await pg.locator('#stack h3').innerText()));
  await pg.getByRole('button', { name: 'Undo' }).click(); await pg.waitForTimeout(150);
  check('undo unticks them', /0 of 5 taken/.test(await pg.locator('#stack h3').innerText()));

  // Food: built-in everyday food in Hungarian, database result, log, undo.
  await pg.goto(APP + '#log/food'); await pg.fill('input[type=search]', 'csirkemell'); await pg.waitForTimeout(600);
  check('everyday foods answer in Hungarian', await pg.getByText('Chicken breast, cooked').count() === 1);
  await pg.fill('input[type=search]', 'zabpehely'); await pg.waitForTimeout(900);
  check('database results appear', await pg.getByText('Zabpehely Brand').count() === 1);
  await pg.getByText('Oats (zabpehely)').click(); await pg.getByRole('button', { name: 'Log it' }).click(); await pg.waitForTimeout(200);
  check('logged food offers undo', await pg.getByRole('status').filter({ hasText: 'Logged Oats' }).count() === 1);
  await pg.screenshot({ path: out + 'f-log.png', fullPage: true });

  // Settings: no caffeine target / half-life / usual mg fields; planned bedtime is there.
  await pg.goto(APP + '#settings');
  check('settings has planned bedtime', await pg.getByLabel('Planned bedtime').count() === 1);
  check('settings no longer asks for half-life or bedtime target', await pg.getByText(/half-life \(hours\)|Most caffeine at bedtime/).count() === 0);
  await pg.screenshot({ path: out + 'f-settings.png', fullPage: true });
  console.log('errors:', JSON.stringify(errs));
  await b.close();
})().catch(e => { console.log('CRASH', e.message); process.exit(1); });
