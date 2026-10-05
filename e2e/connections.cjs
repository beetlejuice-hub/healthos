// Insights → Connections (phase 4): one forest plot for every with/without comparison + the explorer.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  for (const [name, vp] of [['phone', { width: 390, height: 844 }], ['laptop', { width: 1440, height: 900 }]]) {
    const ctx = await b.newContext({ viewport: vp });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    const pg = await ctx.newPage();
    pg.on('pageerror', e => errs.push('pageerror: ' + e.message));
    pg.on('console', m => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
    await pg.goto(APP);
    await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
    if (name === 'phone') {
      await pg.goto(APP + '#insights'); await pg.waitForTimeout(300);
      check('empty account: no Connections', await pg.locator('.gl-forest').count() === 0);
      await pg.goto(APP + '#settings'); await pg.getByRole('button', { name: /Load sample/ }).click(); await pg.waitForTimeout(300);
    }
    await pg.goto(APP + '#insights'); await pg.waitForTimeout(700);
    const forest = await pg.locator('.gl-forest').innerText();
    check(name + ': forest says how many comparisons are clear', /\d+ of \d+ comparisons are clear/.test(forest));
    const squares = await pg.locator('.gl-forest rect.sq').count();
    check(name + ` : a square per ready comparison (${squares})`, squares >= 4);
    check(name + ': the old panels are gone', !(await pg.locator('text=What moves what').count()) && !(await pg.locator('text=Does it do anything').count()));
    const ans0 = await pg.locator('.gl-explore .gp-ans').innerText();
    await pg.selectOption('#ex-x', 'kcal'); await pg.selectOption('#ex-y', 'mood'); await pg.waitForTimeout(150);
    const ans1 = await pg.locator('.gl-explore .gp-ans').innerText();
    check(name + ': picking two measures re-reads them', ans1 !== ans0 && /calories/i.test(ans1) && /mood/i.test(ans1));
    const pairsN = await pg.locator('.gl-pair').count();
    if (pairsN) { await pg.locator('.gl-pair').first().click(); await pg.waitForTimeout(100); check(name + ': tapping a strongest pair plots it', await pg.locator('.gl-pair').first().getAttribute('aria-pressed') === 'true'); }
    else check(name + ': no strongest pairs listed (none clear)', true);
    check(name + ': scatter has a dot per day', await pg.locator('.gl-explore circle.dot').count() >= 10);
    check(name + ': page never scrolls sideways', await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await pg.locator('.gl-forest').screenshot({ path: OUT + `conn-forest-${name}.png` });
    await pg.locator('.gl-explore').screenshot({ path: OUT + `conn-explore-${name}.png` });
    await ctx.close();
  }
  console.log('errors: ' + JSON.stringify(errs)); await b.close();
})().catch(e => { console.log('CRASH ' + e.message); process.exit(1); });
