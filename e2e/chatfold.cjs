// Old chats fold (owner, 16 Oct: "also i feel like chats should be deleted? or like collapsed or whatever"). Messages on
// the 13th and 14th and this morning: the 13th folds to one line with what was asked; the 14th has something not seen yet,
// so it stays open; today is open. Tapping the line opens the day. Settings → AI → Clear the chat empties it, after asking,
// keeping what the AI remembers and the app's findings.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

const KEY = 'healthos.v1:u-test', NOW = new Date('2026-10-16T09:00:00').getTime();
const t = (d, hm) => new Date(`2026-10-${d}T${hm}:00`).getTime();

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  await ctx.route('**/api/ai/usage**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ usage: null, cap: 50, on: true }) }));
  await ctx.route('**/api/ai?**', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' }));
  const pg = await ctx.newPage();
  await pg.clock.install({ time: NOW });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('dialog', (d) => d.accept());
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  await pg.waitForLoadState('networkidle');
  await pg.evaluate(([k, m]) => { const s = JSON.parse(localStorage.getItem(k) || '{}');
    s.ai = { ...(s.ai || {}), seenAt: m.seen, memory: [{ id: 'mem', text: 'Usual coffee is a long coffee', at: m.seen }], chat: [
      { role: 'user', text: 'what should I eat before the gym?', at: m.a }, { role: 'assistant', text: 'Something with **carbs** an hour before.', at: m.a + 60e3 },
      { role: 'assistant', text: '📰 **Creatine and sleep loss**\n\nA 2026 trial.', at: m.b, unprompted: true },
      { role: 'user', text: 'how did I sleep?', at: m.c }, { role: 'assistant', text: 'About 7 h.', at: m.c + 60e3 },
    ] };
    localStorage.setItem(k, JSON.stringify(s)); }, [KEY, { seen: t('14', '08:00'), a: t('13', '18:00'), b: t('14', '09:30'), c: t('16', '08:30') }]);
  await pg.goto(APP + '#ai'); await pg.reload(); await pg.waitForSelector('.chat');
  const folds = pg.locator('.chat .day-fold');
  const line = (await folds.first().locator('summary').innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(`the 13th folds to one line, with what was asked (${line})`, await folds.count() === 1 && /^▸?\s*Tue 13 Oct · 2 messages · what should I eat before the gym\?$/.test(line.trim()) && !(await folds.first().evaluate((e) => e.open)));
  const open = await pg.locator('.chat > .msg').allInnerTexts();
  check(`the 14th has a message not seen yet — open; today open (${open.map((x) => x.split('\n')[0]).join(' | ')})`, open.some((x) => /Creatine and sleep loss/.test(x)) && open.some((x) => /how did I sleep\?/.test(x)) && !open.some((x) => /before the gym/.test(x)));
  await pg.screenshot({ path: OUT + 'chatfold.png' });
  await folds.first().locator('summary').click(); await pg.waitForTimeout(150);
  check('tap the line: the day opens', await folds.first().evaluate((e) => e.open) && await folds.first().locator('.msg').count() === 2 && /carbs/.test(await folds.first().innerText()));

  await pg.goto(APP + '#settings'); await pg.waitForTimeout(200);
  await pg.getByRole('button', { name: /Clear the chat \(5 messages\)/ }).click(); await pg.waitForTimeout(200);
  const st = await pg.evaluate((k) => JSON.parse(localStorage.getItem(k)).ai, KEY);
  check(`Clear the chat: empty, what it remembers stays (${st.chat.length} messages, ${st.memory.length} memory)`, st.chat.length === 0 && st.memory.length === 1);
  check('…and the button is gone with nothing to clear', await pg.getByRole('button', { name: /Clear the chat/ }).count() === 0);
  await pg.goto(APP + '#ai'); await pg.waitForTimeout(200);
  check('the AI tab starts fresh', await pg.locator('.chat .msg').count() === 0);

  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
