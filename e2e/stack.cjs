// Insights → Training & stack and Your data (phase 5b): sets per muscle week by week, supplements day
// by day, coverage, methods; Noticed now sits after Connections.
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
      check('empty account: no training, stack or coverage panels', await pg.locator('.gl-load, .gl-supps, .gl-cover').count() === 0);
      await pg.goto(APP + '#settings'); await pg.getByRole('button', { name: /Load sample/ }).click(); await pg.waitForTimeout(300);
    }
    await pg.goto(APP + '#insights/training'); await pg.waitForTimeout(800);
    const load = await pg.locator('.gl-load').innerText();
    check(name + ': training load names most and least trained muscles', /(average|averages) 10\+ hard sets|No muscle averages/.test(load) && /Least: /.test(load));
    check(name + ': a cell per muscle per week (10 × 6)', await pg.locator('.gl-load rect[rx="3"]').count() === 60);
    const supps = await pg.locator('.gl-supps').innerText();
    check(name + ': supplements with their %', /\w+ \d+%/.test(supps) && /Connections above/.test(supps));
    check(name + ': coverage counts check-in days', /\d+ of \d+ days have a check-in/.test(await pg.locator('.gl-cover').innerText()));
    check(name + ': methods explain the usual week', /usual week/i.test(await pg.locator('.gl-methods').innerText()));
    check(name + ': old sets-per-muscle panel gone', await pg.evaluate(() => ![...document.querySelectorAll('h2')].some((h) => h.textContent.startsWith('Sets per muscle'))));
    const order = await pg.evaluate(() => { const a = document.querySelector('.gl-forest'), n = document.querySelector('#noticed'); return !!a && !!n && !!(a.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING); });
    check(name + ': Noticed follows Connections', order);
    await pg.getByRole('button', { name: '12 weeks', exact: true }).click(); await pg.waitForTimeout(200);
    check(name + ': 12 weeks shows 12 weeks of load', await pg.locator('.gl-load rect[rx="3"]').count() === 120);
    check(name + ': page never scrolls sideways', await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await pg.getByRole('button', { name: '30 days', exact: true }).click(); await pg.waitForTimeout(200);
    for (const c of ['load', 'supps', 'cover', 'methods']) { await pg.goto(APP + '#insights/' + (c === 'load' || c === 'supps' ? 'training' : 'data')); await pg.locator('.gl-' + c).screenshot({ path: OUT + `stack-${c}-${name}.png` }); }
    await ctx.close();
  }
  console.log('errors: ' + JSON.stringify(errs)); await b.close();
})().catch(e => { console.log('CRASH ' + e.message); process.exit(1); });
