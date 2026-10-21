// Experiments end with a verdict (PLAN 160; owner, 21 Oct: "do 2, 1, 3, 4" — 4). "No caffeine after 14:00", 21 days,
// measured on energy, started 25 days ago. Planted: energy ~5 in the 14 days before, ~7 during. Once its days are up the
// app asks for the verdict once, telling the AI its own result ("worked for you", the numbers); the answer shows on the
// experiment (Insights → Training → Experiments) with what next and a checked study link, and as a message in the AI tab. A reload
// doesn't ask again. One stopped after 6 days says "ended early — too few days to tell" and asks for nothing.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

const H = 3_600_000, D = 86_400_000, NOW = new Date('2026-10-21T19:00:00').getTime(), KEY = 'healthos.v1:u-test';
const ymd = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const START = ymd(NOW - 25 * D);
const entries = [];
for (let k = 40; k >= 1; k--) {
  const t = NOW - k * D, during = ymd(t) >= START, wobble = [0, 1, -1, 0.5, -0.5][k % 5];
  entries.push({ id: 'f' + k, kind: 'feel', at: new Date(ymd(t) + 'T15:00:00').getTime(), energy: Math.round((during ? 7 : 5) + wobble), mood: 6 });
}
const XS = [
  { id: 'x1', name: 'No caffeine after 14:00', how: 'Last coffee by 14:00', days: 21, measure: 'energy', start: START },
  { id: 'x2', name: 'Magnesium at 21:00', how: '300 mg', days: 14, measure: 'sleep', start: ymd(NOW - 10 * D), ended: ymd(NOW - 4 * D) },
];
const ANSWER = { text: 'Energy went up 2 points — the app\'s test says clear. That fits studies on afternoon caffeine and sleep.', next: 'Keep the 14:00 cut-off and see if it holds for a month',
  found: [{ title: 'Caffeine 6 h before bed', text: 'It cut sleep by about an hour.', source: { title: 'Caffeine effects on sleep taken 6 hours before bed', url: 'https://example.org/caf', checked: true } }] };

(async () => {
  const b = await chromium.launch(); const errs = [], calls = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  await ctx.route('**/api/ai/usage**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ usage: null, cap: 50, on: true }) }));
  await ctx.route('**/api/ai?**', (r) => {
    const body = r.request().postDataJSON(); calls.push(body);
    if (body.task !== 'verdict') return r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' });
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ answer: ANSWER, usage: null, costUsd: 0.1, model: 'opus' }) });
  });
  const pg = await ctx.newPage();
  await pg.clock.install({ time: NOW });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  await pg.evaluate(([k, es, xs]) => { const s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = es; s.workouts = []; s.ai = { ...(s.ai || {}), experiments: xs, chat: [], dive: { key: '2026-10-18', topic: 'x', why: '', yourData: '', found: [], verdict: 'x', sure: 'weak', at: 1, seen: 1 } }; localStorage.setItem(k, JSON.stringify(s)); }, [KEY, entries, XS]);
  await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('text=Settings');
  for (let i = 0; i < 100 && !calls.some((c) => c.task === 'verdict'); i++) await pg.waitForTimeout(100);
  await pg.waitForTimeout(500);
  const v = calls.filter((c) => c.task === 'verdict');
  check(`one verdict asked for — the finished one, not the one stopped early (${v.length})`, v.length === 1 && /No caffeine after 14:00/.test(v[0].context) && !/Magnesium at 21:00/.test(v[0].context));
  check(`…told the app's own result with its numbers (${(v[0]?.context.match(/- The app's result: [^\n]*/) ?? [''])[0]})`,
    /- The app's result: worked for you — energy 5\.\d in the 14 days before vs 7\.\d during \(\d+ \+ \d+ rated days\); difference \+[12]\.\d, 95% range \+\d\.\d to \+\d\.\d, weekends accounted for/.test(v[0]?.context ?? ''));
  // the AI tab: a message, so it's seen
  await pg.goto(APP + '#ai'); await pg.waitForSelector('.ai-screen');
  const msg = await pg.locator('.msg.assistant').last().innerText().catch(() => '');
  check(`a message in the AI tab (${msg.split('\n')[0]})`, /🧪 No caffeine after 14:00 — worked for you\./.test(msg) && /Next: Keep the 14:00 cut-off/.test(msg));
  // Insights → Experiments
  await pg.goto(APP + '#insights/training'); await pg.waitForSelector('#experiments', { timeout: 10000 }).catch(() => {});
  const rows = await pg.locator('#experiments .exp').allInnerTexts();
  const done = rows.find((r) => /No caffeine/.test(r)) ?? '', early = rows.find((r) => /Magnesium/.test(r)) ?? '';
  check(`on the experiment: the result, the words, what next, a checked study (${done.replace(/\s+/g, ' ').slice(0, 200)})`,
    /worked for you\s*Energy went up 2 points/.test(done) && /Next: Keep the 14:00 cut-off/.test(done) && /Caffeine effects on sleep taken 6 hours before bed ↗\s*✓ checked/.test(done));
  check(`one stopped early says so, not "running" (${early.replace(/\s+/g, ' ').slice(0, 160)})`, /ended early — too few days to tell/.test(early) && !/running/.test(early));
  check(`fits the phone (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
  await pg.locator('#experiments').screenshot({ path: OUT + 'verdict.png' }).catch(() => {});
  // a reload doesn't ask again
  await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('text=Settings'); await pg.waitForTimeout(1500);
  check(`a reload doesn't ask again (${calls.filter((c) => c.task === 'verdict').length})`, calls.filter((c) => c.task === 'verdict').length === 1);
  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
