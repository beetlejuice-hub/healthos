// Insights → Sleep and Intake & body (phase 5a): sleep rating night by night, caffeine at bedtime,
// drinks per week, calories & macros, weight trend. Sample data + sleep ratings added on top.
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
      check('empty account: no Sleep or Intake panels', await pg.locator('.gl-sleep, .gl-kcal, .gl-weight').count() === 0);
      await pg.goto(APP + '#settings'); await pg.getByRole('button', { name: /Load sample/ }).click(); await pg.waitForTimeout(300);
    }
    // Morning sleep ratings for the last 30 days (the sample has none) — once the synced data is in.
    await pg.goto(APP + '#insights'); await pg.waitForSelector('.gl-week'); await pg.waitForTimeout(2000); // let the sample finish syncing, so the app's own save can't overwrite what's injected next
    await pg.evaluate(() => { const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k)); const t = new Date(); t.setHours(7, 40, 0, 0);
      for (let d = 30; d >= 0; d--) if (!s.entries.some((e) => e.id === 'sl' + d)) s.entries.push({ id: 'sl' + d, kind: 'sleep', at: t.getTime() - d * 864e5, rating: 5 + (d % 4) });
      s.entries.sort((a, b) => a.at - b.at); localStorage.setItem(k, JSON.stringify(s)); });
    await pg.goto(APP + '#insights/sleep'); await pg.reload(); await pg.waitForSelector('.gl-sleep', { timeout: 10000 }).catch(() => {}); await pg.waitForTimeout(300);
    const sleep = await pg.locator('.gl-sleep').innerText();
    check(name + ': sleep rating night by night', /You rated your sleep \d\.\d\/10 on average over \d+ nights/.test(sleep));
    check(name + ': a bar per rated night', await pg.locator('.gl-sleep path').count() >= 25);
    check(name + ': caffeine tiers counted', /\d+ low, \d+ possible, \d+ higher nights/.test(await pg.locator('.gl-caf').innerText()));
    check(name + ': drinks per week', /(Average \d+(\.\d)? a week|Log drinks)/.test(await pg.locator('.gl-drinks').innerText()));
    await pg.goto(APP + '#insights/intake'); await pg.waitForTimeout(300);
    const kcal = await pg.locator('.gl-kcal').innerText();
    check(name + ': calories against the goal, protein per kg', /Averaging [\d,]+ kcal \(goal [\d,]+/.test(kcal) && /g\/kg/.test(kcal));
    const wt = await pg.locator('.gl-weight').innerText();
    check(name + ': weight trend in kg a week, with its range', /kg a week \(95% range/.test(wt));
    check(name + ': old panels gone', !(await pg.locator('text=Today so far').count()) && !(await pg.locator('h2:has-text("Caffeine and alcohol")').count()));
    check(name + ': page never scrolls sideways', await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    for (const c of ['sleep', 'caf', 'drinks', 'kcal', 'weight']) { await pg.goto(APP + '#insights/' + (c === 'kcal' || c === 'weight' ? 'intake' : 'sleep')); await pg.locator('.gl-' + c).screenshot({ path: OUT + `body-${c}-${name}.png` }); }
    await ctx.close();
  }
  console.log('errors: ' + JSON.stringify(errs)); await b.close();
})().catch(e => { console.log('CRASH ' + e.message); process.exit(1); });
