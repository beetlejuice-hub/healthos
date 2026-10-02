// Search pass: your brand first inside a group; pasta weighed cooked vs dry changes the numbers.
// (Hungarian → English for USDA runs on the Worker: covered by src/lib/hu.test.ts.)
const { chromium, APP, OUT, handle } = require('./harness.cjs');
const P = (code, name, brand, kcal) => ({ code, product_name: name, brands: [brand], nutriments: { 'energy-kcal_100g': kcal, proteins_100g: 13, carbohydrates_100g: 71, fat_100g: 1.5 } });
const HITS = [P('1', 'Spagetti', 'Colavita', 355), P('2', 'Spagetti', 'Barilla', 359), P('3', 'Spagetti', 'Gyermelyi', 352), P('4', 'Spagetti', 'Auchan', 350)];

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  await ctx.route(/search\.openfoodfacts\.org/, (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ hits: HITS }) }));
  const pg = await ctx.newPage();
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');

  // You've logged Gyermelyi pasta before (a different shape).
  await pg.evaluate(() => {
    const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k) || '{}'), now = Date.now();
    const f = { id: 'off:99', name: 'Fusilli', brand: 'Gyermelyi', per100: { kcal: 356, p: 13, c: 71, f: 1.5 }, source: 'off' };
    s.foods = [f, ...(s.foods || [])];
    s.entries = [...(s.entries || []), ...[1, 2, 3].map((d) => ({ id: `g${d}`, kind: 'food', at: now - d * 86400000, foodId: 'off:99', name: 'Fusilli', grams: 100, macros: { kcal: 356, p: 13, c: 71, f: 1.5 } }))];
    localStorage.setItem(k, JSON.stringify(s));
  });
  await pg.reload(); await pg.waitForSelector('text=Settings');
  await pg.goto(APP + '#log/food'); await pg.fill('input[type=search]', 'spagetti'); await pg.waitForTimeout(1000);
  const row = pg.locator('h3:has-text("Food database") + .list > .li').first();
  await row.getByRole('button', { name: /products/ }).click(); await pg.waitForTimeout(200);
  const first = await pg.locator('.sublist .li').first().innerText();
  check(`your brand first among the products (${first.split('\n')[0]})`, /Gyermelyi/.test(first));

  // Dry pasta from the everyday list → switch to cooked.
  await pg.fill('input[type=search]', 'pasta dry'); await pg.waitForTimeout(400);
  await pg.locator('.li', { hasText: 'Pasta, dry' }).first().locator('span').first().click(); await pg.waitForTimeout(200);
  const sw = pg.getByRole('group', { name: /Pasta, dry weighed/ });
  check('pasta line asks: weighed dry or cooked (dry selected)', await sw.getByRole('button', { name: 'dry' }).getAttribute('aria-pressed') === 'true');
  const kcalOf = async () => Number((await pg.locator('.bline').first().innerText()).match(/≈\s*([\d,]+)\s*kcal/)[1].replace(',', ''));
  const dry = await kcalOf();
  await sw.getByRole('button', { name: 'cooked' }).click(); await pg.waitForTimeout(200);
  const line = await pg.locator('.bline').first().innerText(), cooked = await kcalOf();
  check(`switching to cooked: same weight, ~2.25× fewer kcal (${dry} → ${cooked})`, /Pasta, cooked/.test(line) && cooked < dry / 2 && cooked > dry / 2.6);
  await pg.screenshot({ path: OUT + 'searchpass-cooked.png', fullPage: false });

  // Owner, 2 Oct: "1 cooked salmon, 2 slices of bread" came out as cod + raw salmon, 420 kcal.
  for (let i = await pg.locator('.bline button.x').count(); i > 0; i--) await pg.locator('.bline button.x').first().click();
  await pg.getByLabel('Type what you ate').fill('1 cooked salmon, 2 slices of bread'); await pg.getByRole('button', { name: 'Add', exact: true }).click();
  await pg.waitForTimeout(300);
  const lines = await pg.locator('.bline').allInnerTexts();
  check(`cooked salmon is one cooked line, ~220 kcal for a fillet (${lines.map((l) => l.split('\n')[0]).join(' | ')})`, lines.length === 2 && /Salmon, cooked/.test(lines[0]) && /≈\s*2[0-3]\d\s*kcal/.test(lines[0]) && !/Cod/.test(lines.join()));
  await pg.screenshot({ path: OUT + 'searchpass-salmon.png', fullPage: false });
  console.log('errors:', JSON.stringify(errs));
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
