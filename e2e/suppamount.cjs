// Owner, 9 Oct: "i set up 1 capsule as 200mg, i should be either change to 300mg when im logging, or just +1 to add
// +1 caps, so its 400mg taken". Tick it, then − / + a capsule or type the amount; only that intake changes.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 360, height: 800 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  const pg = await ctx.newPage();
  await pg.clock.install({ time: new Date('2026-10-09T21:40:00') });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  await pg.evaluate(() => { const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k) || '{}');
    s.supplements = [{ id: 'mag', name: 'Magnesium glycinate', dose: '200 mg', slot: 'evening', at: 21 * 60 + 30, active: true }]; s.entries = []; localStorage.setItem(k, JSON.stringify(s)); });
  await pg.reload(); await pg.waitForSelector('#stack');
  const st = () => pg.evaluate(() => JSON.parse(localStorage.getItem('healthos.v1:u-test') || '{}'));
  const intake = async () => (await st()).entries.filter((e) => e.kind === 'supp');
  const row = pg.locator('#stack .stack-row').filter({ hasText: 'Magnesium' });
  await row.scrollIntoViewIfNeeded();

  await pg.getByRole('button', { name: 'Took Magnesium glycinate' }).click(); await pg.waitForTimeout(150);
  check(`ticked: the amount shows, 200 mg, nothing extra saved (${await row.locator('.samt').getAttribute('data-amount')})`, await row.locator('.samt').getAttribute('data-amount') === '200 mg' && (await intake())[0].amount === undefined);
  await pg.getByRole('button', { name: 'One capsule more of Magnesium glycinate' }).click(); await pg.waitForTimeout(150);
  check(`+1 capsule → 400 mg on this intake (${(await intake())[0].amount}; shows "${await row.locator('.samt-v').innerText()}")`, (await intake())[0].amount === '400 mg' && /400 mg\s*·\s*2 caps/.test(await row.locator('.samt-v').innerText()));
  await row.screenshot({ path: OUT + 'suppamount-plus.png' });
  await pg.getByRole('button', { name: 'One capsule less of Magnesium glycinate' }).click(); await pg.waitForTimeout(150);
  check('−1 → back to the plan\'s 200 mg, so nothing extra is stored', (await intake())[0].amount === undefined && await pg.getByRole('button', { name: 'One capsule less of Magnesium glycinate' }).isDisabled());
  await row.locator('.samt-v').click(); const box = pg.getByLabel('How much Magnesium glycinate you took');
  await box.fill('300'); await box.press('Enter'); await pg.waitForTimeout(150);
  check(`typed 300 → 300 mg (${(await intake())[0].amount})`, (await intake())[0].amount === '300 mg' && await row.locator('.samt').getAttribute('data-amount') === '300 mg');
  const s = await st();
  check('the plan\'s dose is untouched (still 200 mg, no change in its history)', s.supplements[0].dose === '200 mg' && !s.supplements[0].doseLog);
  check(`one intake, not a new one per tap (${(await intake()).length})`, (await intake()).length === 1);
  check(`fits a 360 px phone (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 360);
  await row.screenshot({ path: OUT + 'suppamount-typed.png' });
  await pg.goto(APP + '#log'); await pg.waitForTimeout(400);
  check('the log says how much', await pg.getByText('taken · 300 mg').count() >= 1);

  console.log('errors:', JSON.stringify(errs));
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
