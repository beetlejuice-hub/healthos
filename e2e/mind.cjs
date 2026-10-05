// Insights → Mind (phase 3): mood course against your average + mood by weekday × time.
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
      check('empty account: no Mind section', await pg.locator('.gl-course').count() === 0);
      await pg.goto(APP + '#settings'); await pg.getByRole('button', { name: /Load sample/ }).click(); await pg.waitForTimeout(300);
    }
    await pg.goto(APP + '#insights/mind'); await pg.waitForTimeout(600);
    const course = await pg.locator('.gl-course').innerText();
    check(name + ': course says days above your average', /\d+ of \d+ days above your average of \d\.\d/.test(course) && /Best: \w{3} \d+ \w{3}/.test(course));
    const bars = await pg.locator('.gl-course path.up, .gl-course path.down').count();
    check(name + ` : one bar per rated day (${bars})`, bars >= 15 && bars <= 30);
    check(name + ': course has the 4-week trend and a 7-day average line', /Last 4 weeks: (rising|falling|steady)/.test(course) && await pg.locator('.gl-course path.roll').count() === 1);
    const pt = await pg.locator('.gl-patterns').innerText();
    check(name + ': patterns compare the lowest and best days with the rest', /Your lowest days/.test(pt) && /Your best days/.test(pt) && /Sleep rating that morning|Drinks the night before|Calories the day before/.test(pt));
    const rh = await pg.locator('.gl-rhythm').innerText();
    check(name + ': rhythm names a best time', /Best: (Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d\d:00–\d\d:00/.test(rh));
    check(name + ': heatmap has 42 cells', await pg.locator('.gl-rhythm rect').count() === 42);
    await pg.getByRole('button', { name: '12 weeks', exact: true }).click(); await pg.waitForTimeout(200);
    check(name + ': 12 weeks widens the course', /\b(5\d|6\d|7\d|8\d) days/.test(await pg.locator('.gl-course .gp-meta').innerText()));
    check(name + ': page never scrolls sideways', await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await pg.getByRole('button', { name: '30 days', exact: true }).click(); await pg.waitForTimeout(200);
    await pg.locator('.gl-course').screenshot({ path: OUT + `mind-course-${name}.png` });
    await pg.locator('.gl-rhythm').screenshot({ path: OUT + `mind-rhythm-${name}.png` });
    await pg.locator('.gl-patterns').screenshot({ path: OUT + `mind-patterns-${name}.png` });
    await ctx.close();
  }
  console.log('errors: ' + JSON.stringify(errs)); await b.close();
})().catch(e => { console.log('CRASH ' + e.message); process.exit(1); });
