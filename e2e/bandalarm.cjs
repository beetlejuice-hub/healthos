// The band's alarm on Today (PLAN 198; owner, 5 Nov: "App should notify pretty harshly when i have to reconnect the band
// to app"). The Worker is faked (worker/band.test.ts covers the pushes). Google dropped the sign-in: a red line at the top
// of Today, with when the newest data is from, and Reconnect — which opens Google's page; nothing on it closes it. The
// app tells the Worker its clock (for the pushes' quiet hours). Connected, newest reading 14 h old: a quieter line, not
// the red one. Control: connected and fresh — neither. 320 px fits.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const NOW = new Date('2026-11-05T13:00:00').getTime(), MIN = 60_000, H = 3_600_000;
  let server = { connected: false, needsReconnect: true, latest: new Date('2026-11-04T07:40:00').getTime() };
  const calls = [];
  const status = () => ({ connected: server.connected, needsReconnect: server.needsReconnect, connectedAt: NOW - 30 * 24 * H, lastSync: NOW - 4 * MIN, latest: server.latest, error: null, gapSec: 60 });
  const ctx = await b.newContext({ viewport: { width: 320, height: 760 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  await ctx.route('**/api/ai**', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' }));
  await ctx.route('https://accounts.google.com/**', (r) => r.fulfill({ contentType: 'text/html', body: '<title>Google</title>Sign in' }));
  await ctx.route(/\/api\/band\//, (r) => {
    const u = new URL(r.request().url()), op = u.pathname.split('/').pop();
    calls.push({ op, tz: r.request().headers()['x-tz'] });
    const body = op === 'start' ? { url: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=cid&state=s' }
      : op === 'data' ? { hr: server.connected ? [[server.latest, 64, 60, 70]] : [], sleep: [], rhr: {}, hrv: {}, ...status() } : status();
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  const pg = await ctx.newPage();
  await pg.clock.install({ time: NOW });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  await pg.goto(APP + '#today');

  // broken: the red line
  const alarm = pg.getByRole('alert', { name: 'Band disconnected' });
  await alarm.waitFor({ timeout: 10000 }).catch(() => {});
  const text = (await alarm.innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(`broken: a red line on Today — disconnected, the newest data's time, Reconnect (${text})`, /^Your band is disconnected Google stopped sending your Fitbit's data — the newest is from Wed 4 Nov 07:40\. Nothing new comes in until you reconnect; within 7 days the gap fills back in\. Reconnect$/.test(text));
  const top = await pg.evaluate(() => { const h = document.querySelector('.t2-head'), a = document.querySelector('.band-alarm'); return !!h && !!a && h.nextElementSibling === a; });
  check('…at the top, right under the heading', top);
  check(`…nothing on it closes it (buttons: ${JSON.stringify(await alarm.getByRole('button').allInnerTexts())})`, JSON.stringify(await alarm.getByRole('button').allInnerTexts()) === '["Reconnect"]');
  const bg = await alarm.evaluate((e) => getComputedStyle(e).backgroundColor);
  check(`…red (${bg})`, /rgb\((\d+), (\d+), (\d+)\)/.test(bg) && (([, r, g]) => +r > +g * 2)(bg.match(/rgb\((\d+), (\d+), (\d+)\)/)));
  check(`the app tells the Worker its clock (${JSON.stringify([...new Set(calls.map((c) => c.tz))])})`, calls.length > 0 && calls.every((c) => /^-?\d+$/.test(c.tz || '')));
  check(`320: fits (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 320);
  await alarm.screenshot({ path: OUT + 'bandalarm.png' });
  await Promise.all([pg.waitForURL(/accounts\.google\.com/, { timeout: 8000 }).catch(() => {}), alarm.getByRole('button', { name: 'Reconnect' }).click()]);
  check(`Reconnect opens Google's page (${pg.url().slice(0, 60)})`, /^https:\/\/accounts\.google\.com\//.test(pg.url()) && calls.some((c) => c.op === 'start'));

  // connected, but the newest reading is 14 h old: the quieter line
  server = { connected: true, needsReconnect: false, latest: NOW - 14 * H };
  await pg.goto(APP + '#today'); await pg.waitForSelector('text=Settings');
  const stale = pg.locator('.band-stale');
  await stale.waitFor({ timeout: 10000 }).catch(() => {});
  const st = await stale.innerText().catch(() => '');
  check(`no new data for 14 h: a quieter line, not the red one (${st})`, /^No new band data since Wed 4 Nov 23:00 — open the Fitbit app on your phone so the band syncs\.$/.test(st) && (await pg.locator('.band-alarm').count()) === 0);

  // control: connected and fresh
  server = { connected: true, needsReconnect: false, latest: NOW - 20 * MIN };
  await pg.reload(); await pg.waitForSelector('text=Settings'); await pg.waitForTimeout(1500);
  check('control: connected and fresh — no line at all', (await pg.locator('.band-alarm, .band-stale').count()) === 0);
  console.log('errors: ' + JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH ' + e.message); process.exit(1); });
