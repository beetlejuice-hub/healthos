// Log on an earlier day (owner, 2 Oct): not the default, but one link away — food and drinks.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  await ctx.route(/openfoodfacts/, (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"hits":[]}' }));
  const pg = await ctx.newPage();
  await pg.clock.install({ time: new Date('2026-10-02T00:20:00') }); // just after midnight: the edge
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  const entries = async () => (await pg.evaluate(() => JSON.parse(localStorage.getItem('healthos.v1:u-test') || '{}'))).entries || [];
  const T = (s) => new Date(s).getTime();

  await pg.goto(APP + '#log/food');
  await pg.getByLabel('Type what you ate').fill('1 cooked salmon, 2 slices of bread'); await pg.getByRole('button', { name: 'Add', exact: true }).click();
  check('today is the default (Now chip, no day shown)', await pg.getByRole('button', { name: 'Earlier day…' }).count() === 1 && await pg.getByLabel('Day').count() === 0);
  await pg.getByRole('button', { name: 'Earlier day…' }).click();
  check('Earlier day… → Yesterday, lunch time, date can\'t be today or later', /Yesterday/.test(await pg.locator('.when.earlier').innerText()) && await pg.getByLabel('Day').getAttribute('max') === '2026-10-01');
  await pg.getByRole('button', { name: 'Dinner' }).click();
  await pg.screenshot({ path: OUT + 'earlier-food.png' });
  await pg.getByRole('button', { name: /^Log 2 foods for yesterday$/ }).click(); await pg.waitForTimeout(250);
  const food = (await entries()).filter((e) => e.kind === 'food');
  check('both foods at yesterday 19:00', food.length === 2 && food.every((e) => e.at === T('2026-10-01T19:00:00')));
  check('…not in today\'s log', !/Salmon/.test(await pg.locator('text=Logged today').locator('..').innerText()));
  check('the toast says where it went', await pg.getByRole('status').filter({ hasText: /on Thu 1 Oct/ }).count() >= 1);

  // Three days back, a drink.
  await pg.goto(APP + '#log/drink'); await pg.waitForTimeout(150);
  await pg.getByRole('button', { name: 'Earlier day…' }).click();
  await pg.getByLabel('Day').fill('2026-09-29'); await pg.getByLabel('Time').fill('09:15');
  await pg.fill('input[aria-label="Find a drink"]', 'espresso'); await pg.waitForTimeout(250);
  await pg.getByRole('button', { name: /^Espresso 63 mg/ }).click(); await pg.waitForTimeout(250);
  const drink = (await entries()).filter((e) => e.kind === 'drink');
  check('drink logged on Tue 29 Sep 09:15', drink.length === 1 && drink[0].at === T('2026-09-29T09:15:00'));
  await pg.getByRole('button', { name: 'Back to today' }).click();
  check('Back to today → the usual chips', await pg.getByRole('button', { name: 'Now' }).count() === 1);
  console.log('errors:', JSON.stringify(errs));
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
