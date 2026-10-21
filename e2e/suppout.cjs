// A supplement you ran out of, or one that isn't yours (owner, 20 Oct: "Also I'm technically out of vit d and dont have vit
// b but i took from my moms stack so i should be able to tell ai i took x amount of vit d3 and it should log without
// offering the restock option for vit d3. I mean it can offfer but also should be able to just log."). Today's one-tap
// chips show Vitamin D3 marked "out": a tap logs it and it stays ran out. In the chat, "took 2000 IU D3 at 8:30 and a vit
// B from mom's" → two cards; Log it logs each (B as a stopped one-off, so Today never asks for it); D3 is still out.
const { chromium, APP, OUT, handle, seed, openCard } = require('./harness.cjs');

const NOW = new Date('2026-10-16T10:00:00').getTime(), KEY = 'healthos.v1:u-test';
const CALLS = [
  { id: 'l1', name: 'propose', input: { change: 'log_supplement', supplement: 'vit d3', amount: '2000 IU', time: '08:30', why: "from your mom's bottle" } },
  { id: 'l2', name: 'propose', input: { change: 'log_supplement', supplement: 'Vitamin B complex', amount: '1 tablet', why: "from your mom's stack" } },
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
    const answer = body.turn ? { reply: 'Two to log below — **tap Log it**.', remember: [] }
      : { reply: '', remember: [], calls: CALLS, turn: [{ role: 'assistant', content: CALLS.map((c) => ({ type: 'tool_use', ...c })) }] };
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ answer, usage: null, costUsd: 0.02, model: 'opus' }) });
  });
  const pg = await ctx.newPage();
  await pg.clock.install({ time: NOW });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  await seed(pg, APP + '#today', ([k, now]) => { const s = JSON.parse(localStorage.getItem(k) || '{}');
    s.supplements = [{ id: 'd3', name: 'Vitamin D3', dose: '2000 IU', slot: 'morning', at: 480, active: false, status: 'out' },
      { id: 'mag', name: 'Magnesium glycinate', dose: '200 mg', slot: 'evening', at: 1290, active: true }];
    s.entries = [{ id: 'f', kind: 'food', at: now - 2 * 3600e3, name: 'Oats', grams: 80, macros: { kcal: 300, p: 10, c: 50, f: 6 } }];
    s.ai = { ...(s.ai || {}), chat: [] };
    localStorage.setItem(k, JSON.stringify(s)); }, [KEY, NOW]);
  const st = () => pg.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}'), KEY);
  const supps = async () => (await st()).entries.filter((e) => e.kind === 'supp');

  await pg.waitForSelector('#stack'); await openCard(pg, 'stack');
  const chip = pg.locator('.supp-quick .sq-chip', { hasText: 'Vitamin D3' }).first();
  check(`Today: Vitamin D3 is offered, marked out (${(await chip.innerText().catch(() => '—')).replace(/\s+/g, ' ')})`, await chip.count() === 1 && /out/.test(await chip.innerText()));
  await pg.locator('.supp-quick').first().screenshot({ path: OUT + 'suppout-chips.png' });
  await chip.click(); await pg.waitForTimeout(200);
  let s = await st(), es = await supps();
  check(`one tap logs it (${JSON.stringify(es.map((e) => [e.suppId, e.status]))})`, es.length === 1 && es[0].suppId === 'd3' && es[0].status === 'taken');
  check('…and it stays ran out — nothing restocked', s.supplements.find((x) => x.id === 'd3').status === 'out' && s.supplements.find((x) => x.id === 'd3').active === false);
  check('the chip counts it', /1×/.test(await chip.innerText()));

  await pg.goto(APP + '#ai'); await pg.waitForSelector('.chatbox');
  await pg.getByLabel('Message the AI').fill("took 2000 IU D3 at 8:30 and a vit B from mom's stack");
  await pg.getByRole('button', { name: 'Send' }).click();
  await pg.waitForSelector('.propose');
  const cards = pg.locator('.propose');
  const labels = await cards.locator('b').allInnerTexts();
  check(`two cards (${labels.join(' | ')})`, labels.join('|') === "Log Vitamin D3 2000 IU · 08:30 · you're out: this doesn't restock it|Log Vitamin B complex 1 tablet · 10:00 · not in your stack: logged as a one-off");
  check('nothing logged before a tap', (await supps()).length === 1);
  await pg.locator('.msg.assistant').last().screenshot({ path: OUT + 'suppout-cards.png' });
  await cards.nth(0).getByRole('button', { name: 'Log it' }).click(); await pg.waitForTimeout(150);
  await cards.nth(1).getByRole('button', { name: 'Log it' }).click(); await pg.waitForTimeout(150);
  s = await st(); es = await supps();
  const at830 = new Date('2026-10-16T08:30:00').getTime();
  const d = es.find((e) => e.suppId === 'd3' && e.at === at830), vb = s.supplements.find((x) => x.name === 'Vitamin B complex');
  check(`D3 logged at 08:30 (${JSON.stringify(d)})`, !!d && d.status === 'taken' && !d.amount);
  check(`B complex kept as a stopped one-off and logged now (${JSON.stringify(vb)})`, vb && vb.active === false && vb.status === 'stopped' && es.some((e) => e.suppId === vb.id && Math.abs(e.at - NOW) < 60e3 && e.status === 'taken'));
  check('D3 still out, nothing added to what Today asks for', s.supplements.find((x) => x.id === 'd3').status === 'out' && s.supplements.filter((x) => x.active).length === 1);
  check(`the cards say it's done (${(await cards.nth(0).innerText()).replace(/\s+/g, ' ')})`, /✓ Logged Vitamin D3 2000 IU at 08:30 — still marked as ran out/.test(await cards.nth(0).innerText()) && /✓ Logged Vitamin B complex 1 tablet at 10:00/.test(await cards.nth(1).innerText()));

  await pg.goto(APP + '#today'); await pg.waitForSelector('#stack'); await openCard(pg, 'stack');
  const body = await pg.locator('body').innerText();
  check('Today never asks about Vitamin B complex', !/Vitamin B complex/.test(await pg.locator('.supp-quick').first().innerText()));
  check('the restock offer is still there for D3 ("it can offer")', /Out of Vitamin D3/.test(body));

  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
