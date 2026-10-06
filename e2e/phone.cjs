// Insights on a phone (owner, 5 Oct: "pls make the phone layout"): the section bar becomes tabs, each
// tab shows only its own section, the tab lives in the URL, and a laptop still shows the whole page.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

// A one-finger swipe on `sel`, dx/dy px over ms milliseconds, as real touch events.
const swipe = (pg, sel, dx, dy = 0, ms = 150) => pg.evaluate(async ([sel, dx, dy, ms]) => {
  const el = document.querySelector(sel), r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + Math.min(r.height / 2, 120);
  const t = (cx, cy) => new Touch({ identifier: 1, target: el, clientX: cx, clientY: cy });
  el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [t(x, y)], changedTouches: [t(x, y)] }));
  await new Promise((res) => setTimeout(res, ms));
  el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [], changedTouches: [t(x + dx, y + dy)] }));
}, [sel, dx, dy, ms]).then(() => pg.waitForTimeout(250));
const hash = (pg) => pg.evaluate(() => location.hash);

const visibleSecs = (pg) => pg.evaluate(() => [...new Set([...document.querySelectorAll('[data-sec]')].filter((e) => e.offsetParent).map((e) => e.dataset.sec))].sort());

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  for (const [name, vp] of [['phone', { width: 390, height: 844 }], ['laptop', { width: 1440, height: 900 }]]) {
    const ctx = await b.newContext({ viewport: vp, isMobile: name === 'phone', hasTouch: name === 'phone' });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    const pg = await ctx.newPage();
    pg.on('pageerror', e => errs.push('pageerror: ' + e.message));
    pg.on('console', m => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
    await pg.goto(APP);
    await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
    if (name === 'phone') {
      // Only coffee logged, no feelings: the Connections charts aren't drawn, but Noticed's "still checking" cards
      // (in the same tab) are — they must still get a tab.
      await pg.evaluate(() => { const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = [0, 1, 2].map((d) => ({ id: 'c' + d, kind: 'drink', at: Date.now() - d * 864e5 - 36e5, name: 'Coffee', ml: 250, caffeineMg: 95, alcoholG: 0, kcal: 2 })); localStorage.setItem(k, JSON.stringify(s)); });
      await pg.goto(APP + '#insights'); await pg.reload(); await pg.waitForTimeout(800);
      if (await pg.locator('.secbar button', { hasText: 'Connections' }).count()) { await pg.locator('.secbar button', { hasText: 'Connections' }).click(); await pg.waitForTimeout(300); }
      check('coffee only: "still checking" is on screen or one tab away', await pg.locator('#noticed').isVisible());
    }
    if (name === 'phone') { await pg.goto(APP + '#settings'); await pg.getByRole('button', { name: /Load sample/ }).click(); await pg.waitForTimeout(300); }
    else await pg.waitForTimeout(500);
    await pg.goto(APP + '#insights'); await pg.waitForSelector('.secbar', { timeout: 8000 }).catch(() => {}); await pg.waitForTimeout(800);
    if (name === 'laptop') {
      const secs = await visibleSecs(pg);
      check(`laptop: the whole page, every section (${secs.join(', ')})`, ['connections', 'data', 'intake', 'mind', 'sleep', 'timeline', 'training', 'week'].every((s) => secs.includes(s)));
      check('laptop: the bar still has "Try"', await pg.locator('.secbar button', { hasText: 'Try' }).count() === 1);
    } else {
      check('phone: opens on "This week" only', JSON.stringify(await visibleSecs(pg)) === '["week"]');
      check('phone: "This week" is the current tab', (await pg.locator('.secbar button[aria-current="true"], .secbar button[aria-current="page"]').innerText()).trim() === 'This week');
      check('phone: no "Try" tab (the cards are in This week)', await pg.locator('.secbar button:visible', { hasText: 'Try' }).count() === 0);
      for (const [label, sec] of [['Timeline', 'timeline'], ['Mind', 'mind'], ['Connections', 'connections'], ['Sleep', 'sleep'], ['Intake & body', 'intake'], ['Training & stack', 'training'], ['Your data', 'data']]) {
        await pg.evaluate(() => window.scrollTo(0, 600));
        await pg.locator('.secbar button', { hasText: label }).first().click(); await pg.waitForTimeout(300);
        const secs = await visibleSecs(pg);
        check(`phone: ${label} tab shows only that section (${secs.join(', ')}), back at the top`, JSON.stringify(secs) === JSON.stringify([sec]) && await pg.evaluate(() => window.scrollY) === 0);
        check(`phone: ${label} → #insights/${sec}`, await pg.evaluate(() => location.hash) === `#insights/${sec}`);
        check(`phone: ${label} never scrolls sideways`, await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
      }
      await pg.screenshot({ path: OUT + 'phone-data.png' });
      await pg.reload(); await pg.waitForSelector('.secbar', { timeout: 8000 }).catch(() => {}); await pg.waitForTimeout(500);
      check('phone: a reload keeps the tab', JSON.stringify(await visibleSecs(pg)) === '["data"]');
      await pg.goto(APP + '#today'); await pg.waitForTimeout(300);
      await pg.goto(APP + '#insights/connections'); await pg.waitForTimeout(500);
      check('phone: #insights/connections opens Connections', JSON.stringify(await visibleSecs(pg)) === '["connections"]');
      await pg.goto(APP + '#insights/nonsense'); await pg.waitForTimeout(300);
      check('phone: an unknown tab in the URL still shows a tab', (await visibleSecs(pg)).length === 1);
      await pg.goto(APP + '#insights/training'); await pg.waitForTimeout(500);
      const labs = await pg.locator('.gl-load svg text').evaluateAll((ts) => ts.filter((t) => /^\d+ \w{3}$/.test(t.textContent)).map((t) => t.getBBox()).map((r) => [r.x, r.x + r.width]));
      check(`phone: Training load week labels don't overlap (${labs.length})`, labs.length >= 2 && labs.every((r, i) => !i || r[0] >= labs[i - 1][1] + 2));
      await pg.locator('.gl-load').screenshot({ path: OUT + 'phone-load.png' });
      const sizes = await pg.locator('.mini-chart svg text').evaluateAll((ts) => ts.map((t) => t.getBoundingClientRect().height).filter((h) => h > 0)); // on-screen ones (Noticed's are on another tab)
      check(`phone: small-chart labels are readable, not shrunk (smallest ${Math.min(...sizes).toFixed(1)} px tall)`, sizes.length > 0 && Math.min(...sizes) >= 9);
      // Swipe between tabs.
      await pg.goto(APP + '#insights/week'); await pg.waitForTimeout(400);
      await swipe(pg, '.gl-week', -140);
      check('phone: swipe left on This week opens Timeline', await hash(pg) === '#insights/timeline' && JSON.stringify(await visibleSecs(pg)) === '["timeline"]');
      await swipe(pg, '.mg-canvas', -140);
      check('phone: dragging the timeline itself pans it, not the tab', await hash(pg) === '#insights/timeline');
      await swipe(pg, '.secbar', 140);
      check('phone: scrolling the tab bar doesn\'t switch tab', await hash(pg) === '#insights/timeline');
      await swipe(pg, '.master', 140, 0);
      check('phone: swipe right elsewhere on Timeline goes back to This week', await hash(pg) === '#insights/week');
      await swipe(pg, '.gl-week', 140);
      check('phone: swipe right on the first tab stays put', await hash(pg) === '#insights/week');
      await swipe(pg, '.gl-week', -110, 90);
      check('phone: a diagonal scroll is not a swipe', await hash(pg) === '#insights/week');
      await swipe(pg, '.gl-week', -140, 0, 1200);
      check('phone: a slow drag is not a swipe', await hash(pg) === '#insights/week');
      await pg.goto(APP + '#insights/data'); await pg.waitForTimeout(400);
      await swipe(pg, '.gl-cover', -140);
      check('phone: swipe left on the last tab stays put', await hash(pg) === '#insights/data');
      await pg.waitForTimeout(2000); // let the sample sync up before the laptop signs in
    }
    await ctx.close();
  }
  console.log('errors: ' + JSON.stringify(errs)); await b.close();
})().catch(e => { console.log('CRASH ' + e.message); process.exit(1); });
