// The barcode camera (PLAN 72; owner, 13 Oct: "it asks me if i give permission every single time"). Closing the scanner
// keeps the camera 30 s: opening it again within that time doesn't ask the browser for the camera again (no prompt); after
// 30 s it really stops. A test camera has no lens names, so the browser's default stays (lib/camera picks only by name).
const { chromium, APP, OUT, handle } = require('./harness.cjs');

(async () => {
  const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] }); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, permissions: ['camera'] });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  // count every time the app asks for the camera, and keep the streams to look at
  await ctx.addInitScript(() => {
    const md = navigator.mediaDevices, real = md.getUserMedia.bind(md);
    window.__asks = 0; window.__streams = [];
    md.getUserMedia = async (c) => { window.__asks++; const s = await real(c); window.__streams.push(s); return s; };
  });
  const pg = await ctx.newPage();
  await pg.clock.install({ time: new Date('2026-10-13T12:00:00') });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  await pg.goto(APP + '#log/food');
  const scan = async () => { await pg.getByRole('button', { name: 'Scan a barcode' }).first().click(); await pg.waitForSelector('.scanner video.on', { timeout: 5000 }).catch(() => {}); };
  const live = () => pg.evaluate(() => window.__streams.filter((s) => s.getTracks().some((t) => t.readyState === 'live')).length);
  await scan();
  check('the camera opens', await pg.locator('.scanner video.on').count() === 1);
  const asked = await pg.evaluate(() => window.__asks);
  await pg.getByRole('button', { name: 'Cancel' }).click(); await pg.waitForSelector('.scanner', { state: 'detached' });
  check(`closed: the camera is kept for the next scan (${await live()} live)`, await live() === 1);
  await pg.clock.runFor(10_000);
  await scan();
  check(`opened again 10 s later: no new ask for the camera (${await pg.evaluate(() => window.__asks)} asks, ${asked} before)`, await pg.evaluate(() => window.__asks) === asked && await pg.locator('.scanner video.on').count() === 1);
  await pg.getByRole('button', { name: 'Cancel' }).click(); await pg.waitForSelector('.scanner', { state: 'detached' });
  await pg.clock.runFor(31_000);
  check(`30 s after closing: the camera is off (${await live()} live)`, await live() === 0);
  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
