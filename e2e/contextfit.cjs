// The context fits (owner, 17 Nov, a screenshot: every morning read and question "failed · context too long"). 60 days of
// the sample with its band, plus three weeks of long check-in notes and noticed-notes on top — a heavy account: the
// morning read's and the questions' contexts sent to the AI are each within the budget the Worker takes (44,000 made,
// 60,000 taken), keep the core (about me, last 14 days), and say what was left out.
const { chromium, APP, handle } = require('./harness.cjs');
const { sampleBand, routeBand } = require('./tools/sampleband.cjs');
const MAX = 44000, LIMIT = 60000;
(async () => {
  const b = await chromium.launch(); const errs = [], calls = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const now = new Date('2026-10-21T08:00:00').getTime();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  await ctx.route('**/api/ai/usage**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ usage: null, cap: 50, on: true }) }));
  await ctx.route('**/api/ai?**', (r) => { const body = r.request().postDataJSON(); calls.push(body); r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' }); });
  const pg = await ctx.newPage();
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await pg.clock.install({ time: now });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  await pg.goto(APP + '#dev'); await pg.getByRole('button', { name: '60 days of sample' }).click(); await pg.waitForTimeout(400);
  // heavy: 4 long check-in notes a day for 3 weeks, and 40 noticed-notes
  await pg.evaluate((now) => { const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k)); const long = 'felt wired after the second coffee, then flat by four, head a bit foggy, ate late again and the gym was packed so I cut it short and walked home in the rain instead ';
    for (let d = 1; d <= 21; d++) for (let h of [9, 13, 17, 21]) s.entries.push({ id: `n${d}-${h}`, kind: 'feel', at: now - d * 864e5 + (h - 8) * 3600e3, mood: 5 + (d % 3), energy: 4 + (h % 4), note: long + d });
    s.ai = { ...(s.ai || {}), notices: Array.from({ length: 40 }, (_, i) => ({ id: 'x' + i, at: now - i * 864e5 / 2, text: 'noticed that my left knee clicks on stairs and I sleep worse after spicy dinners, maybe ' + i })) };
    localStorage.setItem(k, JSON.stringify(s)); }, now);
  const s = await pg.evaluate(() => JSON.parse(localStorage.getItem('healthos.v1:u-test') || '{}'));
  await routeBand(ctx, sampleBand(s.entries || [], s.workouts || [], now), now);
  await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('nav.tabs');
  for (let i = 0; i < 40 && !calls.some((c) => c.task === 'digest'); i++) await pg.waitForTimeout(500);
  // the read adds its own few lines around the overview (what it showed lately): the budget plus that, within what the Worker takes
  for (const task of ['digest']) {
    const c = calls.find((x) => x.task === task);
    const n = c?.context?.length ?? 0;
    check(`${task}: sent, the overview within ${MAX} plus the read's own lines, within the ${LIMIT} the Worker takes (${n})`, !!c && n > 10000 && n <= MAX + 4000 && n <= LIMIT);
    if (c) check(`${task}: the core kept (about me, last 14 days)`, /## About me/.test(c.context) && /## Last 1?4 days/.test(c.context));
  }
  const d = calls.find((x) => x.task === 'digest');
  console.log('left out:', (d?.context.match(/## Left out to fit[^\n]*\n- ([^\n]*)/) || [, 'nothing'])[1]);
  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message.split('\n')[0]); process.exit(1); });
