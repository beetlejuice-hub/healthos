// Today, redesigned (owner, 6 Oct, approved on the canvas: "I LOVE THIS!! build this pls"): four live
// numbers, a Now card that follows the clock, six one-tap buttons. Today A (owner, 28 Oct, review part 1: "tiles, tap for
// details", "one at a time"): a tile opens its card right under the tiles; everything Today asks comes one at a time in
// "For you"; the readiness line is gone. At phone size.
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
  check('no readiness line (owner, 28 Oct: cut)', await pg.locator('.rd').count() === 0);
  // Today A: no detail cards until a tile is tapped; the card opens right under the tiles, one at a time; a second tap or
  // its head closes it
  const cards = () => pg.locator('#stack, #caffeine, #fuel').count();
  const tap = async (id) => { await pg.locator(`.t2-tile[data-card="${id}"]`).first().click(); await pg.waitForTimeout(150); };
  check('no detail cards until a tile is tapped', await cards() === 0);
  await tap('fuel');
  const under = (id) => pg.evaluate((id) => { const s = document.querySelector('.t2-status'), c = document.getElementById(id), p = document.querySelector('.t2-pad'); return !!c && !!(s.compareDocumentPosition(c) & 4) && !!(c.compareDocumentPosition(p) & 4); }, id);
  check('the kcal tile opens the Food card, under the tiles and above the log row', await pg.locator('#fuel.open .fuel-open').count() === 1 && await under('fuel') && await cards() === 1);
  check('…and both its tiles say so (kcal and protein)', await pg.locator('.t2-tile[data-card="fuel"][aria-expanded="true"]').count() === 2);
  await pg.screenshot({ path: OUT + 'today2-morning.png' });
  await tap('caffeine');
  check('the Caffeine tile swaps it for the Caffeine card: one at a time', await pg.locator('#caffeine.open').count() === 1 && await pg.locator('#fuel').count() === 0 && await under('caffeine'));
  await tap('caffeine');
  check('a second tap closes it', await cards() === 0);
  await tap('fuel'); await pg.locator('#fuel .fold-head').click(); await pg.waitForTimeout(150);
  check('…and so does its head', await cards() === 0);

  // Coffee without a usual drink: pick one, then it's one tap with Undo, and the numbers move.
  await pg.locator('.t2-pad button', { hasText: 'Coffee' }).click(); await pg.waitForTimeout(150);
  check('Coffee with no usual asks for one', await pg.locator('.t2-usual').count() === 1);
  await pg.locator('.t2-usual .drinks button', { hasText: 'Double espresso' }).click(); await pg.waitForTimeout(150);
  check('…which the button then names', /126 mg · Double espresso/.test(await pg.locator('.t2-pad button', { hasText: 'Coffee' }).innerText()) && await pg.locator('.t2-usual').count() === 0);
  await pg.locator('.t2-pad button', { hasText: 'Coffee' }).click(); await pg.waitForTimeout(250);
  let drinks = (await st(pg)).entries.filter((e) => e.kind === 'drink');
  check('one tap logs it', drinks.length === 1 && drinks[0].caffeineMg === 126);
  // sipped and absorbed over the next hour (PLAN 86): "0 mg ↑" now, and counted for bedtime at once
  const ct = (await tile(pg, 'Caffeine')).replace(/\s+/g, ' '), cm = ct.match(/Caffeine (\d+) mg( ↑)? (\d+) at/i);
  check(`the caffeine number moves (${ct})`, !!cm && (+cm[1] > 0 || !!cm[2]) && +cm[3] > 0);
  check('Undo is offered', await pg.getByRole('button', { name: 'Undo' }).count() === 1);
  await pg.getByRole('button', { name: 'Undo' }).click(); await pg.waitForTimeout(250);
  check('…and takes it back', (await st(pg)).entries.filter((e) => e.kind === 'drink').length === 0 && /Caffeine\s*0\s*mg/i.test(await tile(pg, 'Caffeine')));
  await pg.locator('.t2-pad button', { hasText: 'Stack' }).click(); await pg.waitForTimeout(600);
  check('Stack opens the checklist under the tiles, in view', await pg.locator('#stack.open .stack-row').count() > 0 && await under('stack') && await pg.locator('#stack').evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= -2 && r.top < 400; }));
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
  // "For you": one ask at a time, counted, the next one named; the rest out of sight
  const fy = pg.getByRole('region', { name: 'For you' }), cur = pg.locator('.fy-item[data-current]');
  const count = async () => (await fy.locator('.fy-k').textContent().catch(() => '')).replace(/\s+/g, ' '); // as written, not as styled (capitals)
  const visible = () => pg.locator('.fy-item').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).length);
  const c1 = await count(), nxt = await fy.locator('.fy-foot .fy-next').innerText().catch(() => '');
  const total = +((c1.match(/of (\d+)/) || [])[1] || 0);
  check(`one ask at a time, counted, the next one named (${c1} · ${nxt})`, /^For you · 1 of \d+$/.test(c1) && total >= 3 && await visible() === 1 && /^next: Running low: Saffron$/.test(nxt) && /^next: \S/.test(nxt));
  check(`the first is the missed morning stack (${(await cur.innerText()).split('\n')[0]})`, /Morning stack/.test(await cur.innerText()));
  // "Pick…" on a due stack opens the Stack card under the tiles, at its list
  // from further down the page, as on a phone with more on it: the card opens up top and the page goes to it
  await pg.setViewportSize({ width: 390, height: 600 }); await pg.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await pg.waitForTimeout(100);
  await cur.getByRole('button', { name: 'Pick…' }).click(); await pg.waitForTimeout(700);
  const top = await pg.locator('#stack').evaluate((el) => Math.round(el.getBoundingClientRect().top)).catch(() => null);
  check(`"Pick…" opens the Stack card under the tiles, at its list, and shows it (top at ${top} px)`, await pg.locator('#stack.open .stack-row').count() > 0 && await under('stack') && top != null && top >= -2 && top < 300);
  await pg.setViewportSize({ width: 390, height: 844 });
  await tap('stack');
  check('the check-in is not repeated as a "Rate it" ask', !/How was today|Rate it/.test(await fy.evaluate((e) => e.textContent)));
  const before = await tile(pg, 'Stack');
  await cur.getByRole('button', { name: 'Took all' }).click(); await pg.waitForTimeout(200);
  check(`ticking the stack moves its number (${before.replace(/\s+/g, ' ')} → ${(await tile(pg, 'Stack')).replace(/\s+/g, ' ')})`, /Stack\s*0\s*\/\s*3/i.test(before) && /Stack\s*2\s*\/\s*3/i.test(await tile(pg, 'Stack')));
  const n = total - 1; // the stack is answered: one fewer still open
  check(`…and the one after it comes up (${await count()})`, await count() === `For you · 1 of ${n}` && await visible() === 1 && /Saffron/.test(await cur.innerText()));
  // a cycle (owner, 28 Oct: "i should be able to cycle through it - rn i said skip to a couple items and they disappeared")
  const k2 = await cur.getAttribute('data-key'), key = () => cur.getAttribute('data-key');
  await fy.locator('.fy-skip').click(); await pg.waitForTimeout(150);
  check(`Skip moves on (${k2} → ${await key()}, ${await count()})`, await key() !== k2 && await count() === `For you · 2 of ${n}`);
  await pg.reload(); await pg.waitForSelector('.t2-status'); await pg.waitForTimeout(400);
  check(`…and a reload keeps your place (${await count()})`, await key() !== k2 && await count() === `For you · 2 of ${n}`);
  await fy.locator('.fy-back').click(); await pg.waitForTimeout(150);
  check(`‹ Back brings the skipped one back (${await key()}, ${await count()})`, await key() === k2 && await count() === `For you · 1 of ${n}`);
  for (let k = 0; k < n; k++) { await fy.locator('.fy-skip').click(); await pg.waitForTimeout(100); }
  check(`skipping all the way round comes back to it: nothing disappears (${await key()})`, await key() === k2 && await count() === `For you · 1 of ${n}`);
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
  check(`a rest day from the plan, no workout today (${await pg.locator('.t2-rest').innerText().catch(() => 'none')})`, /Rest day · walking, abs/.test(await pg.locator('.t2-rest').innerText().catch(() => '')));
  const ask = await pg.locator('.fy-item[data-current]').innerText().catch(() => '');
  check(`the evening stack is the first ask (${ask.split('\n')[0]})`, /^due:/.test(await pg.locator('.fy-item[data-current]').getAttribute('data-key').catch(() => '')) && /stack|Saffron/i.test(ask));
  check('21:20: nothing scrolls sideways', !(await sideways(pg)));
  await pg.screenshot({ path: OUT + 'today2-evening.png' });
  // Trained this evening: no rest-day line.
  await pg.evaluate(() => { const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k)); s.workouts = [...(s.workouts || []), { id: 'wk', template: 'Push + Quads', startedAt: new Date(2026, 9, 6, 19, 30).getTime(), endedAt: new Date(2026, 9, 6, 20, 30).getTime() }]; localStorage.setItem(k, JSON.stringify(s)); });
  await pg.reload(); await pg.waitForSelector('text=Settings'); await pg.waitForTimeout(400);
  check('after a workout today, no rest-day line', await pg.locator('.t2-rest').count() === 0 && await pg.locator('.t2-now.m-evening').count() === 1);
  await ctx.close();
  console.log('errors: ' + JSON.stringify(errs)); await b.close();
})().catch((e) => { console.log('CRASH ' + e.message); process.exit(1); });
