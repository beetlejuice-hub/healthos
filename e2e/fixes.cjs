// Owner's 2 Oct list: exact weight (71,95 stays 71.95), stress shows in the log, a supplement taken
// twice a day (L-theanine with each coffee) is ticked per slot.
const { chromium, APP, OUT, handle, rate } = require('./harness.cjs');

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  const pg = await ctx.newPage();
  await pg.clock.install({ time: new Date('2026-10-02T13:10:00') });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');

  // Weight, typed the Hungarian way.
  await pg.goto(APP + '#log/body'); await pg.getByLabel('kg', { exact: true }).fill('71,95'); await pg.getByRole('button', { name: 'Log weight' }).click(); await pg.waitForTimeout(200);
  check('71,95 is kept as 71.95 kg (not 72)', /71\.95 kg/.test(await pg.locator('body').innerText()) && !/\b72 kg/.test(await pg.locator('body').innerText()));

  // Stress from the feel card shows up in the log line.
  await pg.goto(APP + '#today');
  await rate(pg, 'stress', 6); await pg.waitForTimeout(150);
  await rate(pg, 'mood', 6); await pg.waitForTimeout(150);
  await pg.goto(APP + '#log/food'); await pg.waitForTimeout(200);
  const feelLine = await pg.locator('.li', { hasText: 'Feeling' }).first().innerText();
  check(`the log line shows stress (${feelLine.replace(/\s+/g, ' ')})`, /stress \d/.test(feelLine) && /mood \d/.test(feelLine));

  // L-theanine in two slots.
  await pg.goto(APP + '#log/stack');
  await pg.getByRole('button', { name: '+ Add supplement' }).click();
  await pg.getByLabel('Name').fill('L-theanine'); await pg.getByLabel('Dose').fill('200 mg');
  const slots = pg.getByRole('group', { name: 'When you take it' });
  await slots.getByRole('button', { name: /Midday/ }).click();
  check('two slots on', await slots.locator('[aria-pressed="true"]').count() === 2);
  await pg.screenshot({ path: OUT + 'fix-slots.png', fullPage: true });
  await pg.getByRole('button', { name: 'Done' }).click();
  check('stack row says both times', /L-theanine[\s\S]*Morning 08:00 \+ Midday 13:00/.test(await pg.locator('.supp-row', { hasText: 'L-theanine' }).innerText()));

  await pg.goto(APP + '#today'); await pg.waitForTimeout(200);
  const card = pg.locator('#stack');
  const ticks = card.getByRole('button', { name: 'Took L-theanine' });
  check('Today lists it twice, morning and midday', await ticks.count() === 2);
  await ticks.first().click(); await pg.waitForTimeout(150);
  check('ticking the morning one leaves the midday one open', await card.locator('button[aria-label="Took L-theanine"][aria-pressed="true"]').count() === 1);
  const due = await pg.locator('.item', { hasText: 'L-theanine' }).allInnerTexts();
  check('Today still reminds about the midday dose', due.some((t) => /Due at 13:00|Not ticked yet/.test(t)));
  await ticks.nth(1).click(); await pg.waitForTimeout(150);
  check('both ticked: both pressed, reminder gone', await card.locator('button[aria-label="Took L-theanine"][aria-pressed="true"]').count() === 2 && await pg.locator('.item', { hasText: 'L-theanine' }).count() === 0);
  await pg.screenshot({ path: OUT + 'fix-today.png', fullPage: true });
  console.log('errors:', JSON.stringify(errs));
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
