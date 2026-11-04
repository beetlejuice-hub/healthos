// The chat answers in words, a chart with it (PLAN 196; owner, 4 Nov: "I asked about hrv, it just spit a chart on me").
// A fake AI writes its answer, then draws HRV over 30 days, then says only "The chart is attached under this message…":
// the AI tab shows the answer, the chart and that line. Control: a "Let me look." note on the way isn't shown. 390 px.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

const KEY = 'healthos.v1:u-test', NOW = new Date('2026-11-04T17:18:00').getTime();
const ANSWER = "Not low for you: **55 ms** is about average for a man your age on a wrist band. The mornings after drinks sit 14 ms lower, and short nights pull it down too.";
const chart = { id: 'tu2', name: 'show_chart', input: { measure: 'mood', from: '2026-10-05', to: '2026-11-03', title: 'Mood, last 30 days' } };
const rounds = { hrv: [{ text: ANSWER, calls: [chart] }, { reply: 'The chart is attached under this message. You can see the baseline sitting high with a few sharp drops.' }],
  sleep: [{ text: 'Let me look.', calls: [{ id: 'tu1', name: 'day', input: { date: '2026-11-03' } }] }, { reply: 'You slept **7 h 10** last night.' }] };

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  await ctx.route('**/api/ai/usage**', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ usage: null, cap: 50, on: true }) }));
  await ctx.route('**/api/ai?**', (r) => {
    const body = r.request().postDataJSON();
    if (body.task !== 'chat') return r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' });
    const q = /sleep/i.test(body.messages.at(-1).text) ? rounds.sleep : rounds.hrv, step = body.turn ? 1 : 0, s = q[step];
    const answer = s.calls ? { reply: '', remember: [], calls: s.calls, turn: [{ role: 'assistant', content: [{ type: 'text', text: s.text }, ...s.calls.map((c) => ({ type: 'tool_use', ...c }))] }] } : { reply: s.reply, remember: [] };
    r.fulfill({ contentType: 'application/json', body: JSON.stringify({ answer, usage: null, costUsd: 0.02, model: 'sonnet' }) });
  });
  const pg = await ctx.newPage();
  await pg.clock.install({ time: NOW });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  for (let k = 0; k < 3; k++) {
    await pg.waitForLoadState('networkidle');
    await pg.evaluate(([k, now]) => { const s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = Array.from({ length: 30 }, (_, i) => ({ id: 'f' + i, kind: 'feel', at: now - (i + 1) * 864e5, mood: 5 + (i % 4) })); s.ai = { ...(s.ai || {}), chat: [], digest: null, night: null }; localStorage.setItem(k, JSON.stringify(s)); }, [KEY, NOW]);
    await pg.goto(APP + '#ai'); await pg.reload(); await pg.waitForLoadState('networkidle');
    if (await pg.evaluate((k) => (JSON.parse(localStorage.getItem(k)).entries || []).length >= 30, KEY)) break;
  }
  const ask = async (q) => { const n = await pg.locator('.msg.assistant:not(.typing)').count(); await pg.getByLabel('Message the AI').fill(q); await pg.getByLabel('Message the AI').press('Enter'); await pg.waitForFunction((n) => document.querySelectorAll('.msg.assistant:not(.typing)').length > n, n, { timeout: 8000 }).catch(() => {}); return pg.locator('.msg.assistant:not(.typing)').last(); };
  const m = await ask("Isn't my average hrv like pretty low? How could i improve?");
  const t = (await m.innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(`the answer written before the chart is shown (${t.slice(0, 140)})`, /^Not low for you: 55 ms is about average/.test(t));
  check('…with the chart, and the line after it', await m.locator('svg, .chat-chart, figure').count() > 0 && /The chart is attached under this message/.test(t));
  check(`390: fits (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
  await m.screenshot({ path: OUT + 'chatwhole.png' }).catch(() => {});
  const m2 = await ask('how did I sleep last night?');
  const t2 = (await m2.innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(`control: a "Let me look." on the way isn't part of the answer (${t2.slice(0, 80)})`, /^You slept 7 h 10 last night\./.test(t2) && !/Let me look/.test(t2));
  console.log('errors: ' + JSON.stringify(errs)); check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH ' + e.message); process.exit(1); });
