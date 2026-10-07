// Today, redesigned (owner, 6 Oct, approved on the canvas: "I LOVE THIS!! build this pls"): four live
// numbers, a Now card that follows the clock, six one-tap buttons, the detail below. At phone size.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const open = async (time, setup) => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    const pg = await ctx.newPage();
    await pg.clock.install({ time: new Date(time) });
    pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
    await pg.goto(APP);
    await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
    if (setup) { await pg.evaluate(setup); await pg.reload(); await pg.waitForSelector('text=Settings'); }
    await pg.waitForTimeout(400);
    return { ctx, pg };
  };
  const st = (pg) => pg.evaluate(() => JSON.parse(localStorage.getItem('healthos.v1:u-test') || '{}'));
  const sideways = (pg) => pg.evaluate(() => document.documentElement.scrollWidth > 390); // not innerWidth: a mobile viewport widens itself to the content
  const tile = (pg, name) => pg.locator('.t2-tile', { hasText: name }).innerText();

  // Morning: start the day — sleep is asked, in the yellow card.
  let { ctx, pg } = await open('2026-10-06T07:45:00');
  check('07:45: the Now card is "Start the day"', /Start the day/i.test(await pg.locator('.t2-now').innerText()) && await pg.locator('.t2-now.m-morning').count() === 1);
  check('…and asks about last night\'s sleep', await pg.locator('.t2-now #feel [role=slider][data-name="sleep"]').count() === 1);
  check('six buttons, always in this order', JSON.stringify(await pg.locator('.t2-pad button b').allInnerTexts()) === '["Coffee","Food","Drink","Stack","Feel","Weigh"]');
  check('four numbers on top', (await pg.locator('.t2-tile').count()) === 4 && /kcal[\s\S]*2,600[\s\S]*left today/i.test(await tile(pg, 'kcal')));
  check('07:45: nothing scrolls sideways', !(await sideways(pg)));
  await pg.screenshot({ path: OUT + 'today2-morning.png' });

  // Coffee without a usual drink: pick one, then it's one tap with Undo, and the numbers move.
  await pg.locator('.t2-pad button', { hasText: 'Coffee' }).click(); await pg.waitForTimeout(150);
  check('Coffee with no usual asks for one', await pg.locator('.t2-usual').count() === 1);
  await pg.locator('.t2-usual .drinks button', { hasText: 'Double espresso' }).click(); await pg.waitForTimeout(150);
  check('…which the button then names', /126 mg · Double espresso/.test(await pg.locator('.t2-pad button', { hasText: 'Coffee' }).innerText()) && await pg.locator('.t2-usual').count() === 0);
  await pg.locator('.t2-pad button', { hasText: 'Coffee' }).click(); await pg.waitForTimeout(250);
  let drinks = (await st(pg)).entries.filter((e) => e.kind === 'drink');
  check('one tap logs it', drinks.length === 1 && drinks[0].caffeineMg === 126);
  check(`the caffeine number moves (${(await tile(pg, 'Caffeine')).replace(/\s+/g, ' ')})`, /Caffeine\s*1[12]\d\s*mg/i.test(await tile(pg, 'Caffeine')));
  check('Undo is offered', await pg.getByRole('button', { name: 'Undo' }).count() === 1);
  await pg.getByRole('button', { name: 'Undo' }).click(); await pg.waitForTimeout(250);
  check('…and takes it back', (await st(pg)).entries.filter((e) => e.kind === 'drink').length === 0 && /Caffeine\s*0\s*mg/i.test(await tile(pg, 'Caffeine')));
  await pg.locator('.t2-pad button', { hasText: 'Stack' }).click(); await pg.waitForTimeout(600);
  check('Stack scrolls to the checklist', await pg.locator('#stack').evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= -2 && r.top < 200; }));
  await pg.locator('.t2-pad button', { hasText: 'Food' }).click(); await pg.waitForTimeout(200);
  check('Food opens Log → Food', await pg.evaluate(() => location.hash) === '#log/food');
  await ctx.close();

  // Afternoon: the check-in, blue; at most two due items, the rest one tap away.
  ({ ctx, pg } = await open('2026-10-06T14:20:00', () => {
    const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k) || '{}');
    s.supplements = [{ id: 'crea', name: 'Creatine', dose: '5 g', slot: 'morning', at: 480, active: true }, { id: 'd3', name: 'Vitamin D3', dose: '2000 IU', slot: 'morning', at: 480, active: true }, { id: 'saf', name: 'Saffron', dose: '30 mg', slot: 'evening', at: 1290, active: true, status: 'low' }];
    localStorage.setItem(k, JSON.stringify(s));
  }));
  check('14:20: the Now card is "Check in", with the sliders', /Check in/i.test(await pg.locator('.t2-now').innerText()) && await pg.locator('.t2-now.m-day #feel .hn-sliders [role=slider]').count() === 4);
  const due = await pg.locator('.t2-items .item').count();
  check(`two due items at a time (${due} shown)`, due === 2 && /\+ \d+ more due/.test(await pg.locator('.t2-more').innerText()));
  await pg.locator('.t2-more').click(); await pg.waitForTimeout(100);
  check('"more" shows the rest', await pg.locator('.t2-items .item').count() > 2 && await pg.locator('.t2-more').innerText() === 'Show fewer');
  check('the check-in is not repeated as a "Rate it" item', !/How was today|Rate it/.test(await pg.locator('.t2-items').innerText()));
  const before = await tile(pg, 'Stack');
  await pg.locator('.t2-items .item', { hasText: 'Morning stack' }).getByRole('button', { name: 'Took all' }).click(); await pg.waitForTimeout(200);
  check(`ticking the stack moves its number (${before.replace(/\s+/g, ' ')} → ${(await tile(pg, 'Stack')).replace(/\s+/g, ' ')})`, /Stack\s*0\s*\/\s*3/i.test(before) && /Stack\s*2\s*\/\s*3/i.test(await tile(pg, 'Stack')));
  check('14:20: nothing scrolls sideways', !(await sideways(pg)));
  await pg.screenshot({ path: OUT + 'today2-day.png' });
  await ctx.close();

  // Evening: before bed — the stack first, caffeine at bed in words, the day in numbers (only what was logged).
  ({ ctx, pg } = await open('2026-10-06T21:20:00', () => {
    const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k) || '{}'), t = (h, m) => new Date(2026, 9, 6, h, m).getTime();
    s.entries = [
      { id: 'e1', kind: 'food', at: t(9, 30), name: 'Eggs', grams: 200, macros: { kcal: 520, p: 32, c: 30, f: 28 } },
      { id: 'e2', kind: 'food', at: t(13, 10), name: 'Rice bowl', grams: 450, macros: { kcal: 720, p: 46, c: 90, f: 18 } },
      { id: 'e3', kind: 'drink', at: t(8, 10), name: 'Espresso', ml: 30, caffeineMg: 63, alcoholG: 0, kcal: 1 },
      { id: 'e4', kind: 'feel', at: t(12, 40), mood: 6, energy: 6 }, { id: 'e5', kind: 'feel', at: t(18, 30), mood: 8, energy: 5 },
    ];
    localStorage.setItem(k, JSON.stringify(s));
  }));
  const ev = await pg.locator('.t2-now').innerText();
  check('21:20: the Now card is "Before bed"', /Before bed/i.test(ev) && await pg.locator('.t2-now.m-evening').count() === 1);
  check(`caffeine at bed, with the word for it (${(await pg.locator('.t2-bedcaf').innerText())})`, /Caffeine at 23:00: (none|about \d+ mg) · (low|possible effect|higher chance)/.test(await pg.locator('.t2-bedcaf').innerText()));
  check(`the day in numbers (${(await pg.locator('.t2-daynums').innerText()).replace(/\s+/g, ' ')})`, /1,241\s*kcal today/.test(await pg.locator('.t2-daynums').innerText()) && /78 g\s*protein/.test(await pg.locator('.t2-daynums').innerText()) && /7\.0\s*mood, avg/.test(await pg.locator('.t2-daynums').innerText()));
  check('the evening stack comes before the check-in', await pg.evaluate(() => { const c = document.querySelector('.t2-now'); const i = c.querySelector('.t2-items'), f = c.querySelector('#feel'); return !!i && !!f && !!(i.compareDocumentPosition(f) & Node.DOCUMENT_POSITION_FOLLOWING); }));
  check('21:20: nothing scrolls sideways', !(await sideways(pg)));
  await pg.screenshot({ path: OUT + 'today2-evening.png' });
  await ctx.close();
  console.log('errors: ' + JSON.stringify(errs)); await b.close();
})().catch((e) => { console.log('CRASH ' + e.message); process.exit(1); });
