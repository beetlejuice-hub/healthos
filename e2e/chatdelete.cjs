// Deleting entries from the chat (owner, 22 Oct: "can u make it able to delete entries? i asked to delete 2 entries, it
// found them but cant delete them. please allow to delete entries"). A fake AI does what the real one would: looks them up
// with the app's find tool, reads the [id:…] it shows, and proposes deleting each. Two cards, worded with what and when;
// nothing goes until Delete; Delete removes it, "Put it back" restores it as it was.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

const NOW = new Date('2026-10-22T10:00:00').getTime(), KEY = 'healthos.v1:u-test';
const at = (d, hm) => new Date(`${d}T${hm}:00`).getTime();
const ENTRIES = [
  { id: 'c1', kind: 'drink', at: at('2026-10-21', '16:30'), name: 'Coffee', ml: 250, caffeineMg: 95, alcoholG: 0, kcal: 2 },
  { id: 'c2', kind: 'drink', at: at('2026-10-21', '16:31'), name: 'Coffee', ml: 250, caffeineMg: 95, alcoholG: 0, kcal: 2 },
  { id: 'l1', kind: 'food', at: at('2026-10-21', '13:00'), name: 'Chicken and rice', grams: 400, macros: { kcal: 650, p: 45, c: 70, f: 18 } },
];

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
    const turn = body.turn ?? [], round = turn.filter((t) => t.role === 'user').length, use = (calls) => ({ reply: '', remember: [], calls, turn: [{ role: 'assistant', content: calls.map((c) => ({ type: 'tool_use', ...c })) }] });
    let answer;
    if (round === 0) answer = use([{ id: 'f1', name: 'find', input: { text: 'coffee' } }]);
    else if (round === 1) {
      // the app's look-up, as it came back: the ids after each line
      const found = turn.at(-1).content[0].content, ids = [...found.matchAll(/\[id:([^\]]+)\]/g)].map((m) => m[1]);
      answer = use(ids.map((id, i) => ({ id: `d${i}`, name: 'propose', input: { change: 'delete_entry', entry: `[id:${id}]`, why: 'you said these were logged twice' } })));
    } else answer = { reply: 'Two coffees from yesterday afternoon — **tap Delete** on each to remove it.', remember: [] };
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ answer, usage: null, costUsd: 0.02, model: 'opus' }) });
  });
  const pg = await ctx.newPage();
  await pg.clock.install({ time: NOW });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  const stored = async (f, ok) => { let v; for (let i = 0; i < 30; i++) { v = f(await pg.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY)); if (ok(v)) break; await pg.waitForTimeout(100); } return v; };
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  await pg.evaluate(([k, es]) => { const s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = es; s.workouts = []; s.ai = { ...(s.ai || {}), chat: [] }; localStorage.setItem(k, JSON.stringify(s)); }, [KEY, ENTRIES]);
  await pg.goto(APP + '#ai'); await pg.reload(); await pg.waitForSelector('.chatbox input');
  await pg.fill('.chatbox input', 'delete the 2 coffees from yesterday, I logged them twice');
  await pg.getByRole('button', { name: 'Send' }).click();
  await pg.waitForSelector('.propose', { timeout: 6000 }).catch(() => {});
  const found = chats[1]?.turn?.at(-1)?.content?.[0]?.content ?? '';
  check(`the app's find shows each entry's id (${found.split('\n').slice(1).join(' | ')})`, /16:31 drink: Coffee \[id:c2\]/.test(found) && /16:30 drink: Coffee \[id:c1\]/.test(found));
  const cards = await pg.locator('.propose b').allInnerTexts();
  check(`two cards, worded with what and when (${cards.join(' | ')})`, cards.length === 2 && cards.every((c) => /^Delete Coffee \(95 mg caffeine\) · Wed 21 Oct 16:3[01]$/.test(c)));
  check('nothing deleted before Delete', (await stored((s) => s.entries.length, () => true)) === 3);
  await pg.locator('.proposals').first().screenshot({ path: OUT + 'chatdelete-cards.png' });
  const first = pg.locator('.propose').first();
  await first.getByRole('button', { name: 'Delete' }).click();
  const left = await stored((s) => s.entries.map((e) => e.id).sort().join(','), (v) => v.split(',').length === 2);
  check(`Delete removes that one (${left})`, left.split(',').length === 2 && left.includes('l1'));
  const done = await first.innerText();
  check(`the card says so, with a way back (${done.replace(/\s+/g, ' ')})`, /✓ Deleted Coffee \(95 mg caffeine\)\. · Put it back/.test(done.replace(/\s+/g, ' ')));
  await first.getByRole('button', { name: 'Put it back' }).click();
  const back = await stored((s) => s.entries.map((e) => e.id).sort().join(','), (v) => v.split(',').length === 3);
  check(`Put it back restores it as it was, and the card can Delete again (${back})`, back === 'c1,c2,l1' && await first.getByRole('button', { name: 'Delete' }).count() === 1);
  await pg.locator('.propose').nth(1).getByRole('button', { name: 'Delete' }).click();
  await pg.locator('.propose').first().getByRole('button', { name: 'Delete' }).click({ timeout: 1500 }).catch(() => {});
  const end = await stored((s) => s.entries.map((e) => e.id).join(','), (v) => v === 'l1');
  check(`both coffees gone, lunch kept (${end})`, end === 'l1');
  check(`fits the phone (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
