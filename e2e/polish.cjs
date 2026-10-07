// The look, after Today (owner, 7 Oct: "go"): weigh-ins read as dates, and no screen scrolls sideways on a
// 360 px phone — the tester's long email pushed Settings 8 px off the screen.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  const pg = await ctx.newPage();
  await pg.clock.install({ time: new Date('2026-10-07T08:00:00') });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  for (const r of ['today', 'log/food', 'log/drink', 'log/stack', 'log/body', 'settings', 'ai', 'workout']) {
    await pg.goto(APP + '#' + r); await pg.waitForTimeout(350);
    check(`360 px: #${r} doesn't scroll sideways`, await pg.evaluate(() => document.documentElement.scrollWidth <= 360)); // not innerWidth: a mobile viewport widens itself to the content
  }
  await pg.goto(APP + '#log/body'); await pg.getByLabel('kg', { exact: true }).fill('78.4'); await pg.getByRole('button', { name: 'Log weight' }).click(); await pg.waitForTimeout(200);
  const row = await pg.locator('.list .li').first().innerText();
  check(`a weigh-in reads as a date (${row.replace(/\s+/g, ' ')})`, /Wed 7 Oct · 08:00/.test(row) && !/2026-10-07/.test(row));
  await pg.goto(APP + '#settings'); await pg.waitForTimeout(300);
  await pg.screenshot({ path: OUT + 'polish-settings-360.png' });
  // Owner, 7 Oct: "i am not really measuring my food, just like 1 serving, 3 eggs, 1 plate". Typed, not weighed.
  await pg.goto(APP + '#log/food'); await pg.waitForTimeout(300);
  await pg.getByLabel('Type what you ate').fill('scrambled eggs 3, tuna in oil, a fist of rice, thumb of butter, 1 palm chicken breast');
  await pg.getByRole('button', { name: 'Add', exact: true }).click(); await pg.waitForTimeout(500);
  const basket = (await pg.locator('.basket').innerText()).replace(/\s+/g, ' ');
  check(`typed by count and by hand, all five found (${basket.slice(0, 160)}…)`, ['Scrambled eggs', '3 eggs', 'Tuna, canned in oil', 'White rice, cooked', '1 fist', 'Butter', '1 thumb', 'Chicken breast, cooked', '1 palm-size'].every((t) => basket.includes(t)) && !/Couldn't find/.test(await pg.locator('.card').first().innerText()));
  check('the hint says you can use your hand', /a palm of chicken, a fist of rice/.test(await pg.locator('#log, body').first().innerText()));
  await pg.locator('.basket').screenshot({ path: OUT + 'polish-basket.png' });
  console.log('errors: ' + JSON.stringify(errs)); await b.close();
})().catch((e) => { console.log('CRASH ' + e.message); process.exit(1); });
