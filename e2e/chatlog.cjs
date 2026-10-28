// Logging and fixing from the chat (owner, 28 Oct: "give ai more tools, so it can reach and do more inside app"; picked "Log
// and edit from chat"). 10:00: "2 eggs and a flat white at 8, and yesterday's rice was 300 g not 200" — a fake AI proposes
// three cards; nothing changes before a tap; "Log it" adds exactly the eggs and the coffee (Today's numbers move, Log → Food
// lists the eggs); "Change it" makes the rice 300 g with its calories scaled; "Put it back" restores 200 g; a reload keeps
// the cards' state. 320 px fits.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

const NOW = new Date('2026-10-16T10:00:00').getTime(), KEY = 'healthos.v1:u-test';
const RICE = { id: 'rice1', kind: 'food', at: new Date('2026-10-15T19:00:00').getTime(), name: 'Rice', grams: 200, macros: { kcal: 260, p: 5, c: 56, f: 1 } };
const CALLS = [
  { id: 'p1', name: 'propose', input: { change: 'log_food', name: 'Scrambled eggs', grams: 120, kcal: 180, protein: 13, carbs: 1, fat: 14, time: '08:00', why: '2 eggs, estimated' } },
  { id: 'p2', name: 'propose', input: { change: 'log_drink', name: 'Flat white', ml: 200, caffeine_mg: 80, kcal: 110, time: '08:00', why: 'a usual flat white' } },
  { id: 'p3', name: 'propose', input: { change: 'edit_entry', entry: '[id:rice1]', grams: 300, why: 'you said 300 g' } },
];

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  for (const width of [390, 320]) {
    const ctx = await b.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    await ctx.route('**/api/ai/usage**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ usage: null, cap: 50, on: true }) }));
    await ctx.route('**/api/ai?**', (r) => {
      const body = r.request().postDataJSON();
      if (body.task !== 'chat') return r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' });
      const answer = body.turn ? { reply: 'Two to log and one fix — **tap** the ones that are right.', remember: [] }
        : { reply: '', remember: [], calls: CALLS, turn: [{ role: 'assistant', content: CALLS.map((c) => ({ type: 'tool_use', ...c })) }] };
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ answer, usage: null, costUsd: 0.01, model: 'sonnet' }) });
    });
    const pg = await ctx.newPage();
    await pg.clock.install({ time: NOW });
    pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    await pg.goto(APP);
    await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
    await pg.evaluate(([k, rice]) => { const s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = [rice]; s.goals = { kcal: 2400, p: 150, c: 260, f: 75 }; s.ai = { ...(s.ai || {}), chat: [] }; localStorage.setItem(k, JSON.stringify(s)); }, [KEY, RICE]);
    await pg.goto(APP + '#ai'); await pg.reload(); await pg.waitForSelector('.chatbox');
    const st = () => pg.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}'), KEY);

    await pg.getByLabel('Message the AI').fill("2 eggs and a flat white at 8, and yesterday's rice was 300 g not 200");
    await pg.getByRole('button', { name: 'Send' }).click();
    await pg.waitForSelector('.propose');
    const cards = pg.locator('.propose');
    const labels = await cards.locator('b').allInnerTexts();
    check(`${width}: three cards (${labels.join(' | ')})`, labels.join('|') === 'Log Scrambled eggs 120 g · 180 kcal, 13 g protein · 08:00|Log Flat white 200 ml · 80 mg caffeine, 110 kcal · 08:00|Change Rice (260 kcal): 200 → 300 g (260 → 390 kcal)');
    check(`${width}: fits (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= width);
    if (width === 320) { await pg.locator('.msg.assistant').last().screenshot({ path: OUT + 'chatlog-320.png' }); await ctx.close(); continue; }
    let s = await st();
    check('nothing logged before a tap', s.entries.length === 1 && s.entries[0].grams === 200);

    await cards.nth(0).getByRole('button', { name: 'Log it' }).click(); await pg.waitForTimeout(150);
    await cards.nth(1).getByRole('button', { name: 'Log it' }).click(); await pg.waitForTimeout(150);
    s = await st();
    const eggs = s.entries.find((e) => e.name === 'Scrambled eggs'), fw = s.entries.find((e) => e.name === 'Flat white');
    check(`"Log it" adds exactly what the card said (${JSON.stringify(eggs?.macros)}, ${fw?.caffeineMg} mg at ${fw && new Date(fw.at).toTimeString().slice(0, 5)})`,
      eggs && eggs.grams === 120 && eggs.macros.kcal === 180 && eggs.macros.p === 13 && new Date(eggs.at).getHours() === 8 && fw && fw.caffeineMg === 80 && fw.ml === 200 && new Date(fw.at).getHours() === 8);
    check(`the cards say so (${(await cards.nth(0).innerText()).replace(/\n/g, ' ')})`, /✓ Logged Scrambled eggs at 08:00/.test(await cards.nth(0).innerText()) && await cards.nth(0).getByRole('button', { name: 'Log it' }).count() === 0);

    await cards.nth(2).getByRole('button', { name: 'Change it' }).click(); await pg.waitForTimeout(150);
    s = await st();
    const rice = s.entries.find((e) => e.id === 'rice1');
    check(`"Change it": the rice is 300 g, its calories scaled (${rice.grams} g, ${rice.macros.kcal} kcal)`, rice.grams === 300 && rice.macros.kcal === 390 && rice.at === RICE.at);
    await cards.nth(2).getByRole('button', { name: 'Put it back' }).click(); await pg.waitForTimeout(150);
    const back = (await st()).entries.find((e) => e.id === 'rice1');
    check(`"Put it back" restores it (${back.grams} g, ${back.macros.kcal} kcal)`, back.grams === 200 && back.macros.kcal === 260);
    await pg.locator('.msg.assistant').last().screenshot({ path: OUT + 'chatlog.png' });

    await pg.reload(); await pg.waitForSelector('.propose');
    check('after a reload the logged cards stay logged', /✓/.test(await pg.locator('.propose').nth(0).innerText()) && await pg.locator('.propose').nth(0).getByRole('button', { name: 'Log it' }).count() === 0);
    await pg.goto(APP + '#today'); await pg.waitForSelector('.t2-status');
    const kcal = (await pg.locator('.t2-tile[data-card="fuel"]').first().innerText()).replace(/\s+/g, ' ');
    check(`Today's numbers moved (${kcal})`, /2,110/.test(kcal));
    await pg.goto(APP + '#log/food'); await pg.waitForTimeout(300);
    check('Log → Food lists the eggs', /Scrambled eggs/.test(await pg.locator('body').innerText()));
    await ctx.close();
  }
  console.log('errors: ' + JSON.stringify(errs)); await b.close();
})().catch((e) => { console.log('CRASH ' + e.message); process.exit(1); });
