// How often a supplement is taken (PLAN 190; owner, 3 Nov: "Should be able to set supplements not as daily but cycling,
// taking only when needing it like l theanine so i should have rhe option to log it but not every day i need it").
// Creatine every day, L-theanine when needed, Ashwagandha 5 days on / 2 off from Mon 2 Nov. Sat 7 Nov 09:00: Today's stack
// lists Creatine only (1 to tick), says L-theanine is logged when taken and Ashwagandha is off until Monday; "+ L-theanine"
// logs it and it shows as taken, the count unchanged; For you's "yesterday" never asks about L-theanine. Mon 9 Nov:
// Ashwagandha is back on the list. Log → Stack: How often, the cycle's choices; a cycle set there shows in the list. 320 px.
const { chromium, APP, OUT, handle, openCard } = require('./harness.cjs');

const KEY = 'healthos.v1:u-test';
(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 320, height: 760 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  const pg = await ctx.newPage();
  await pg.clock.install({ time: new Date('2026-11-07T09:00:00') });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  await pg.evaluate((k) => { const s = JSON.parse(localStorage.getItem(k) || '{}'); s.workouts = [];
    // taken before, so "yesterday" would ask about each that's due
    s.entries = ['cre', 'lth', 'ash'].map((id, i) => ({ id: 'e' + i, kind: 'supp', at: new Date('2026-11-04T08:00:00').getTime(), suppId: id, status: 'taken' }));
    s.supplements = [
      { id: 'cre', name: 'Creatine', dose: '5 g', slot: 'morning', at: 480, active: true },
      { id: 'lth', name: 'L-theanine', dose: '200 mg', slot: 'morning', at: 480, active: true, schedule: { kind: 'needed' } },
      { id: 'ash', name: 'Ashwagandha', dose: '600 mg', slot: 'morning', at: 480, active: true, schedule: { kind: 'cycle', on: 5, off: 2, from: '2026-11-02' } },
    ];
    localStorage.setItem(k, JSON.stringify(s)); }, KEY);
  await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('.t2-status');
  await openCard(pg, 'stack');
  const rows = await pg.locator('#stack .stack-row:not(.extra)').allInnerTexts();
  const stack = (await pg.locator('#stack').innerText()).replace(/\s+/g, ' ');
  check(`Sat: Today's list is Creatine alone (${rows.map((r) => r.split('\n')[0]).join(', ')})`, rows.length === 1 && /^Creatine/.test(rows[0]) && /0 of 1 taken/.test(stack));
  check(`…and says where the others are (${(stack.match(/L-theanine: [^·]+· Ashwagandha: [^+]+?(?= Took| \+)/) || [''])[0]})`, /L-theanine: log it when you take it · Ashwagandha: off — back on Mon 9 Nov/.test(stack));
  check(`320: fits (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 320);
  await pg.locator('#stack').screenshot({ path: OUT + 'suppschedule-stack.png' });
  await pg.locator('#stack').getByRole('button', { name: /^Log L-theanine now/ }).click(); await pg.waitForTimeout(300);
  const extra = (await pg.locator('#stack .stack-row.extra').allInnerTexts()).map((t) => t.replace(/\s+/g, ' '));
  const logged = await pg.evaluate((k) => JSON.parse(localStorage.getItem(k)).entries.filter((e) => e.suppId === 'lth' && e.at > new Date('2026-11-07T00:00:00').getTime()).map((e) => e.status), KEY);
  check(`"+ L-theanine": logged taken, shown with the day's stack, the count unchanged (${extra.join(' | ')} · ${JSON.stringify(logged)})`, logged.join() === 'taken' && extra.length === 1 && /^L-theanine 09:00/.test(extra[0]) && /0 of 1 taken/.test(await pg.locator('#stack').innerText()));
  // yesterday (Fri, Ashwagandha on): asked about Creatine and Ashwagandha, never L-theanine
  const yday = (await pg.locator('.fy-item[data-key="catchup"]').innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(`For you's "yesterday": Creatine and Ashwagandha, not L-theanine (${yday.slice(0, 140)})`, /Creatine/.test(yday) && /Ashwagandha/.test(yday) && !/L-theanine/.test(yday));

  // Mon 9 Nov: the cycle's on again
  await pg.clock.setFixedTime(new Date('2026-11-09T09:00:00')); await pg.reload(); await pg.waitForSelector('.t2-status');
  await openCard(pg, 'stack');
  const mon = (await pg.locator('#stack .stack-row:not(.extra)').allInnerTexts()).map((r) => r.split('\n')[0].split(' ')[0]);
  check(`Mon: Ashwagandha back on the list (${mon.join(', ')})`, mon.join() === 'Creatine,Ashwagandha');

  // Log → Stack: How often
  await pg.goto(APP + '#log/stack'); await pg.waitForTimeout(300);
  const list = (await pg.locator('.supp-row').allInnerTexts()).map((t) => t.replace(/\s+/g, ' '));
  check(`the list says how often (${list.join(' | ')})`, /^Creatine 5 g Morning 08:00/.test(list[0]) && /^L-theanine 200 mg when needed/.test(list[1]) && /^Ashwagandha 600 mg Morning 08:00 · 5 days on, 2 days off · on — day 1 of 5/.test(list[2]));
  await pg.locator('.supp-row').first().getByRole('button', { name: 'Edit' }).click();
  const often = pg.getByRole('group', { name: 'How often you take it' });
  check(`editing: How often, every day picked (${(await often.innerText()).replace(/\s+/g, ' ')})`, await often.getByRole('button', { name: 'Every day' }).getAttribute('aria-pressed') === 'true');
  await often.getByRole('button', { name: 'In cycles' }).click();
  await pg.getByRole('button', { name: '3 weeks on · 1 off' }).click();
  const today = (await pg.locator('.cycle-edit .note').innerText()).replace(/\s+/g, ' ');
  check(`a cycle: 3 weeks on, 1 off, from today (${today})`, today === 'Today: on — day 1 of 21');
  await pg.locator('.supp-edit').screenshot({ path: OUT + 'suppschedule-edit.png' });
  await often.getByRole('button', { name: 'When needed' }).click();
  check('when needed: no time of day to pick', await pg.getByRole('group', { name: 'When you take it' }).count() === 0);
  await often.getByRole('button', { name: 'In cycles' }).click(); await pg.getByRole('button', { name: '3 weeks on · 1 off' }).click();
  await pg.getByRole('button', { name: 'Done' }).click(); await pg.waitForTimeout(200);
  const first = (await pg.locator('.supp-row').first().innerText()).replace(/\s+/g, ' ');
  const saved = await pg.evaluate((k) => JSON.parse(localStorage.getItem(k)).supplements.find((s) => s.id === 'cre').schedule, KEY);
  check(`saved and listed (${first} · ${JSON.stringify(saved)})`, /3 weeks on, 1 week off · on — day 1 of 21/.test(first) && saved.kind === 'cycle' && saved.on === 21 && saved.off === 7 && saved.from === '2026-11-09');
  check(`320: fits (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 320);
  console.log('errors: ' + JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH ' + e.message); process.exit(1); });
