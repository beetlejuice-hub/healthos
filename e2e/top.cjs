// Insights → "Look at these first" (round 2): the clearest things you can change, ranked, each with a
// two-week test that becomes a real experiment.
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
      check('empty account: no top cards', await pg.locator('.gl-top').count() === 0);
      await pg.goto(APP + '#settings'); await pg.getByRole('button', { name: /Load sample/ }).click(); await pg.waitForTimeout(300);
    }
    if (name === 'laptop') await pg.waitForTimeout(500);
    await pg.goto(APP + '#insights'); await pg.waitForSelector('.top-card', { timeout: 8000 }).catch(() => {}); await pg.waitForTimeout(300);
    const cards = await pg.locator('.top-card').allInnerTexts();
    check(name + `: ranked cards for what you can change (${cards.length})`, cards.length >= 1 && cards.length <= 5 && cards.every((t) => /goes with/.test(t)));
    // The sample plants both late caffeine and drinks; which is bigger depends on the day, so check the order, not the winner.
    check(name + ': the sample\'s planted late-caffeine effect has a card', cards.some((t) => /Caffeine after 14:00 goes with lower energy next day/.test(t)));
    const sizes = cards.map((t) => Math.abs(parseFloat(((t.match(/([−-]?\d+\.\d)\s*points/) || [, 'NaN'])[1]).replace('−', '-'))));
    check(name + `: biggest difference first (${sizes.join(', ')})`, sizes.every((v, i) => !isNaN(v) && (!i || v <= sizes[i - 1])));
    check(name + ': titles read as sentences (no "Drinks goes")', !cards.some((t) => /Drinks goes/.test(t)));
    check(name + ': weekends never get a card', !cards.some((t) => /Weekend/.test(t)));
    if (name === 'laptop') {
      const caf = pg.locator('.top-card', { hasText: 'Caffeine after 14:00 goes with' }), btn = caf.locator('.top-try');
      check('the card offers a two-week test', /Try 14 days:\s*No caffeine after 14:00/.test(await btn.innerText()));
      await btn.click(); await pg.waitForTimeout(300);
      check('starting it marks the card running', /Running · day 1 of 14/.test(await caf.innerText()));
      check('and it appears in Experiments', /No caffeine after 14:00/.test(await pg.locator('#experiments').innerText()));
      await pg.reload(); await pg.waitForSelector('.top-card', { timeout: 8000 }).catch(() => {}); await pg.waitForTimeout(300);
      check('still running after a reload', /Running · day 1 of 14/.test(await caf.innerText()));
    }
    check(name + ': page never scrolls sideways', await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await pg.locator('.gl-top').screenshot({ path: OUT + `top-${name}.png` });
    if (name === 'phone') await pg.waitForTimeout(2000); // let the sample sync up before the laptop signs in
    await ctx.close();
  }
  console.log('errors: ' + JSON.stringify(errs)); await b.close();
})().catch(e => { console.log('CRASH ' + e.message); process.exit(1); });
