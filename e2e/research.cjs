// The AI researches you on its own, on a small budget (PLAN 192; owner, 3 Nov: "Ai should do researches on its own but do
// not let it soend way too much credits. Like researxh on what i take what i eat how i train how much i move my heartrate").
// Tue 3 Nov 11:00, creatine taken on 14 of the last 14 days, the month's AI spend $3 of $20. The app picks the topic
// itself and asks once, small: its context is About me and creatine's own lines; the answer is kept with its cost. The AI
// tab: "Researched for you" — the title, what's known, for you, what to try, the source, $0.07 of $3.50 this month, and
// it waits (one a day). A reload asks nothing more. Controls: Settings → AI's switch off asks nothing; nor does a month
// past half its budget. 390 px.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

const NOW = new Date('2026-11-03T11:00:00').getTime(), D = 86_400_000, KEY = 'healthos.v1:u-test';
const ANSWER = { title: 'Creatine at 5 g: does the timing matter?', known: 'Daily intake matters more than timing; 3–5 g a day fills muscle stores in about a month.', forYou: 'You take 5 g on 14 of the last 14 days — the dose the studies use.', tip: 'Keep it daily, at any time', sure: 'strong',
  found: [{ title: 'ISSN position stand', text: '3–5 g a day is effective and safe.', source: { title: 'ISSN position stand: creatine', url: 'https://pubmed.ncbi.nlm.nih.gov/28615996/', checked: true } }] };

async function run(b, { off = false, monthUsd = 3 } = {}) {
  const calls = [], errs = [];
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  await ctx.route('**/api/ai/usage**', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ usage: { day: '2026-11-03', calls: 4, dayUsd: 0.2, month: '2026-11', monthUsd, byModel: {} }, cap: 50, budget: 20, on: true }) }));
  await ctx.route('**/api/ai?**', (r) => { const body = r.request().postDataJSON(); calls.push(body);
    if (body.task !== 'research') return r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' });
    r.fulfill({ contentType: 'application/json', body: JSON.stringify({ answer: ANSWER, costUsd: 0.07, usage: { day: '2026-11-03', calls: 5, dayUsd: 0.27, month: '2026-11', monthUsd: monthUsd + 0.07, byModel: {} } }) }); });
  const pg = await ctx.newPage();
  await pg.clock.install({ time: NOW });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource|500/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  await pg.waitForLoadState('networkidle');
  await pg.evaluate(([k, now, D, off]) => {
    const s = JSON.parse(localStorage.getItem(k) || '{}'); s.workouts = [];
    s.supplements = [{ id: 'cre', name: 'Creatine', dose: '5 g', slot: 'morning', at: 480, active: true }];
    s.entries = Array.from({ length: 14 }, (_, i) => ({ id: 'c' + i, kind: 'supp', at: now - (i + 1) * D - 3 * 36e5, suppId: 'cre', status: 'taken' }));
    s.ai = { ...(s.ai || {}), researched: [], researchOff: off, digest: { day: '2026-11-03', at: now - 36e5, greeting: 'Morning.', items: [] }, night: null, dive: { key: '2026-11-01', topic: 'This week\'s question', why: '', yourData: '', found: [], verdict: 'v', sure: 'weak', at: now - D, seen: now - D } };
    localStorage.setItem(k, JSON.stringify(s));
  }, [KEY, NOW, D, off]);
  await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('text=Settings');
  await pg.waitForTimeout(3000);
  return { pg, ctx, calls, errs };
}

(async () => {
  const b = await chromium.launch();
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const { pg, ctx, calls, errs } = await run(b);
  const asks = calls.filter((c) => c.task === 'research');
  check(`it asks once, on its own, about creatine (${asks.length} call${asks.length === 1 ? '' : 's'})`, asks.length === 1 && /## The topic \(the app's pick, from my data\)\n- What: a supplement I take — Creatine, 5 g, every day, in the morning; taken on 14 of the last 14 days\./.test(asks[0]?.context ?? ''));
  check(`…small: About me and the topic only (${(asks[0]?.context ?? '').length} characters)`, /^## About me\n/.test(asks[0]?.context ?? '') && (asks[0]?.context ?? '').length < 1500);
  const kept = await pg.evaluate((k) => JSON.parse(localStorage.getItem(k)).ai.researched, KEY);
  check(`kept with its topic and cost (${JSON.stringify(kept.map((r) => [r.key, r.usd]))})`, kept.length === 1 && kept[0].key === 'supp:cre:5g' && kept[0].usd === 0.07);
  await pg.goto(APP + '#ai'); await pg.waitForSelector('[aria-label="Researched for you"]', { timeout: 8000 }).catch(() => {});
  const card = (await pg.locator('[aria-label="Researched for you"]').innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(`the AI tab: "Researched for you", its cost against its cap, waiting till tomorrow (${card.slice(0, 160)})`, /RESEARCHED FOR YOU on its own · \$0\.07 of \$3\.50 this month/i.test(card) && /Next: waiting — one a day\./.test(card));
  check(`…the newest open: what's known, for you, what to try, the source (${card.slice(160, 420)})`, /Creatine at 5 g: does the timing matter\?/.test(card) && /Daily intake matters more than timing/.test(card) && /For you: You take 5 g on 14 of the last 14 days/.test(card) && /Try: Keep it daily, at any time/.test(card) && /ISSN position stand: creatine ✓/.test(card));
  check(`390: fits (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
  await pg.locator('[aria-label="Researched for you"]').screenshot({ path: OUT + 'research.png' });
  await pg.reload(); await pg.waitForTimeout(2500);
  check(`a reload asks nothing more today (${calls.filter((c) => c.task === 'research').length})`, calls.filter((c) => c.task === 'research').length === 1);
  console.log('errors: ' + JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await ctx.close();

  const offRun = await run(b, { off: true });
  check(`control: switched off in Settings → AI, it asks nothing (${offRun.calls.filter((c) => c.task === 'research').length})`, offRun.calls.filter((c) => c.task === 'research').length === 0);
  await offRun.ctx.close();
  const spent = await run(b, { monthUsd: 11 });
  check(`control: the month past half its $20, it asks nothing (${spent.calls.filter((c) => c.task === 'research').length})`, spent.calls.filter((c) => c.task === 'research').length === 0);
  await spent.ctx.close();
  await b.close();
})().catch((e) => { console.log('CRASH ' + e.message); process.exit(1); });
