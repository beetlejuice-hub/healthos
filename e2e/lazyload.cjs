// A faster first load (PLAN 195; owner, 4 Nov: "4"): Insights, Log, Workout and Settings come in their own files, after
// Today. Planted: the Insights file missing once (an old page open across a deploy) — the page reloads once and Insights
// opens. Missing every time (offline): a line and Try again, no blank page, no reload loop. Control: nothing missing —
// Insights opens with no reload. Today's first file is under 900 kB (it was 1.5 MB).
const fs = require('fs'), path = require('path');
const { chromium, APP, handle } = require('./harness.cjs');

async function open(b, misses) {
  const errs = []; let failed = 0, loads = 0;
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  await ctx.route('**/assets/Insights-*.js', (r) => (failed < misses ? (failed++, r.fulfill({ status: 404, body: 'gone' })) : r.continue()));
  const pg = await ctx.newPage();
  pg.on('load', () => loads++);
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  const before = loads;
  await pg.goto(APP + '#insights'); await pg.waitForTimeout(2500);
  return { ctx, pg, errs, reloads: loads - before, failed };
}

(async () => {
  const b = await chromium.launch();
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const dist = process.env.E2E_DIST, first = fs.readdirSync(path.join(dist, 'assets')).filter((f) => /^index-.*\.js$/.test(f)).map((f) => fs.statSync(path.join(dist, 'assets', f)).size)[0];
  check(`Today's first file: ${Math.round(first / 1000)} kB (it was 1,515 kB)`, first < 900_000);

  let { ctx, pg, errs, reloads } = await open(b, 0);
  check(`control: nothing missing — Insights opens, no reload (${reloads} reloads)`, reloads === 0 && await pg.locator('.inst').count() > 0);
  await ctx.close();
  ({ ctx, pg, errs, reloads } = await open(b, 1));
  check(`the Insights file gone once (a deploy): one reload, then Insights (${reloads} reload)`, reloads === 1 && await pg.locator('.inst').count() > 0);
  await ctx.close();
  let failed;
  ({ ctx, pg, errs, reloads, failed } = await open(b, 99));
  const msg = await pg.locator('.screen-failed').innerText().catch(() => '');
  check(`gone every time (offline): one reload at most, then a line and Try again — not a blank page (${reloads} reloads, ${failed} misses: ${msg.replace(/\s+/g, ' ')})`,
    reloads <= 1 && /This page didn't load/.test(msg) && await pg.getByRole('button', { name: 'Try again' }).count() === 1);
  check('…and the tabs still work: Today opens', await (async () => { await pg.locator('nav.tabs a[href="#today"]').click(); await pg.waitForTimeout(400); return (await pg.locator('.screen-failed').count()) === 0; })());
  errs = errs.filter((e) => !/Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(e));
  console.log('errors: ' + JSON.stringify(errs)); check('no other page errors', errs.length === 0);
  await ctx.close();
  await b.close();
})().catch((e) => { console.log('CRASH ' + e.message); process.exit(1); });
