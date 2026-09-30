const { chromium, APP, OUT, handle } = require('./harness.cjs');

const P = (code, name, brand, kcal, p, c, f, img) => ({ code, product_name: name, brands: brand ? [brand] : [], image_front_small_url: img ? `https://images.openfoodfacts.org/images/products/${code}/front.100.jpg` : undefined, nutriments: { 'energy-kcal_100g': kcal, proteins_100g: p, carbohydrates_100g: c, fat_100g: f } });
const HITS = [
  P('1', 'Spagetti', 'Colavita', 375, 14, 72, 1.5, true), P('2', 'Spagetti', 'Myllyn paras', 353, 13, 70, 1.5, true), P('3', 'Spagetti', '', 358, 15, 70, 1.5),
  P('4', 'Spagetti', "D'Antelli", 360, 13, 72, 1.5, true), P('5', 'spagetti', 'Essential Everyday', 357, 13, 71, 1.5), P('6', 'Spagetti', 'Albhof', 368, 6, 80, 1.5),
  P('7', 'Spagetti', 'Auchan', 349, 12, 70, 1.5), P('8', 'Spaghetti', 'Combino', 350, 13, 70, 1.5, true), P('9', 'Spagetti', 'Ragu', 3570, 13, 71, 1.5),
  P('10', 'Spagetti Bolognese', "Lute n' Easy", 105, 7, 12, 3), P('11', 'Thin spagetti', 'Barilla', 359, 13, 71, 2),
];
(async () => {
  const b = await chromium.launch(); const errs = []; const out = OUT;
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await ctx.route(/images\.openfoodfacts\.org/, r => r.fulfill({ status: 200, contentType: 'image/png', body: png }));
  await ctx.route(/search\.openfoodfacts\.org/, r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ hits: HITS }) }));
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errs.push('pageerror: ' + e.message));
  pg.on('console', m => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');

  await pg.goto(APP + '#log/food'); await pg.fill('input[type=search]', 'spagetti'); await pg.waitForTimeout(1000);
  check('everyday pasta answers the Hungarian spelling', await pg.getByText('Pasta, dry').count() === 1);
  const rows = pg.locator('h3:has-text("Food database") + .list > .li');
  check('11 products become 3 rows', await rows.count() === 3);
  const first = await rows.first().innerText();
  check('first row is the typical spaghetti', /Spagetti/.test(first) && /typical · 358 kcal/.test(first) && /9 products/.test(first));
  check('brand spread shown', /brands 349–375/.test(first));
  await pg.screenshot({ path: out + 's-grouped.png', fullPage: true });
  await rows.first().getByRole('button', { name: /9 products/ }).click();
  check('products open under the row', await pg.locator('.sublist .li').count() === 9);
  check('bad label flagged and last', /Ragu[\s\S]*label doesn't add up/.test(await pg.locator('.sublist .li').last().innerText()));
  check('product photos load', await pg.locator('.sublist img').count() === 4);
  await pg.screenshot({ path: out + 's-open.png', fullPage: true });

  // Pick the typical row: it lands in the meal; open it to correct the values and weigh it.
  await rows.first().locator('span').first().click();
  check('typical spaghetti lands in the meal', /Spagetti/.test(await pg.locator('.basket').innerText()));
  await pg.locator('.bname').first().click();
  check('detail shows typical source', await pg.getByText('typical of 8').count() >= 1);
  await pg.getByRole('button', { name: 'Edit values' }).click();
  await pg.getByLabel('kcal', { exact: true }).fill('350'); await pg.getByLabel('Protein', { exact: true }).fill('12');
  await pg.getByLabel('Grams (exact)').fill('200');
  check('totals use edited values', /700\s*kcal/.test(await pg.locator('.row4.num').innerText()));
  await pg.screenshot({ path: out + 's-edit.png', fullPage: true });
  await pg.getByRole('button', { name: 'Done' }).click();
  await pg.locator('.basket').getByRole('button', { name: 'Log it' }).click(); await pg.waitForTimeout(200);
  check('logged with edited kcal', /700 kcal/.test(await pg.locator('text=Logged today').locator('..').innerText()));
  await pg.fill('input[type=search]', 'spag'); await pg.waitForTimeout(300);
  check('your corrected version comes back first', /your values · 350 kcal/.test(await pg.locator('h3:has-text("Your foods") + .list').innerText()));

  // A brand you type stays its own row, at the top.
  await pg.fill('input[type=search]', 'combino spagetti'); await pg.waitForTimeout(1000);
  check('typed brand is first', /Combino/.test(await rows.first().innerText()));
  console.log('errors:', JSON.stringify(errs));
  await b.close();
})().catch(e => { console.log('CRASH', e.message); process.exit(1); });
