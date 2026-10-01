// Barcode scanner: camera opens (fake device), a photo of a real barcode is decoded by the real
// decoder, the product comes from (fake) Open Food Facts, and lands as a drink or a food.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

// 95-module EAN-13 patterns, from src/lib/barcode.ts ean13Modules (zbar reads them in barcode.test.ts).
const BARS = {
  '5449000014535': '10101000110011101001011100011010001101010011101010111001011001101011100100111010000101001110101',
  '7622210449283': '10101011110011011001001100110110011001010011101010101110010111001110100110110010010001000010101',
};
const PRODUCTS = {
  '5449000014535': { code: '5449000014535', product_name: 'Sprite', brands: 'Sprite', quantity: '500 ml', categories_tags: ['en:beverages'], nutriments: { 'energy-kcal_100g': 19, carbohydrates_100g: 4.5, proteins_100g: 0, fat_100g: 0 } },
  '7622210449283': { code: '7622210449283', product_name: 'Milka Alpine Milk', brands: 'Milka', quantity: '100 g', serving_quantity: 25, categories_tags: ['en:snacks'], nutriments: { 'energy-kcal_100g': 539, proteins_100g: 6.6, carbohydrates_100g: 59, fat_100g: 29 } },
};

(async () => {
  const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const errs = [], wasm = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, permissions: ['camera'] });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  await ctx.route(/world\.openfoodfacts\.org\/api\/v2\/product\//, (r) => {
    const code = r.request().url().match(/product\/(\d+)\.json/)[1];
    const p = PRODUCTS[code];
    r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(p ? { status: 1, product: p } : { status: 0 }) });
  });

  // Draw each barcode as a PNG, the way a phone photo would look (white margins, a bit soft).
  const shots = {};
  const draw = await b.newPage({ viewport: { width: 520, height: 300 } });
  for (const [code, bars] of Object.entries(BARS)) {
    const rects = [...bars].map((m, i) => (m === '1' ? `<rect x="${40 + i * 4}" y="40" width="4" height="200"/>` : '')).join('');
    await draw.setContent(`<body style="margin:0;background:#fff"><svg width="520" height="300" style="filter:blur(.6px)"><rect width="520" height="300" fill="#fff"/><g fill="#111">${rects}</g></svg></body>`);
    shots[code] = await draw.screenshot();
  }
  await draw.close();

  const pg = await ctx.newPage();
  pg.on('request', (r) => { if (/zbar/.test(r.url())) wasm.push(r.url()); });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');

  // Food tab: the camera starts; a can photographed goes in as a drink at its label size.
  await pg.goto(APP + '#log/food');
  await pg.getByRole('button', { name: 'Scan a barcode' }).first().click();
  await pg.waitForSelector('.scanner video.on', { timeout: 5000 }).catch(() => {});
  check('camera opens behind the aiming frame', await pg.locator('.scanner video.on').count() === 1 && /Point at the barcode/.test(await pg.locator('.scan-msg').innerText()));
  await pg.screenshot({ path: OUT + 'scan-camera.png' });
  await pg.setInputFiles('input[aria-label="Photo of a barcode"]', { name: 'can.png', mimeType: 'image/png', buffer: shots['5449000014535'] });
  await pg.waitForSelector('.scanner', { state: 'detached', timeout: 8000 }).catch(() => {});
  const basket = await pg.locator('body').innerText();
  check('Sprite photo → decoded → in the meal as a 500 ml drink', /Sprite 500 ml/.test(basket));
  check('camera is released after the scan', await pg.evaluate(() => [...document.querySelectorAll('video')].every((v) => !v.srcObject || v.srcObject.getTracks().every((t) => t.readyState === 'ended'))));

  // A chocolate bar is a food.
  await pg.getByRole('button', { name: 'Scan a barcode' }).first().click();
  await pg.setInputFiles('input[aria-label="Photo of a barcode"]', { name: 'bar.png', mimeType: 'image/png', buffer: shots['7622210449283'] });
  await pg.waitForSelector('.scanner', { state: 'detached', timeout: 8000 }).catch(() => {});
  check('Milka photo → in the meal as a food', /Milka Alpine Milk/.test(await pg.locator('body').innerText()));
  await pg.screenshot({ path: OUT + 'scan-basket.png', fullPage: true });

  // Typed number that isn't in the database: said plainly.
  await pg.getByRole('button', { name: 'Scan a barcode' }).first().click();
  await pg.getByRole('button', { name: 'Type the number' }).click();
  await pg.getByLabel('Barcode number').fill('5998817311128');
  check('a misread number is caught by its check digit', /doesn't check out/.test(await pg.locator('.scanner').innerText()) && await pg.getByRole('button', { name: 'Find' }).isDisabled());
  await pg.getByLabel('Barcode number').fill('5998817311127');
  await pg.getByRole('button', { name: 'Find' }).click();
  await pg.waitForSelector('.scan-note', { timeout: 5000 }).catch(() => {});
  check('unknown product: says so, offers name search', /isn't in Open Food Facts yet/.test(await pg.locator('.scan-note').innerText()));

  // Drink tab: scanned product opens with its sizes, label size first; one tap logs it.
  await pg.goto(APP + '#log/drink');
  await pg.getByRole('button', { name: 'Scan a barcode' }).click();
  await pg.setInputFiles('input[aria-label="Photo of a barcode"]', { name: 'can.png', mimeType: 'image/png', buffer: shots['5449000014535'] });
  await pg.waitForSelector('text=Scanned', { timeout: 8000 }).catch(() => {});
  const first = pg.locator('.sizes .pill-btn').first();
  check('Drink tab: Sprite opens at 500 ml = 95 kcal', (await first.count()) === 1 && /500 ml\s*95 kcal/.test(await first.innerText()));
  await pg.screenshot({ path: OUT + 'scan-drink.png', fullPage: true });
  await first.click(); await pg.waitForTimeout(200);
  check('logged from the scan', await pg.getByText(/Logged Sprite 500 ml/).count() > 0);

  check('decoder loads from our own site, not a CDN', wasm.length > 0 && wasm.every((u) => u.startsWith(APP.replace(/\/#?$/, '').replace(/#.*$/, ''))));
  console.log('errors:', JSON.stringify(errs));
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
