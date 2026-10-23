// Talking back (PLAN 164; owner, 22 Oct: "small chat w ai button next to findings, studies, etc at morning and night digest
// messages so i can ask or say things like, for me its the opposite, or that can u recommend supps or food" · the Noticed
// box "just face value, so i can input whatever, a finding, a new supp that makes me feel good, ai can understand
// everything and make changes/ sort things/ start ivestigating"). A fake AI. (1) A morning read item: "For me it's the
// opposite" goes to the chat with the item attached; the AI remembers it; its reply shows under the item and in the AI
// tab. (2) The Noticed box: "Started magnesium glycinate…" is kept as a note and read by the AI at once, which proposes
// adding it to the stack; the reply and its Apply card show under the box; Apply puts it in the stack — not before.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

const NOW = new Date('2026-10-22T09:00:00').getTime(), KEY = 'healthos.v1:u-test';
const ITEM = { type: 'pattern', title: 'Beer nights cost you a point of sleep', text: '6.1 after drinks vs 7.2 without.', sure: 'yours', measure: 'sleep' };
const REMEMBER = { id: 'r1', name: 'remember', input: { text: 'A beer or two doesn\'t cost him sleep — he finds the opposite' } };
const PROPOSE = { id: 'p1', name: 'propose', input: { change: 'add_supplement', supplement: 'Magnesium glycinate', dose: '400 mg', slots: ['evening'], why: 'you said it helps you sleep' } };

(async () => {
  const b = await chromium.launch(); const errs = [], chats = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  await ctx.route('**/api/ai/usage**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ usage: null, cap: 50, on: true }) }));
  await ctx.route('**/api/ai?**', (r) => {
    const body = r.request().postDataJSON();
    if (body.task !== 'chat') return r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' });
    chats.push(body);
    const notice = /"Noticed something\?" box/.test(body.context), call = notice ? PROPOSE : REMEMBER;
    const answer = body.turn ? { reply: notice ? 'Magnesium glycinate at night — **tap Apply** to add it. I\'ll watch your sleep ratings on the nights you take it.' : 'Fair — your own nights say beer **doesn\'t** dent your sleep. I\'ll remember that.', remember: [] }
      : { reply: '', remember: [], calls: [call], turn: [{ role: 'assistant', content: [{ type: 'tool_use', ...call }] }] };
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ answer, usage: null, costUsd: 0.03, model: 'opus' }) });
  });
  const pg = await ctx.newPage();
  // what the app has saved (it writes on a short delay): read until `ok`, at most 3 s
  const stored = async (f, ok) => { let v; for (let i = 0; i < 30; i++) { v = f(await pg.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY)); if (ok(v)) break; await pg.waitForTimeout(100); } return v; };
  await pg.clock.install({ time: NOW });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  await pg.evaluate(([k, item, now]) => { const s = JSON.parse(localStorage.getItem(k) || '{}');
    s.entries = [{ id: 'sl', kind: 'sleep', at: now - 2 * 3_600_000, rating: 7 }]; s.workouts = []; s.supplements = [];
    s.ai = { ...(s.ai || {}), digest: { day: '2026-10-22', at: now - 2 * 3_600_000, greeting: 'Morning.', items: [item] }, night: null, chat: [], memory: [] };
    localStorage.setItem(k, JSON.stringify(s)); }, [KEY, ITEM, NOW]);
  await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('#feel');

  // 1. a read's item: "For me it's the opposite"
  const mr = pg.locator('section.morning:not(.mr-pending)');
  await mr.locator('.mr-head').click(); await mr.locator('.mr-row').first().click(); await pg.waitForTimeout(150);
  await mr.getByRole('button', { name: "For me it's the opposite" }).click();
  await mr.locator('.ask-reply:not(.typing)').waitFor({ timeout: 5000 }).catch(() => {});
  const first = chats[0], last = first?.messages.at(-1)?.text ?? '';
  check(`it goes to the chat as your words, with the item attached (${last})`, last === "Re “Beer nights cost you a point of sleep”: For me it's the opposite" && /## The morning read's item this message is about \(2026-10-22\)\n- pattern: "Beer nights cost you a point of sleep"/.test(first.context));
  const reply = await mr.locator('.ask-reply').innerText().catch(() => '');
  check(`the reply shows under the item (${reply.split('\n')[0]})`, /doesn't dent your sleep\. I'll remember that\./.test(reply));
  const mem = await stored((s) => s.ai.memory.map((m) => m.text), (v) => v.length > 0);
  check(`…and it's remembered, so the reads don't say it again (${mem.join(' | ')})`, mem.some((m) => /doesn't cost him sleep/.test(m)));
  check(`fits the phone (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
  await mr.screenshot({ path: OUT + 'askabout-item.png' });

  // 2. the Noticed box, at face value
  const box = pg.locator('.notice-box');
  await box.locator('input').fill('Started magnesium glycinate 400 mg at night, sleeping way better');
  await box.getByRole('button', { name: 'Save' }).click();
  await box.locator('.ask-reply:not(.typing)').waitFor({ timeout: 5000 }).catch(() => {});
  const note = await stored((s) => s.entries.filter((e) => e.kind === 'notice').map((e) => e.text), (v) => v.length > 0);
  check(`kept as a note, as before (${note.join(' | ')})`, note.length === 1 && /magnesium glycinate/.test(note[0]));
  const nc = chats.find((c) => /"Noticed something\?" box/.test(c.context));
  check(`…and read by the AI at once, told to act on it (${nc?.messages.at(-1)?.text})`, nc?.messages.at(-1)?.text === 'Noticed: Started magnesium glycinate 400 mg at night, sleeping way better' && /propose it \(add_supplement/.test(nc.context));
  const boxText = await box.innerText();
  check(`the reply and the change it proposes show under the box (${boxText.replace(/\s+/g, ' ').slice(0, 120)})`, /tap Apply/.test(boxText) && await box.locator('.proposals').count() === 1);
  const before = await pg.evaluate((k) => JSON.parse(localStorage.getItem(k)).supplements.map((x) => x.name), KEY);
  check(`nothing changed before Apply (${before.join(', ') || 'empty stack'})`, before.length === 0);
  await box.screenshot({ path: OUT + 'askabout-notice.png' });
  await box.locator('.proposals').getByRole('button', { name: /Apply/ }).first().click(); await pg.waitForTimeout(200);
  const after = await stored((s) => s.supplements.map((x) => `${x.name} ${x.dose}`), (v) => v.length > 0);
  check(`Apply puts it in the stack (${after.join(', ')})`, after.length === 1 && /Magnesium glycinate 400 mg/.test(after[0]));
  // …and the card says so (it kept showing Apply: the card under the box isn't re-read from the chat — 22 Oct)
  const card = await box.locator('.propose').innerText();
  check(`the card says it's done, no Apply left (${card.replace(/\s+/g, ' ')})`, /✓ Added Magnesium glycinate/.test(card) && await box.locator('.propose').getByRole('button', { name: 'Apply' }).count() === 0);

  // both exchanges are in the AI tab's chat
  const thread = await stored((s) => s.ai.chat.map((m) => `${m.role}: ${m.text.slice(0, 40)}`), (v) => v.length >= 4);
  check(`both are in the AI tab's chat (${thread.length} messages)`, thread.length === 4 && /^user: Re “Beer nights/.test(thread[0]) && /^user: Noticed: Started magnesium/.test(thread[2]));
  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
