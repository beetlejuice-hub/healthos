// How sure, and connections (PLAN 163; owner, 22 Oct: "make ai more smarter and cautious … i noticed when im drinking, my
// heart rate variability drops to 20 ms … connected to psoriasis flare ups … making the ai come up w connections like this
// on its own"; a community idea "1 per day"). A fake AI writes the morning read: a pattern from his data, a connection
// (drinks → HRV → psoriasis, each link with how sure), and a try. Open, each says how sure in words; the connection shows
// its links in order, one under the other; the request carried this morning's picks. The evening read's try is a
// community idea, labelled anecdote. At 320 px nothing sticks out.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

const NOW = new Date('2026-10-22T08:30:00').getTime(), KEY = 'healthos.v1:u-test';
const CHAIN = [
  { step: 'Drinking nights: HRV 22 vs 48 ms the next morning — clear', sure: 'yours' },
  { step: 'Alcohol and low HRV both go with psoriasis flares — not tested on you', sure: 'some' },
];
const READ = { greeting: 'Morning.', items: [
  { type: 'pattern', title: 'Beer nights cost you a point of sleep', text: '6.1 after drinks vs 7.2 without — the app\'s test says clear.', sure: 'yours', measure: 'sleep' },
  { type: 'connection', title: 'Drinks, HRV and your skin', text: 'Your HRV halves after drinking nights — and studies tie both to flares.', sure: 'some', chain: CHAIN, source: { title: 'Alcohol and psoriasis: a meta-analysis', url: 'https://example.org/ps' } },
  { type: 'try', title: 'Creatine for focus on short sleep', text: 'Kept reaction time up after a short night in trials.', sure: 'strong', source: { title: 'Sci Rep 2025', url: 'https://example.org/cr' } },
] };
const NIGHT = { summary: 'A calm day.', happened: [], notes: '', change: [], remember: [], items: [
  { type: 'try', title: 'Mouth taping, the Reddit verdict', text: 'r/sleep swears by it for deeper sleep; trials are thin.', sure: 'anecdote', source: { title: 'r/sleep', url: 'https://www.reddit.com/r/sleep/' } },
] };

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  for (const width of [390, 320]) {
    const calls = [];
    const ctx = await b.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    await ctx.route('**/api/ai/usage**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ usage: null, cap: 50, on: true }) }));
    await ctx.route('**/api/ai?**', (r) => {
      const body = r.request().postDataJSON(); calls.push(body);
      const answer = body.task === 'digest' ? READ : body.task === 'night' ? NIGHT : null;
      if (!answer) return r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' });
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ answer, usage: null, costUsd: 0.05, model: 'opus' }) });
    });
    const pg = await ctx.newPage();
    await pg.clock.install({ time: NOW });
    pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
    await pg.goto(APP);
    await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
    await pg.evaluate((k) => { const s = JSON.parse(localStorage.getItem(k) || '{}');
      // last night rated, and a day logged yesterday evening: both reads are due
      s.entries = [{ id: 'sl', kind: 'sleep', at: Date.now() - 3_600_000, rating: 7 }, { id: 'f', kind: 'food', at: Date.now() - 12 * 3_600_000, name: 'Dinner', grams: 400, macros: { kcal: 700, p: 45, c: 70, f: 20 } }];
      s.workouts = []; s.ai = { ...(s.ai || {}), digest: null, night: null, chat: [] }; localStorage.setItem(k, JSON.stringify(s)); }, KEY);
    await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('#feel');
    await pg.waitForSelector('section.morning:not(.mr-pending) .mr-row', { timeout: 8000 }).catch(() => {});
    if (width === 390) {
      const dg = calls.find((c) => c.task === 'digest'), nt = calls.find((c) => c.task === 'night');
      check('the morning read is told this morning\'s third item (a connection or a study, in turn) and how sure to be', !!dg && /- Third item today: (a "connection"|a study or fun fact)/.test(dg.context));
      check('the evening read\'s try is a community idea, labelled anecdote', !!nt && /- "try" item tonight: what people are trying, from Reddit .*"sure": "anecdote"/.test(nt.context));
    }
    const mr = pg.locator('section.morning:not(.mr-pending)');
    await mr.locator('.mr-head').click(); await pg.waitForTimeout(150);
    const rows = mr.locator('.mr-row');
    // each item open in turn: how sure, in words
    const sure = [];
    for (let k = 0; k < 3; k++) { await rows.nth(k).click(); await pg.waitForTimeout(120); sure.push(await mr.locator('.mr-body .sure').allInnerTexts()); }
    check(`${width}: each says how sure, in words (${sure.map((s) => s.join(' / ')).join(' | ')})`, sure[0].join() === 'YOUR DATA' && sure[2].join() === 'STRONG STUDIES');
    await rows.nth(1).click(); await pg.waitForTimeout(120);
    const kind = await rows.nth(1).locator('.mr-kind').innerText();
    const links = await mr.locator('.mr-chain li').evaluateAll((ls) => ls.map((l) => [l.querySelector('span').textContent, l.querySelector('.sure').textContent, Math.round(l.getBoundingClientRect().top)]));
    check(`${width}: the connection says so (${kind})`, /connection/i.test(kind));
    check(`${width}: its links in order, each with how sure (${links.map((l) => `${l[0].slice(0, 22)}… ${l[1]}`).join(' → ')})`,
      links.length === 2 && links.map((l) => l[0]).join('|') === CHAIN.map((c) => c.step).join('|') && links.map((l) => l[1]).join('|') === 'your data|some studies' && links[1][2] > links[0][2]);
    check(`${width}: fits the phone (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= width);
    await mr.screenshot({ path: OUT + `readsure-connection-${width}.png` });
    if (width === 390) {
      // the evening read, read back the next morning: its community try says anecdote
      const nr = pg.locator('section.night');
      if (await nr.count()) {
        await nr.locator('.mr-head').click(); await pg.waitForTimeout(150);
        await nr.locator('.mr-row').first().click(); await pg.waitForTimeout(120);
        check(`the community idea is labelled (${await nr.locator('.mr-body .sure').allInnerTexts()})`, (await nr.locator('.mr-body .sure').allInnerTexts()).join() === 'ANECDOTE, NOT STUDIED');
      } else check('the evening read is on Today', false);
    }
    await ctx.close();
  }
  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
