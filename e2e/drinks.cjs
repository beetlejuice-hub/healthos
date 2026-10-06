// Drink tab: search-first, with the online food database behind it (owner, 1 Oct: "I NEED THE ONLINE
// SEARCHABLE DATABASE LIKE FOR FOODS… DO NOT FILL THE SCREEN W THE OPTIONS").
const { chromium, APP, OUT, handle } = require('./harness.cjs');

const P = (code, name, brand, kcal, c, extra = {}) => ({ code, product_name: name, brands: brand ? [brand] : [], serving_quantity: extra.serving, nutriments: { 'energy-kcal_100g': kcal, proteins_100g: 0, carbohydrates_100g: c, fat_100g: 0, ...(extra.caf != null ? { caffeine_100g: extra.caf } : {}) } });
const DB = {
  sprite: [P('5449000014535', 'Sprite 0,5 l', 'Sprite', 19, 4.5), P('5449000134264', 'Sprite Zero', 'Sprite', 1, 0)],
  monster: [P('5060337500401', 'Monster Energy', 'Monster', 47, 11, { caf: 0.032, serving: 500 })],
};
(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  await ctx.route(/search\.openfoodfacts\.org/, (r) => {
    const q = new URL(r.request().url()).searchParams.get('q') || '';
    const hits = Object.entries(DB).filter(([k]) => q.toLowerCase().includes(k)).flatMap(([, v]) => v);
    r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ hits }) });
  });
  await ctx.route(/world\.openfoodfacts\.org/, (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ products: [] }) }));
  const pg = await ctx.newPage();
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');

  await pg.goto(APP + '#log/drink'); await pg.waitForTimeout(200);
  check('empty search shows no wall of drinks', await pg.locator('.drinks button').count() === 0);
  await pg.screenshot({ path: OUT + 'drink-empty.png', fullPage: true });

  await pg.getByLabel('Find a drink').fill('sprite'); await pg.waitForTimeout(900);
  const rows = pg.locator('.drinkdb .dbrow');
  check('Sprite comes from the online database', await rows.count() === 2 && /Sprite 0,5 l/.test(await rows.first().innerText()));
  check('per 100 ml shown, no caffeine for Sprite', /19 kcal \/ 100 ml/.test(await rows.first().innerText()) && !/caffeine/.test(await rows.first().innerText()));
  await rows.first().click();
  const sizes = pg.locator('.sizes .pill-btn');
  check('label size offered first: 500 ml = 95 kcal', /500 ml\s*95 kcal/.test(await sizes.first().innerText()));
  await pg.screenshot({ path: OUT + 'drink-sprite.png', fullPage: true });
  await sizes.first().click(); await pg.waitForTimeout(200);
  check('logged', await pg.getByText(/Logged Sprite 0,5 l/).count() > 0);

  check('then it is under Recent, one tap to log again', /Sprite 0,5 l/.test(await pg.locator('.drinks').innerText()) && await pg.locator('.drinks button').count() === 1);

  await pg.getByLabel('Find a drink').fill('monster'); await pg.waitForTimeout(900);
  const m = pg.locator('.drinkdb .dbrow').first();
  check('caffeine from the label', /32 mg caffeine \/ 100 ml/.test(await m.innerText()) && !/typical/.test(await m.innerText()));
  await m.click();
  check('500 ml can = 160 mg caffeine', /500 ml\s*235 kcal · 160 mg/.test(await pg.locator('.sizes .pill-btn').first().innerText()));

  await pg.goto(APP + '#today'); await pg.waitForTimeout(200);
  check('Today counts the drink\'s kcal', /\b95\b/.test(await pg.locator('#fuel').innerText()) || /95/.test(await pg.locator('body').innerText()));
  console.log('errors:', JSON.stringify(errs));
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
