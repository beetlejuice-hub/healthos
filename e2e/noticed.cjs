const { chromium, APP, OUT, handle } = require('./harness.cjs');

(async () => {
  const b = await chromium.launch(); const errs = []; const out = OUT;
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  for (const [name, vp] of [['phone', { width: 390, height: 844 }], ['laptop', { width: 1440, height: 900 }]]) {
    const ctx = await b.newContext({ viewport: vp });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    const pg = await ctx.newPage();
    const nline = () => pg.locator('.noticed-line').filter({ hasText: /^noticed/i });
    pg.on('pageerror', e => errs.push('pageerror: ' + e.message));
    pg.on('console', m => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
    await pg.goto(APP);
    await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
    if (name === 'phone') {
      await pg.goto(APP + '#insights'); await pg.waitForTimeout(300);
      await pg.goto(APP + '#today'); await pg.waitForTimeout(300);
      check('new account: no Noticed line', await nline().count() === 0);
      await pg.goto(APP + '#settings'); await pg.getByRole('button', { name: /Load sample/ }).click(); await pg.waitForTimeout(300);
    }
    await pg.goto(APP + '#today'); await pg.waitForTimeout(400);
    const line = await nline().innerText().catch(() => '');
    check(name + ': Today shows one Noticed line', /NOTICED|Noticed/.test(line) && /You burn about [\d,]+ kcal a day/.test(line));
    await pg.screenshot({ path: out + `n-today-${name}.png` });
    await nline().click(); await pg.waitForTimeout(800);
    check(name + ': tapping it opens Insights at Noticed', pg.url().endsWith('#insights') && await pg.locator('.ncard').count() >= 2);
    const cards = await pg.locator('.ncards').innerText();
    check(name + ': weight card has evidence', /weigh-ins over \d+ days · 95% range/.test(cards));
    check(name + ': caffeine habit card learned from data', /You take about \d+ mg of caffeine a day — (light|moderate|high) for your weight/.test(cards) && /mg per kg/.test(cards));
    await pg.screenshot({ path: out + `n-insights-${name}.png`, fullPage: false });
    await pg.locator('#noticed').screenshot({ path: out + `n-cards-${name}.png` });
    if (name === 'phone') {
      await pg.goto(APP + '#today'); await pg.waitForTimeout(300);
      await nline().locator('button').click(); await pg.waitForTimeout(100);
      check('✕ hides the line', await nline().count() === 0);
      await pg.reload(); await pg.waitForTimeout(500);
      check('stays hidden after reload', await nline().count() === 0);
    }
    await ctx.close();
  }
  console.log('errors:', JSON.stringify(errs));
  await b.close();
})().catch(e => { console.log('CRASH', e.message); process.exit(1); });
