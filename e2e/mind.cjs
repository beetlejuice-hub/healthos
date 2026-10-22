// Insights → Mind, under the new page: mood by weekday × time, and what comes before your best and worst days.
// The old mood course is gone (owner, 21 Oct, PLAN 151: the old panels go, these two move into the new design).
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
      check('empty account: no Mind section', await pg.locator('.gl-rhythm, .gl-patterns').count() === 0);
      await pg.goto(APP + '#settings'); await pg.getByRole('button', { name: /Load sample/ }).click(); await pg.waitForTimeout(300);
    }
    await pg.goto(APP + '#insights/mind'); await pg.waitForTimeout(600);
    check(name + ': the old mood course is gone', await pg.locator('.gl-course').count() === 0);
    const pt = await pg.locator('.gl-patterns').innerText();
    // dot pairs (PLAN 105): red when the thing goes with a lower mood — more before your lowest days, less before your best
    const pairs = await pg.locator('.pt-side').evaluateAll((cols) => cols.flatMap((c) => [...c.querySelectorAll('.pt-row')].map((r) => {
      const m = /([\d,.]+)%?\s*vs\s*([\d,.]+)/.exec(r.querySelector('.vals').textContent), n = (x) => +x.replace(/,/g, '');
      return [c.classList.contains('pt-worst') ? 'worst' : 'best', n(m[1]), n(m[2]), r.querySelector('.db').dataset.tone, !!r.querySelector('.db').dataset.clear, /clear/.test(r.querySelector('.tag').textContent)];
    })));
    const right = pairs.every(([k, a, b, tone, dc, tc]) => a === b || (tone === ((a > b) === (k === 'worst') ? 'worse' : 'better') && dc === tc));
    check(name + `: each dot pair's colour follows its numbers, strong only when clear (${pairs.length} pairs)`, pairs.length >= 4 && right);
    check(name + ': patterns compare the lowest and best days with the rest', /Before your lowest days/i.test(pt) && /Before your best days/i.test(pt) && /Sleep rating that morning|Drinks the night before|Calories the day before/.test(pt));
    // in words (owner, 22 Oct: "pls make datas more understandable"): each clear one a sentence, which way first, as many as
    // clear rows (up to 3); every number says what it is (kcal, /10, mg, of days)
    const said = await pg.locator('.pt-say li').allInnerTexts(), clearRows = await pg.locator('.pt-side').evaluateAll((cs) => cs.map((c) => Math.min(3, c.querySelectorAll('.pt-row.clear').length)));
    check(name + `: what stands out, in sentences (${said.length}: ${said.map((t) => t.replace(/\s+/g, ' ')).join(' | ') || 'none'})`, said.length === clearRows.reduce((a, b) => a + b, 0) && said.every((t) => /^\S+\s*(More often|Less often|Higher|Lower): .+ — .+ against .+ (on|of) your other days\.$/.test(t.replace(/\s+/g, ' ').trim())));
    const units = await pg.locator('.pt-row .vals small').allInnerTexts();
    check(name + `: every number says what it is (${[...new Set(units)].join(', ')})`, units.length === await pg.locator('.pt-row').count() && units.every((u) => /^(kcal|\/10|mg|of days)$/.test(u)));
    const rh = await pg.locator('.gl-rhythm').innerText();
    check(name + ': rhythm names a best time', /Best: (Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d\d:00–\d\d:00/.test(rh));
    check(name + ': heatmap has 42 cells', await pg.locator('.gl-rhythm rect').count() === 42);
    await pg.getByRole('button', { name: '12 weeks', exact: true }).click(); await pg.waitForTimeout(200);
    check(name + ': page never scrolls sideways', await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await pg.getByRole('button', { name: '30 days', exact: true }).click(); await pg.waitForTimeout(200);
    await pg.locator('.gl-rhythm').screenshot({ path: OUT + `mind-rhythm-${name}.png` });
    await pg.locator('.gl-patterns').screenshot({ path: OUT + `mind-patterns-${name}.png` });
    await ctx.close();
  }
  console.log('errors: ' + JSON.stringify(errs)); await b.close();
})().catch(e => { console.log('CRASH ' + e.message); process.exit(1); });
