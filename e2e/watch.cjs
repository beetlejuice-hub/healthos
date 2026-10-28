// Watching (owner, 28 Oct: "make sure if i note like i feel creatine makes my muscles fuller … make ai look out for
// these things, peoples opinions on forums like reddit, and scientific papers, give me followup questions"; picked "Watch
// and ask later", then "like all, lets build it" on the canvas). Wed 28 Oct, 20:12: he types it in "Noticed something?";
// the AI (faked) proposes a watch — a card with its evening question, 14 days, and what studies and Reddit say with how
// sure; nothing happens before "Watch it". Then: the question is in For you tonight; one tap answers it (kept as an answer
// entry) and it's gone until tomorrow evening; 17:00 the next day nothing, 20:00 it's back, "Day 2 of 14 · 1 answer so
// far"; the AI tab lists it with its answers and Stop; the AI is told about it; Stop ends the questions. Control: "Not now"
// keeps nothing. 390 and 320.
const { chromium, APP, OUT, handle, forYou } = require('./harness.cjs');

const KEY = 'healthos.v1:u-test', T = (d, hm) => new Date(`${d}T${hm}:00`).getTime();
const CALL = { id: 'w1', name: 'propose', input: { change: 'watch', why: 'you noticed it — worth two weeks of a yes or no', what: 'Creatine → fuller muscles', note: 'creatine makes my muscles fuller',
  question: 'Muscles feel full today?', options: ['Not really', 'A bit', 'Very'], days: 14,
  found: [{ text: 'Creatine pulls water into muscle cells, about 1–2 kg in the first weeks', sure: 'strong', title: 'Kreider 2017, JISSN', url: 'https://example.org/kreider' },
    { text: 'On r/Creatine many say the "full" look shows in week 1–3', sure: 'anecdote', title: 'r/Creatine thread', url: 'https://example.org/reddit' }] } };

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  for (const width of [390, 320]) {
    const sent = [];
    const ctx = await b.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    await ctx.route('**/api/ai/usage**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ usage: null, cap: 50, on: true }) }));
    await ctx.route('**/api/ai?**', (r) => {
      const body = r.request().postDataJSON(); sent.push(body);
      if (body.task !== 'chat') return r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' });
      const answer = body.turn ? { reply: 'Got it — **watching creatine → fuller muscles** for two weeks.', remember: [] }
        : { reply: '', remember: [], calls: [CALL], turn: [{ role: 'assistant', content: [{ type: 'tool_use', ...CALL }] }] };
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ answer, usage: null, costUsd: 0.01, model: 'sonnet' }) });
    });
    const pg = await ctx.newPage();
    await pg.clock.install({ time: T('2026-10-28', '20:12') });
    pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    await pg.goto(APP);
    await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
    await pg.evaluate((k) => { const s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = []; s.ai = { ...(s.ai || {}), chat: [], watches: [], digest: null, night: null }; localStorage.setItem(k, JSON.stringify(s)); }, KEY);
    await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('.t2-status');
    const st = () => pg.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}'), KEY);
    const fits = async (where) => { const w = await pg.evaluate(() => document.documentElement.scrollWidth); check(`${width}: ${where} fits (${w} px)`, w <= width); };

    // 20:12: the note
    await pg.getByLabel('Something you noticed').fill('creatine makes my muscles fuller');
    await pg.getByLabel('Something you noticed').press('Enter');
    const card = pg.locator('.notice-box .propose');
    await card.waitFor({ timeout: 8000 });
    const ctext = (await card.innerText()).replace(/\s+/g, ' ');
    check(`${width}: a card — the question, 14 days, what's out there with how sure (${ctext.slice(0, 170)})`,
      /Watch: Creatine → fuller muscles — ask “Muscles feel full today\?” each evening for 14 days/.test(ctext) && /1–2 kg in the first weeks STRONG Kreider 2017, JISSN ↗/i.test(ctext) && /r\/Creatine.*ANECDOTE/i.test(ctext));
    check('nothing is watched before a tap', ((await st()).ai.watches || []).length === 0);
    await fits('the card');
    if (width === 390) await pg.locator('.notice-box').screenshot({ path: OUT + 'watch-card.png' });
    if (width === 320) {
      await card.getByRole('button', { name: 'Not now' }).click(); await pg.waitForTimeout(150);
      check('control: "Not now" keeps nothing', ((await st()).ai.watches || []).length === 0);
      await ctx.close(); continue;
    }
    await card.getByRole('button', { name: 'Watch it' }).click(); await pg.waitForTimeout(200);
    let s = await st();
    check(`"Watch it": watching, from today (${JSON.stringify(s.ai.watches.map((w) => [w.what, w.start, w.days]))})`, s.ai.watches.length === 1 && s.ai.watches[0].start === '2026-10-28' && s.ai.watches[0].found.length === 2);
    check(`…and the card says where the question is (${(await card.innerText()).replace(/\s+/g, ' ').slice(-90)})`, /its first question is in For you on Today now/.test(await card.innerText()));

    // the question, tonight, in For you
    const id = s.ai.watches[0].id;
    check('tonight: its question is in For you', await forYou(pg, `watch:${id}`));
    const ask = pg.locator('.fy-item[data-current] .watchask');
    check(`…"Day 1 of 14", from your note (${(await ask.innerText()).replace(/\s+/g, ' ')})`, /Muscles feel full today\? Not really A bit Very Day 1 of 14 · from your note “creatine makes my muscles fuller”/i.test((await ask.innerText()).replace(/\s+/g, ' ')));
    await pg.locator('.fy').screenshot({ path: OUT + 'watch-ask.png' });
    await ask.getByRole('button', { name: 'A bit' }).click(); await pg.waitForTimeout(200);
    s = await st();
    const a = s.entries.filter((e) => e.kind === 'answer');
    check(`one tap is the answer (${JSON.stringify(a.map((e) => [e.key, e.answer]))})`, a.length === 1 && a[0].key === `watch:${id}` && a[0].answer === 'A bit' && a[0].question === 'Muscles feel full today?');
    check('…and it\'s gone for tonight', await pg.locator(`.fy-item[data-key="watch:${id}"] .watchask`).count() === 0);

    // tomorrow: not at 17:00, back at 20:00
    await pg.clock.setSystemTime(T('2026-10-29', '17:00')); await pg.reload(); await pg.waitForSelector('.t2-status');
    check('17:00 the next day: not yet', await pg.locator(`.fy-item[data-key="watch:${id}"] .watchask`).count() === 0);
    await pg.clock.setSystemTime(T('2026-10-29', '20:00')); await pg.reload(); await pg.waitForSelector('.t2-status');
    await forYou(pg, `watch:${id}`);
    check(`20:00: back — "Day 2 of 14 · 1 answer so far" (${(await pg.locator('.watchask').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(-70)})`, /Day 2 of 14 · 1 answer so far/.test(await pg.locator('.watchask').innerText().catch(() => '')));
    await pg.locator('.watchask').getByRole('button', { name: 'Very' }).click(); await pg.waitForTimeout(200);

    // the AI tab: the list; the AI is told
    await pg.goto(APP + '#ai'); await pg.waitForSelector('.watchlist');
    const list = (await pg.locator('.watchlist').innerText()).replace(/\s+/g, ' ');
    check(`the AI tab lists it: days, answers, what was found, Stop (${list.slice(0, 160)})`, /Watching · 1/i.test(list) && /Creatine → fuller muscles Stop/.test(list) && /day 2 of 14 · 2 answers so far/.test(list) && await pg.locator('.watch-bars i').count() === 2 && /STRONG/i.test(list));
    await pg.locator('.watchlist').screenshot({ path: OUT + 'watch-list.png' });
    await fits('the list');
    await pg.getByLabel('Message the AI').fill('how is it going?'); await pg.getByRole('button', { name: 'Send' }).click();
    for (let i = 0; i < 30 && sent.filter((c) => c.task === 'chat').length < 3; i++) await pg.waitForTimeout(100);
    const ctx2 = sent.filter((c) => c.task === 'chat').at(-1)?.context ?? '';
    check(`the AI is told: the watch, its day, the answers (${(ctx2.match(/## What I'm watching[^\n]*\n- [^\n]*/) || [''])[0].split('\n')[1]?.slice(0, 150)})`,
      /## What I'm watching[^\n]*\n- Creatine → fuller muscles — my note: "creatine makes my muscles fuller"; day 2 of 14, asks "Muscles feel full today\?" \(Not really \/ A bit \/ Very\) each evening; answers: Wed 28 A bit, Thu 29 Very/.test(ctx2));

    // Stop: no more questions
    await pg.locator('.watchlist').getByRole('button', { name: 'Stop' }).click(); await pg.waitForTimeout(150);
    await pg.clock.setSystemTime(T('2026-10-30', '20:00')); await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('.t2-status');
    check('Stop: no question the next evening, gone from the list', await pg.locator('.watchask').count() === 0 && ((await st()).ai.watches[0].stopped > 0));
    await ctx.close();
  }
  console.log('errors: ' + JSON.stringify(errs)); await b.close();
})().catch((e) => { console.log('CRASH ' + e.message); process.exit(1); });
