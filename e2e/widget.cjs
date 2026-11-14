// The lock-screen widget (owner, 14 Nov, item 10: "Can we do lock screen widget?"). Settings → "Set up the widget": the
// script with its own key and URL, the steps; Today then leaves the widget a snapshot — readiness, last night's score,
// the stack, the day's caffeine, bedtime, the next session, the phone's time zone; "Turn off" stops it.
const { chromium, APP, OUT, handle } = require('./harness.cjs');
const { sampleBand, routeBand } = require('./tools/sampleband.cjs');

(async () => {
  const b = await chromium.launch(); const errs = [], snaps = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const now = new Date('2026-10-21T08:00:00').getTime(), KEY = 'u-test.' + 'ab'.repeat(24);
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  await ctx.route('**/api/ai**', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' }));
  await ctx.route(/\/api\/widget\//, (rt) => {
    const op = new URL(rt.request().url()).pathname.split('/').pop();
    if (op === 'key') return rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ key: KEY, url: 'https://healthos.example/api/widget' }) });
    if (op === 'snap') { snaps.push(JSON.parse(rt.request().postData() || '{}')); return rt.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); }
    rt.fulfill({ status: 404, body: '{}' });
  });
  const pg = await ctx.newPage();
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await pg.clock.install({ time: now });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  await pg.goto(APP + '#dev'); await pg.getByRole('button', { name: '60 days of sample' }).click(); await pg.waitForTimeout(400);
  const s = await pg.evaluate(() => JSON.parse(localStorage.getItem('healthos.v1:u-test') || '{}'));
  await routeBand(ctx, sampleBand(s.entries || [], s.workouts || [], now), now);

  // before: Today sends nothing
  await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('.brief', { timeout: 15000 }).catch(() => {}); await pg.waitForTimeout(1500);
  check(`no widget yet: nothing left on the server (${snaps.length})`, snaps.length === 0);

  await pg.goto(APP + '#settings'); await pg.waitForSelector('#widget');
  await pg.locator('#widget').getByRole('button', { name: 'Set up the widget' }).click(); await pg.waitForTimeout(300);
  const script = await pg.getByLabel("The widget's script").inputValue().catch(() => '');
  check('Settings: the script carries its key and URL', script.includes(`const KEY = "${KEY}";`) && script.includes('const URL_ = "https://healthos.example/api/widget";') && script.includes('Script.setWidget(w)'));
  check('…and the steps, Scriptable first', /Install Scriptable/.test(await pg.locator('#widget .ws-steps').innerText()));
  await pg.locator('#widget').screenshot({ path: OUT + 'widget-setup.png' }).catch(() => {});

  await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('.brief', { timeout: 15000 }).catch(() => {});
  // the first snapshot can come before the band's night does; a newer one follows once it's in
  for (let i = 0; i < 30 && !snaps.some((x) => x.readiness); i++) await pg.waitForTimeout(500);
  const last = snaps.filter((x) => x.readiness).at(-1) || snaps.at(-1) || {};
  check(`Today leaves the snapshot (${JSON.stringify({ day: last.day, r: last.readiness, sleep: last.sleep, stack: last.stack, next: last.next, doses: last.doses?.length, tz: last.tz })})`,
    last.day === '2026-10-21' && last.readiness?.score > 0 && last.sleep > 0 && last.stack?.total > 0 && typeof last.next === 'string' && Array.isArray(last.doses) && typeof last.tz === 'number' && last.bed > now);
  await pg.goto(APP + '#settings'); await pg.locator('#widget').getByRole('button', { name: 'Turn off' }).click(); await pg.waitForTimeout(500);
  const n = snaps.length;
  await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('.brief', { timeout: 15000 }).catch(() => {}); await pg.waitForTimeout(2000);
  check(`turned off: nothing more sent (${snaps.length - n})`, snaps.length === n);
  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message.split('\n')[0]); process.exit(1); });
