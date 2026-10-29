// Reform A2 (owner, 29 Oct: Yes to "One line: “Ask about anything you log.” The rest behind a small ?"). An empty AI tab
// opens with the one line and a ?; the ? opens what it sees and when it writes, and closes it again. 390 and 320 fit.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  for (const w of [390, 320]) {
    const ctx = await b.newContext({ viewport: { width: w, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    await ctx.route('**/api/ai**', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' }));
    const pg = await ctx.newPage(); pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    await pg.goto(APP); await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
    await pg.evaluate(() => { const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k) || '{}'); s.ai = { ...(s.ai || {}), chat: [], inbox: [] }; localStorage.setItem(k, JSON.stringify(s)); });
    await pg.goto(APP + '#ai'); await pg.reload(); await pg.waitForSelector('.ai-intro');
    const intro = () => pg.locator('.ai-intro').innerText().then((t) => t.replace(/\s+/g, ' ').trim());
    check(`${w}: one line and a ? (${await intro()})`, await intro() === 'Ask about anything you log. ?');
    await pg.locator('.ai-q').click(); await pg.waitForTimeout(150);
    check(`${w}: the ? opens what it sees and when it writes`, /^Ask about anything you log\. \? I see your numbers, patterns, stack and About me\..*your week and month\.$/.test(await intro()) && await pg.locator('.ai-q').getAttribute('aria-expanded') === 'true');
    check(`${w}: fits (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= w);
    await pg.locator('.ai-intro').screenshot({ path: OUT + `aiintro-${w}.png` });
    await pg.locator('.ai-q').click(); await pg.waitForTimeout(150);
    check(`${w}: and closes again`, await intro() === 'Ask about anything you log. ?');
    await ctx.close();
  }
  console.log('errors: ' + JSON.stringify(errs)); await b.close();
})().catch((e) => { console.log('CRASH ' + e.message); process.exit(1); });
