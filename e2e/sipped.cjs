// Caffeine sipped, not chugged (PLAN 86). Owner, 13 Oct: "after logging, it takes like 10-20 minutes while i sip on it, not
// chug it. and also lets confirm if the curve is good". A coffee logged at 14:00 is sipped over 15 min and absorbed over the
// hour: the curve and "now" rise to a peak about 50 min later; bedtime counts the whole cup from the moment it's logged.
const { chromium, APP, OUT, handle, openCard } = require('./harness.cjs');

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  const pg = await ctx.newPage();
  await pg.clock.install({ time: new Date('2026-10-02T14:00:00') });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  const T = (s) => new Date(s).getTime();
  const coffee = (iso, mg = 95) => ({ id: 'c' + iso, kind: 'drink', at: T(iso), name: 'Coffee', ml: 250, caffeineMg: mg, alcoholG: 0, kcal: 2 });
  await pg.evaluate((es) => { const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = es; s.settings = { ...(s.settings || {}), halfLifeMin: 300, bedMinute: 1380 }; localStorage.setItem(k, JSON.stringify(s)); }, [coffee('2026-10-02T14:00:00')]);
  const at = async (iso) => { await pg.clock.setFixedTime(new Date(iso)); await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('#caffeine'); await openCard(pg, 'caffeine'); };
  const head = async () => (await pg.locator('#caffeine h3').innerText()).replace(/\s+/g, ' ');
  const nowMg = async () => { const m = (await head()).match(/(\d+) mg now/); return m ? +m[1] : /none now/.test(await head()) ? 0 : NaN; };
  const bedMg = async () => +((await head()).match(/(\d+) mg at 23:00/) || [0, NaN])[1];

  // 14:00, just logged: nothing in the blood yet, the whole cup counts for bedtime
  await at('2026-10-02T14:00:00');
  const h0 = await head(), coming0 = await pg.locator('#caffeine .caf-coming').innerText().catch(() => '');
  check(`just logged: none in the blood yet, rising (${h0})`, /none now, rising/.test(h0));
  check(`…and says why (${coming0})`, /About 9\d mg still on its way in/.test(coming0));
  const tile = await pg.locator('.t2-status .t2-tile', { hasText: 'Caffeine' }).innerText();
  check(`the Today tile shows it's going in (${tile.replace(/\s+/g, ' ')})`, /0\s*mg\s*↑/.test(tile));
  const b0 = await bedMg();
  // 14:20: on its way up; 14:50: about at its peak; 16:00: past it
  await at('2026-10-02T14:20:00'); const n20 = await nowMg(), h20 = await head();
  await at('2026-10-02T14:50:00'); const n50 = await nowMg(), h50 = await head();
  await at('2026-10-02T16:00:00'); const n120 = await nowMg();
  check(`rises over the hour: 14:20 ${n20} mg, 14:50 ${n50} mg, 16:00 ${n120} mg`, n20 >= 25 && n20 <= 70 && /rising/.test(h20) && n50 >= 78 && n50 <= 92 && !/rising/.test(h50) && n120 < n50 && n120 >= 70);
  check(`bedtime doesn't move as it's absorbed (${b0} at 14:00, ${await bedMg()} at 16:00 — about a third of the cup left at 23:00)`, b0 === await bedMg() && b0 >= 28 && b0 <= 34);
  // the curve, read by touch at 14:05 and 14:50
  await at('2026-10-02T17:00:00');
  const svg = pg.locator('#caffeine svg'); await svg.scrollIntoViewIfNeeded(); const bb = await svg.boundingBox();
  const readAt = async (h, m) => { const W = 320, pl = 26, pr = 6, frac = ((h - 6) * 60 + m) / (18 * 60); await pg.touchscreen.tap(bb.x + ((pl + frac * (W - pl - pr)) / W) * bb.width, bb.y + bb.height / 2); await pg.waitForTimeout(80); return (await svg.locator('text').last().textContent()) || ''; };
  const r5 = await readAt(14, 5), r50 = await readAt(14, 50);
  const mg = (t) => +((t.match(/· (\d+) mg/) || [0, NaN])[1]);
  check(`the curve starts low at the drink and peaks later (${r5} → ${r50})`, mg(r5) < 15 && mg(r50) >= 78);
  await pg.locator('#caffeine').screenshot({ path: OUT + 'sipped-card.png' });
  // a coffee 5 minutes before bed counts in full at bed, not as "nothing yet"
  await pg.evaluate((es) => { const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = es; localStorage.setItem(k, JSON.stringify(s)); }, [coffee('2026-10-02T22:55:00')]);
  await at('2026-10-02T22:56:00');
  check(`a coffee at 22:55 counts in full at 23:00 (${await head()})`, (await bedMg()) >= 90);
  check(`phone: nothing wider than the screen (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
