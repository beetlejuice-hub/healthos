// Where the AI money goes (PLAN 195; owner, 4 Nov: "6"). The Worker's usage with this month's cost by job: Settings → AI
// says "This month by job: reads $6.10 · chat $4.20 · research $1.40 · food & drink $0.30". Control: a month counted before
// the jobs were (no byTask) fills in from this month's recent calls and says how many. 320 px fits.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

const NOW = new Date('2026-11-04T12:00:00').getTime();
const base = { day: '2026-11-04', calls: 6, dayUsd: 0.4, month: '2026-11', monthUsd: 12, byModel: { sonnet: 12 } };
const call = (task, usd, at = NOW - 864e5) => ({ at, task, model: 'sonnet', in: 1, cached: 0, written: 0, out: 1, searches: 0, usd });

async function settings(b, usage) {
  const errs = [];
  const ctx = await b.newContext({ viewport: { width: 320, height: 800 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  await ctx.route('**/api/ai/usage**', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ usage, cap: 50, budget: 20, on: true }) }));
  await ctx.route('**/api/ai?**', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' }));
  const pg = await ctx.newPage();
  await pg.clock.install({ time: NOW });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  await pg.goto(APP + '#settings'); await pg.waitForSelector('.usage-jobs', { timeout: 8000 }).catch(() => {});
  return { ctx, pg, errs, line: (await pg.locator('.usage-jobs').innerText().catch(() => '')).replace(/\s+/g, ' ') };
}

(async () => {
  const b = await chromium.launch();
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  let { ctx, pg, errs, line } = await settings(b, { ...base, byTask: { digest: 4.1, night: 1.6, review: 0.4, chat: 4.2, research: 1.0, supplement: 0.4, describe: 0.3 } });
  check(`Settings → AI: this month by job, most first (${line})`, line === 'This month by job: reads $6.10 · chat $4.20 · research $1.40 · food & drink $0.30');
  check(`320: fits (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 320);
  await pg.locator('.usage-jobs').screenshot({ path: OUT + 'aicost.png' }).catch(() => {});
  check('no page errors', errs.length === 0);
  await ctx.close();
  ({ ctx, pg, errs, line } = await settings(b, { ...base, recent: [call('digest', 0.12), call('chat', 0.05), call('chat', 0.04), call('digest', 9, new Date('2026-10-30T09:00:00').getTime())] }));
  check(`control: counted before the jobs were — from this month's recent calls, and says so (${line})`, line === 'This month by job: reads $0.12 · chat $0.090 — from the last 3 calls; counted in full from now');
  console.log('errors: ' + JSON.stringify(errs)); check('no page errors', errs.length === 0);
  await ctx.close();
  await b.close();
})().catch((e) => { console.log('CRASH ' + e.message); process.exit(1); });
