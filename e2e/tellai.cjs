// Tell the AI, on a finding (owner, 31 Oct: "If there's an insight, finding like alcohol and training day correlation i
// should be able to just say my opinion to ai like it makes no sense to me. It's fun to see it though"). The sample's
// Noticed cards on Insights, a fake AI. (1) "Tell the AI" opens the line with the one-tap replies; "Makes no sense to me"
// goes to the chat as his words, with the finding under its own heading; the reply shows under the card. (2) "I knew that"
// on another card: the AI remembers it as "Knows: …", and it's in the memory every read gets. Controls: the card is as it
// was until tapped (no line, no request); a server with the AI off shows no button at all. 320 px fits.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

const KEY = 'healthos.v1:u-test';

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  async function open(width, on, chats) {
    const ctx = await b.newContext({ viewport: { width, height: 800 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    await ctx.route('**/api/ai/usage**', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ usage: null, cap: 50, on }) }));
    await ctx.route('**/api/ai?**', (r) => {
      const body = r.request().postDataJSON();
      if (body.task !== 'chat') return r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' });
      chats.push(body);
      const said = body.messages.at(-1)?.text ?? '';
      const knew = /: I knew that$/.test(said) && !body.turn;
      const title = said.match(/^Re “(.+)”:/)?.[1] ?? '';
      const call = { id: 'k1', name: 'remember', input: { text: `Knows: ${title}` } };
      const answer = knew ? { reply: '', remember: [], calls: [call], turn: [{ role: 'assistant', content: [{ type: 'tool_use', ...call }] }] }
        : body.turn ? { reply: 'Noted — **the reads won\'t bring it up as news.**', remember: [] }
          : { reply: 'Fair to doubt it. **How it was found:** your days with it against your days without. What do you think is going on?', remember: [] };
      r.fulfill({ contentType: 'application/json', body: JSON.stringify({ answer, usage: null, costUsd: 0.01, model: 'sonnet' }) });
    });
    const pg = await ctx.newPage();
    pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
    await pg.goto(APP);
    await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
    await pg.goto(APP + '#settings'); await pg.getByRole('button', { name: /Load sample/ }).click(); await pg.waitForTimeout(300);
    await pg.goto(APP + '#insights/connections'); await pg.waitForSelector('.ncard', { timeout: 15000 }); await pg.waitForTimeout(400);
    return { ctx, pg };
  }
  const stored = async (pg, f, ok) => { let v; for (let i = 0; i < 30; i++) { v = f(await pg.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY)); if (ok(v)) break; await pg.waitForTimeout(100); } return v; };

  const chats = [];
  let { ctx, pg } = await open(320, true, chats);
  const cards = pg.locator('.ncard');
  const n = await cards.count();
  check(`every Noticed card has "Tell the AI" (${await pg.locator('.ncard .tell-ai > button').count()} of ${n})`, n >= 2 && await pg.locator('.ncard .tell-ai > button').count() === n);
  check('control: nothing open and nothing asked before a tap', await pg.locator('.ncard .ask-about').count() === 0 && chats.length === 0);

  // 1. "Makes no sense to me"
  const c1 = cards.nth(0), t1 = (await c1.locator('h3').innerText()).trim();
  await c1.getByRole('button', { name: 'Tell the AI' }).click();
  const chips = await c1.locator('.ask-about .chips button').allInnerTexts();
  check(`tapped: the one-tap replies (${chips.join(' | ')})`, chips[0] === 'Makes no sense to me' && chips[1] === 'I knew that');
  check(`320, open: the replies fit (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 320);
  await c1.screenshot({ path: OUT + 'tellai-open-320.png' });
  await c1.getByRole('button', { name: 'Makes no sense to me' }).click();
  await c1.locator('.ask-reply:not(.typing)').waitFor({ timeout: 5000 }).catch(() => {});
  const q = chats[0], said = q?.messages.at(-1)?.text ?? '';
  check(`it goes to the chat as your words (${said})`, said === `Re “${t1}”: Makes no sense to me`);
  const head = q?.context.match(/## The app's finding this message is about \(Insights → Noticed\)\n(.*)/)?.[1] ?? '';
  check(`…with the finding under its own heading (${head.slice(0, 110)})`, head.startsWith(`${t1} — `) && /Evidence: /.test(head));
  const reply = await c1.locator('.ask-reply').innerText().catch(() => '');
  check(`the reply shows under the card (${reply.split('\n')[0].slice(0, 60)})`, /Fair to doubt it/.test(reply));
  check(`320: fits (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 320);
  await c1.screenshot({ path: OUT + 'tellai-320.png' });

  // 2. "I knew that" → remembered as "Knows: …", in the memory every read gets
  const c2 = cards.nth(1), t2 = (await c2.locator('h3').innerText()).trim();
  await c2.getByRole('button', { name: 'Tell the AI' }).click();
  await c2.getByRole('button', { name: 'I knew that' }).click();
  await c2.locator('.ask-reply:not(.typing)').waitFor({ timeout: 5000 }).catch(() => {});
  const mem = await stored(pg, (s) => s.ai.memory.map((m) => m.text), (v) => v.length > 0);
  check(`"I knew that" → remembered (${mem.join(' | ')})`, mem.length === 1 && mem[0] === `Knows: ${t2}`);
  check(`…and the reply says the reads won't bring it up (${(await c2.locator('.ask-reply').innerText().catch(() => '')).split('\n')[0]})`, /won't bring it up as news/.test(await c2.locator('.ask-reply').innerText().catch(() => '')));
  // the next message's context carries it, as the reads' does ("## What you remember about me")
  await c1.locator('.ask-about input').fill('ok'); await c1.locator('.ask-about').getByRole('button', { name: 'Send' }).click();
  await pg.waitForTimeout(400);
  check('the next message to the AI carries it in memory', /## What you remember about me\n- Knows: /.test(chats.at(-1)?.context ?? ''));
  // tapping again closes it
  await c2.getByRole('button', { name: 'Tell the AI' }).click();
  check('tapping again closes the line', await c2.locator('.ask-about').count() === 0);
  await ctx.close();

  // control: the AI is off on the server → no button anywhere (nothing that can't work is offered)
  const none = [];
  ({ ctx, pg } = await open(390, false, none));
  check(`control: AI off → no "Tell the AI" (${await pg.locator('.ncard').count()} cards, ${await pg.locator('.tell-ai').count()} buttons)`, await pg.locator('.ncard').count() >= 2 && await pg.locator('.tell-ai').count() === 0 && none.length === 0);
  await ctx.close();
  console.log('errors: ' + JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH ' + e.message); process.exit(1); });
