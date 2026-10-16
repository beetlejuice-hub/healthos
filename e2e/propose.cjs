// The AI sets things up for you (PLAN 98; owner: "understand protocols i give him, and help me set up in app"). A fake AI
// turns a protocol into proposed changes; each shows under the reply as a card; nothing changes until Apply; Apply makes
// exactly that change (the stack, the dose with its history, the protein goal); Not now leaves it; a duplicate is one
// card; a bad one goes back to the AI as an error; cards keep their state after a reload; a second Apply can't happen.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

const NOW = new Date('2026-10-16T10:00:00').getTime(), KEY = 'healthos.v1:u-test';
const CALLS = [
  { id: 'p1', name: 'propose', input: { change: 'add_supplement', supplement: 'Creatine', dose: '5 g', slots: ['morning'], why: 'the best-studied one for strength' } },
  { id: 'p2', name: 'propose', input: { change: 'dose', supplement: 'magnesium', dose: '400 mg', why: 'the dose the sleep studies used' } },
  { id: 'p3', name: 'propose', input: { change: 'goals', protein: 170, why: '2 g per kg while cutting' } },
  { id: 'p4', name: 'propose', input: { change: 'add_supplement', supplement: 'Creatine', dose: '5 g', slots: ['morning'], why: 'again' } },
  { id: 'p5', name: 'propose', input: { change: 'dose', supplement: 'zinc', dose: '15 mg', why: '' } },
];
const calls = [];

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  await ctx.route('**/api/ai/usage**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ usage: null, cap: 50, on: true }) }));
  await ctx.route('**/api/ai?**', (r) => {
    const body = r.request().postDataJSON(); calls.push(body);
    if (body.task !== 'chat') return r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' });
    const answer = body.turn ? { reply: 'Three changes are waiting below — **tap Apply** on the ones you want.', remember: [] }
      : { reply: '', remember: [], calls: CALLS, turn: [{ role: 'assistant', content: CALLS.map((c) => ({ type: 'tool_use', ...c })) }] };
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ answer, usage: null, costUsd: 0.02, model: 'opus' }) });
  });
  const pg = await ctx.newPage();
  await pg.clock.install({ time: NOW });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  await pg.evaluate((k) => { const s = JSON.parse(localStorage.getItem(k) || '{}');
    s.supplements = [{ id: 'mag', name: 'Magnesium glycinate', dose: '200 mg', slot: 'evening', at: 1290, active: true }];
    s.goals = { kcal: 2400, p: 150, c: 260, f: 75 }; s.ai = { ...(s.ai || {}), chat: [] };
    localStorage.setItem(k, JSON.stringify(s)); }, KEY);
  await pg.goto(APP + '#ai'); await pg.reload(); await pg.waitForSelector('.chatbox');
  const st = () => pg.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}'), KEY);

  await pg.getByLabel('Message the AI').fill('set me up: creatine 5g mornings, magnesium up to 400, protein 170');
  await pg.getByRole('button', { name: 'Send' }).click();
  await pg.waitForSelector('.propose');
  const cards = pg.locator('.propose');
  const labels = await cards.locator('b').allInnerTexts();
  check(`three cards, the duplicate shown once (${labels.join(' | ')})`, labels.join('|') === 'Add Creatine 5 g · Morning|Magnesium glycinate: 200 mg → 400 mg|Protein goal 150 → 170 g');
  const res = calls.filter((c) => c.task === 'chat')[1]?.turn?.[1]?.content ?? [];
  check('the AI was told: waiting for a tap; the duplicate once; the unknown one as an error', /Nothing changes until they tap Apply/.test(res[0]?.content) && res[3]?.content === 'Already proposed in this reply.' && res[4]?.is_error === true && /zinc isn't in the stack/.test(res[4]?.content));
  let s = await st();
  check('nothing changed before a tap', s.supplements.length === 1 && s.supplements[0].dose === '200 mg' && s.goals.p === 150);
  check('"looked at" doesn\'t list proposing as looking', !/looked at/.test(await pg.locator('.msg.assistant').last().innerText()));
  await pg.locator('.msg.assistant').last().screenshot({ path: OUT + 'propose-cards.png' });

  await cards.nth(0).getByRole('button', { name: 'Apply' }).click(); await pg.waitForTimeout(150);
  s = await st();
  const cr = s.supplements.find((x) => x.name === 'Creatine');
  check(`Apply adds it, in the morning, active (${JSON.stringify(cr)})`, cr && cr.dose === '5 g' && cr.slot === 'morning' && cr.active === true && s.supplements.length === 2);
  check(`the card says it's done (${await cards.nth(0).innerText()})`, /✓ Added Creatine/.test(await cards.nth(0).innerText()) && await cards.nth(0).getByRole('button', { name: 'Apply' }).count() === 0);
  check('a new supplement gets looked up, like one added by hand', calls.some((c) => c.task === 'supplement' && c.name === 'Creatine'));

  await cards.nth(1).getByRole('button', { name: 'Not now' }).click(); await pg.waitForTimeout(150);
  check('Not now leaves the dose, keeps Apply', (await st()).supplements.find((x) => x.id === 'mag').dose === '200 mg' && /not applied/.test(await cards.nth(1).innerText()) && await cards.nth(1).getByRole('button', { name: 'Apply' }).count() === 1);
  await cards.nth(2).getByRole('button', { name: 'Apply' }).click(); await pg.waitForTimeout(150);
  s = await st();
  check(`protein goal 170, the rest as it was (${JSON.stringify(s.goals)})`, s.goals.p === 170 && s.goals.kcal === 2400 && s.goals.c === 260);

  // a reload: the cards remember; the one left for later can still be applied, and the dose keeps its history
  await pg.reload(); await pg.waitForSelector('.propose');
  check(`after a reload: applied stays applied, the skipped one waits (${(await cards.allInnerTexts()).map((t) => t.replace(/\s+/g, ' ')).join(' | ')})`,
    /✓ Applied 10:00/.test(await cards.nth(0).innerText()) && /not applied/.test(await cards.nth(1).innerText()) && /✓ Applied/.test(await cards.nth(2).innerText()));
  await cards.nth(1).getByRole('button', { name: 'Apply' }).click(); await pg.waitForTimeout(150);
  const mag = (await st()).supplements.find((x) => x.id === 'mag');
  check(`the skipped dose applied later: 400 mg, the old dose kept for past days (${JSON.stringify(mag.doseLog)})`, mag.dose === '400 mg' && mag.doseLog?.length === 2 && mag.doseLog[0].dose === '200 mg');

  // where you'd look for it: the stack shows both
  await pg.goto(APP + '#log/stack'); await pg.waitForTimeout(250);
  const stack = (await pg.locator('.supp-row').allInnerTexts()).map((t) => t.replace(/\s+/g, ' '));
  check(`Log → Stack shows them (${stack.join(' | ')})`, stack.some((t) => /Magnesium glycinate 400 mg/.test(t)) && stack.some((t) => /Creatine 5 g/.test(t)));

  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
