// Supplements logged like food (PLAN 87). Owner, 13 Oct: "rn its like took or not - i want it to be able to log almost like
// food - one click, but i can log morning and night too if i take something twice". One tap on "+ name" logs an intake now:
// the plan's tick when it's due and unanswered, otherwise another intake, shown in the slot it was taken in.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  const pg = await ctx.newPage();
  await pg.clock.install({ time: new Date('2026-10-13T08:15:00') });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  await pg.evaluate(() => { const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = [];
    s.supplements = [{ id: 'mag', name: 'Magnesium', dose: '200 mg', slot: 'evening', at: 1290, active: true }, { id: 'd3', name: 'Vitamin D3', dose: '2000 IU', slot: 'morning', at: 480, active: true }];
    localStorage.setItem(k, JSON.stringify(s)); });
  const at = async (iso) => { await pg.clock.setFixedTime(new Date(iso)); await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('#stack'); };
  const supps = async () => { await pg.waitForTimeout(350); return ((await pg.evaluate(() => JSON.parse(localStorage.getItem('healthos.v1:u-test') || '{}'))).entries || []).filter((e) => e.kind === 'supp'); };
  const chip = (name) => pg.locator('#stack').getByRole('button', { name: new RegExp(`^Log ${name} now`) });
  const extras = () => pg.locator('#stack .stack-row.extra').allInnerTexts().then((t) => t.map((x) => x.replace(/\s+/g, ' ')));

  // 08:15
  await at('2026-10-13T08:15:00');
  check('Today\'s stack has one-tap chips for each supplement', await chip('Magnesium').count() === 1 && await chip('Vitamin D3').count() === 1);
  await chip('Vitamin D3').click();
  let s = await supps();
  check(`"+ Vitamin D3" in the morning it's planned for: that's the tick (${JSON.stringify(s.map((e) => [e.suppId, e.slot, e.again ?? false]))})`, s.length === 1 && s[0].suppId === 'd3' && s[0].slot === 'morning' && !s[0].again);
  check('…its ✓ shows taken, and there\'s no extra row', await pg.getByRole('button', { name: 'Took Vitamin D3' }).getAttribute('aria-pressed') === 'true' && (await extras()).length === 0);
  check('…with Undo, like food', await pg.getByRole('status').filter({ hasText: 'Logged Vitamin D3' }).count() === 1);
  await chip('Magnesium').click();
  check(`"+ Magnesium" in the morning (planned for the evening): an extra, listed under Morning (${await extras()})`, (await extras()).length === 1 && /Magnesium 08:15 · extra/.test((await extras())[0]));
  check(`the header counts it (${await pg.locator('#stack h3').innerText()})`, /\+1 more/.test(await pg.locator('#stack h3').innerText()));
  check(`the chip says how many today (${await chip('Magnesium').innerText()})`, /1×/.test(await chip('Magnesium').innerText()));

  // 22:00 and 23:30: morning and night, and once more
  await at('2026-10-13T22:00:00');
  await chip('Magnesium').click();
  check('22:00 "+ Magnesium": the evening tick', await pg.getByRole('button', { name: 'Took Magnesium' }).getAttribute('aria-pressed') === 'true');
  await at('2026-10-13T23:30:00');
  await chip('Magnesium').click();
  s = (await supps()).filter((e) => e.suppId === 'mag');
  check(`23:30 once more: logged as "again" (${JSON.stringify(s.map((e) => [e.slot, e.again ?? false]))})`, s.length === 3 && s[2].again === true && s[2].slot === 'evening');
  const ex = await extras();
  check(`both extras listed in their slots (${ex.join(' | ')})`, ex.length === 2 && /08:15 · extra/.test(ex[0]) && /23:30 · again/.test(ex[1]));
  check(`chip: 3× today (${await chip('Magnesium').innerText()})`, /3×/.test(await chip('Magnesium').innerText()));
  await pg.locator('#stack').screenshot({ path: OUT + 'supplog-stack.png' });
  // the ✓ toggles the plan's answer, not the extra
  await pg.getByRole('button', { name: 'Took Magnesium' }).click();
  s = (await supps()).filter((e) => e.suppId === 'mag');
  check(`un-ticking ✓ removes the evening tick, the extras stay (${JSON.stringify(s.map((e) => [e.slot, e.again ?? false]))})`, s.length === 2 && s.some((e) => e.again) && s.some((e) => e.slot === 'morning'));
  await pg.getByRole('button', { name: /^Remove Magnesium at 08:15/ }).click();
  check('× removes an extra', (await supps()).filter((e) => e.suppId === 'mag').length === 1);

  // Log → Stack: the same one tap; Logged today shows it
  await pg.goto(APP + '#log/stack'); await pg.waitForTimeout(200);
  await pg.getByRole('group', { name: 'Log a supplement now' }).getByRole('button', { name: /^Log Vitamin D3 now/ }).click();
  s = (await supps()).filter((e) => e.suppId === 'd3');
  check(`Log → Stack: "+ Vitamin D3" at night logs another (${s.length})`, s.length === 2);
  check(`phone: nothing wider than the screen (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
