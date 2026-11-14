// Which cards he uses (owner, 14 Nov, item 15: "good idea but lmk before deleting"). On this phone only: a tap in Today's
// brief and opening "More about today" count as used; Settings → What you use lists them; a card seen 12 times over 20
// days and never used is "never touched" — listed, not removed.
const { chromium, APP, OUT, handle } = require('./harness.cjs');
const T = new Date('2026-10-21T08:00:00').getTime(), D = 864e5;
(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  await ctx.route('**/api/ai**', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' }));
  const pg = await ctx.newPage();
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await pg.clock.install({ time: T });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  await pg.goto(APP + '#dev'); await pg.getByRole('button', { name: '60 days of sample' }).click(); await pg.waitForTimeout(400);
  await pg.evaluate(([T, D]) => localStorage.setItem('healthos.usage', JSON.stringify({ 'A pattern, with today on it': { seen: 12, used: 0, firstAt: T - 20 * D } })), [T, D]);
  await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('.brief', { timeout: 15000 }).catch(() => {}); await pg.waitForTimeout(1500);
  await pg.locator('.brief-row[data-row="feel"]').getByRole('button', { name: 'Check in' }).click().catch(() => {});
  await pg.locator('details.t2-more > summary').click(); await pg.waitForTimeout(1500);
  await pg.goto(APP + '#settings'); await pg.waitForSelector('#usage');
  const used = await pg.locator('#usage .uc-list:not(.quiet) li').evaluateAll((els) => els.map((e) => e.dataset.key));
  check(`used: the brief, and the fold opened (${used.join(' | ')})`, used.includes('Your brief') && used.includes('More about today'));
  const quiet = await pg.locator('#usage .uc-list.quiet li').evaluateAll((els) => els.map((e) => e.dataset.key));
  check(`never touched: seen 12 times over 20 days, never used (${quiet.join(' | ')})`, quiet.includes('A pattern, with today on it'));
  check('…and nothing is removed by itself', /Nothing is removed by itself/.test(await pg.locator('#usage').innerText()));
  await pg.locator('#usage').screenshot({ path: OUT + 'usage.png' }).catch(() => {});
  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message.split('\n')[0]); process.exit(1); });
