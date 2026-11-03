// Settings → AI with Gemini (owner, 3 Nov: "bro why are we not doing the gemini free api tier … for bs like food calorie
// estimate … i also have 10 dollar in gemini credits"). The server has both keys: Settings says the order (free tier,
// then his credit, then Claude) and today's count; the call list names who answered. Control: no keys → it says which
// two to add, in Cloudflare. 390 px fits.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

const NOW = new Date('2026-11-03T13:00:00').getTime();
const call = (min, task, via, usd) => ({ at: NOW - min * 60_000, task, model: 'haiku', in: 3000, cached: 0, written: 0, out: 400, searches: 0, usd, ...(via ? { via } : {}) });
const usage = { day: '2026-11-03', calls: 4, dayUsd: 0.0012, month: '2026-11', monthUsd: 0.4, byModel: {}, recent: [call(200, 'describe', 'gemini-free', 0), call(150, 'questions', 'gemini-free', 0), call(90, 'describe', 'gemini', 0.0012), call(30, 'describe', null, 0.0005)] };

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  async function open(gemini) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    await ctx.route('**/api/ai/usage**', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ usage, cap: 50, budget: 20, on: true, gemini }) }));
    await ctx.route('**/api/ai?**', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' }));
    const pg = await ctx.newPage();
    await pg.clock.install({ time: NOW });
    pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
    await pg.goto(APP);
    await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
    await pg.goto(APP + '#settings'); await pg.waitForSelector('#ai'); await pg.waitForTimeout(300);
    return { ctx, pg };
  }
  let { ctx, pg } = await open({ free: true, paid: true });
  const line = (await pg.locator('.ai-gemini').innerText()).replace(/\s+/g, ' ');
  check(`both keys: the order, and today's count (${line})`, line === "Food estimates and the app's questions go to Gemini first — its free tier, then your Gemini credit, then Claude. Today: 2 free, 1 on credit.");
  await pg.getByText('Last calls — what each cost').click();
  const calls = (await pg.locator('.ai-calls li').allInnerTexts()).map((t) => t.replace(/\s+/g, ' '));
  check(`the call list names who answered (${calls.join(' | ')})`, calls.filter((c) => /Gemini \(free\) .* free$/.test(c)).length === 2 && calls.filter((c) => /Gemini \(credit\)/.test(c)).length === 1 && calls.some((c) => /Food · Haiku/i.test(c) || /Haiku 5\.5/.test(c)));
  check(`fits (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
  await pg.locator('#ai').screenshot({ path: OUT + 'gemini-settings.png' });
  await ctx.close();
  ({ ctx, pg } = await open({ free: false, paid: false }));
  const none = (await pg.locator('.ai-gemini').innerText()).replace(/\s+/g, ' ');
  check(`control: no keys → which two to add, and where (${none.slice(0, 120)}…)`, /add GEMINI_FREE_KEY .* and GEMINI_API_KEY .* in Cloudflare/.test(none));
  await ctx.close();
  console.log('errors: ' + JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH ' + e.message); process.exit(1); });
