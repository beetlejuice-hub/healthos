// Insights → At a glance (phase 1 of the approved v2): week card, day-by-day strip, vitals vs your usual week.
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
      check('empty account: no week card', await pg.locator('.gl-week').count() === 0);
      await pg.goto(APP + '#settings'); await pg.getByRole('button', { name: /Load sample/ }).click(); await pg.waitForTimeout(300);
    }
    await pg.goto(APP + '#insights'); await pg.waitForTimeout(600);
    const week = await pg.locator('.gl-week').innerText();
    check(name + ': week card counts measures in the usual range', /\d+\s*of \d+ measures in your usual range/.test(week));
    check(name + ': feelings in plain words', /Mood \d\.\d/.test(week));
    const heads = await pg.locator('.gl-days thead th').allInnerTexts();
    check(name + ': day strip has 7 days ending today', heads.length === 8 && /^Today/.test(heads[7].trim()));
    const vt = await pg.locator('.gl-vt').innerText();
    check(name + ': vitals table has mind and intake rows (no sleep ratings in the sample, so no sleep row)', /Mood/.test(vt) && /Calories/.test(vt) && /Weight/.test(vt) && !/Sleep rating/.test(vt));
    check(name + ': judged against a usual week', (name === 'phone' || /Usual week/i.test(vt)) && /(Typical|Higher|Lower)/.test(vt)); // a phone drops the usual-range column; the word still says it
    check(name + ': no "−0" deltas', !/−0(\.0)?\b(?!\.\d*[1-9])/.test(vt.replace(/−0\.\d*[1-9]\d*/g, '')));
    await pg.getByRole('button', { name: '7 days', exact: true }).click(); await pg.waitForTimeout(150);
    check(name + ': period switch reaches the sparklines', /Daily, last 7 days/i.test(await pg.locator('.gl-vt thead').innerText()));
    await pg.getByRole('button', { name: '30 days', exact: true }).click(); await pg.waitForTimeout(150);
    check(name + ': page never scrolls sideways', await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    const secs = await pg.locator('.secbar button > span').allInnerTexts();
    check(name + ': the page list has the pages (' + secs.join(', ') + ')', ['Overview', 'Timeline', 'Findings', 'Data'].every((p) => secs.includes(p)));
    if (name === 'laptop') { // pages as a sidebar on a laptop (owner, 8 Oct); phone tabs: e2e/phone.cjs
    await pg.locator('.secbar button', { hasText: 'Findings' }).click(); await pg.waitForTimeout(500);
    const top = await pg.locator('#ins-connections').evaluate((el) => el.getBoundingClientRect().top);
    check(name + ` : Findings opens as its own page, at the top (${Math.round(top)} px), Overview gone`, top >= 0 && top < 260 && !(await pg.locator('#ins-glance').isVisible()));
    check(name + ': the sidebar stays and marks it', await pg.locator('.secbar').isVisible() && await pg.locator('.secbar button[aria-current="page"] > span').innerText() === 'Findings');
    await pg.locator('.secbar button', { hasText: 'Overview' }).click(); await pg.waitForTimeout(400);
    }
    await pg.evaluate(() => window.scrollTo(0, 0)); await pg.waitForTimeout(200);
    // One tooltip, styled, instead of the browser's: pointing at a vitals row shows its numbers.
    if (name === 'laptop') { const row = pg.locator('.gl-vt tbody tr').nth(1); await row.scrollIntoViewIfNeeded(); await pg.waitForTimeout(300); await row.hover(); await pg.waitForTimeout(150);
      check('laptop: pointing at a row shows the tooltip', /A usual week/.test(await pg.locator('.tipbox').innerText().catch(() => '')));
      check('laptop: no browser title tooltips left on the new panels', await pg.evaluate(() => !document.querySelector('.gl title, .gl [title]'))); }
    check(name + ': no duplicate "Your week" block', await pg.locator('.weekly').count() === 0);
    await pg.locator('.gl').first().screenshot({ path: OUT + `glance-${name}.png` });
    await ctx.close();
  }
  console.log('errors: ' + JSON.stringify(errs)); await b.close();
})().catch(e => { console.log('CRASH ' + e.message); process.exit(1); });
