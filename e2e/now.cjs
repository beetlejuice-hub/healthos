// /now — How now? on its own (the Home Screen icon and the How now? notifications open it).
const fs = require('node:fs'), path = require('node:path');
const { chromium, APP, OUT, handle } = require('./harness.cjs');
// What the Worker serves at /now (worker/index.ts nowPage; its unit test checks the real one).
const nowHtml = () => fs.readFileSync(path.join(__dirname, '..', 'dist', 'index.html'), 'utf8')
  .replace('<title>HealthOS</title>', '<title>How now?</title>').replace('href="/manifest.webmanifest"', 'href="/now.webmanifest"')
  .replace('href="/icon-180.png"', 'href="/now-180.png"').replace('content="HealthOS" />', 'content="How now?" />');

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  await ctx.route(new RegExp('^' + APP.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&') + 'now/?$'), (r) => r.fulfill({ status: 200, contentType: 'text/html', body: nowHtml() }));
  const pg = await ctx.newPage();
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');

  await pg.goto(APP + 'now'); await pg.waitForSelector('#feel');
  check('it is "How now?": title and its own manifest', (await pg.title()) === 'How now?' && await pg.locator('link[rel=manifest]').getAttribute('href') === '/now.webmanifest');
  check('just the check-in: four rows, no tab bar', await pg.locator('#feel .hn-row:not(.hn-sleep) .hn-nums').count() === 4 && await pg.locator('nav.tabs').count() === 0);
  check('the full app is one tap away', await pg.getByRole('link', { name: 'Open HealthOS' }).getAttribute('href') === '/#today');
  await pg.getByRole('button', { name: 'mood 7', exact: true }).click();
  await pg.getByRole('button', { name: 'energy 5', exact: true }).click(); await pg.waitForTimeout(200);
  await pg.screenshot({ path: OUT + 'now.png', fullPage: false });
  await pg.getByRole('button', { name: 'Done' }).click(); await pg.waitForTimeout(150);
  check('Done: one line confirms it', /Rated \d\d:\d\d · energy 5 · mood 7/.test(await pg.locator('#feel').innerText()));
  await pg.reload(); await pg.waitForSelector('#feel');
  check('opened again soon after: still ready to rate (the icon is for rating)', await pg.locator('#feel .hn-row:not(.hn-sleep) .hn-nums').count() === 4);

  // The manifests: the shortcut's own, and the main app's long-press shortcut (Android/Chrome).
  const nm = await (await pg.request.get(APP + 'now.webmanifest')).json(), mm = await (await pg.request.get(APP + 'manifest.webmanifest')).json();
  check('now.webmanifest: "How now?" starting at /now with PNG icons', nm.name === 'How now?' && nm.start_url === '/now' && nm.icons.every((i) => i.type === 'image/png'));
  check('main manifest: long-press shortcut to /now, PNG icons for iPhone', mm.shortcuts?.[0]?.url === '/now' && mm.icons.some((i) => i.src === '/icon-180.png'));
  check('PNG icons are served', (await pg.request.get(APP + 'now-180.png')).ok() && (await pg.request.get(APP + 'icon-180.png')).ok());
  console.log('errors:', JSON.stringify(errs));
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
