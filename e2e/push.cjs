// Notifications: turn on (real permission + service worker; the push subscription and /api/push are
// faked — headless Chrome can't reach Google's push service), the plan the app sends, re-planning
// after a check-in, switching a kind off, a test, turning off. Plus the iPhone-in-Safari message.
const { chromium, APP, OUT, handle, rate } = require('./harness.cjs');

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const calls = [];
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, permissions: ['notifications'] });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  await ctx.route(/\/api\/push\//, async (r) => {
    const op = new URL(r.request().url()).pathname.split('/').pop(), body = r.request().postDataJSON?.() ?? null;
    calls.push({ op, body, auth: r.request().headers().authorization || '' });
    const res = { key: { publicKey: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4' }, subscribe: { ok: true }, unsubscribe: { ok: true },
      schedule: { ok: true }, test: { devices: [{ device: 'Mac Chrome', last: { at: Date.now(), status: 201 } }] },
      status: { devices: [{ device: 'Mac Chrome', endpoint: 'https://fcm.example/1' }], next: new Date('2026-10-02T13:00:00').getTime() } }[op];
    r.fulfill({ status: res ? 200 : 404, contentType: 'application/json', body: JSON.stringify(res ?? { error: 'nope' }) });
  });
  await ctx.addInitScript(() => {
    const fake = { endpoint: 'https://fcm.example/1', toJSON() { return { endpoint: this.endpoint, keys: { p256dh: 'BCVxsr7N', auth: 'BTBZ' } }; }, unsubscribe: async () => true };
    let subscribed = false;
    // Headless Chrome always says "denied"; act like a fresh phone: not asked yet, then allowed.
    let perm = 'default';
    Object.defineProperty(Notification, 'permission', { get: () => perm });
    Notification.requestPermission = async () => { perm = 'granted'; window.__asked = true; return perm; };
    PushManager.prototype.subscribe = async function (o) { window.__subOpts = o; subscribed = true; return fake; };
    PushManager.prototype.getSubscription = async () => (subscribed ? fake : null);
  });
  const pg = await ctx.newPage();
  await pg.clock.install({ time: new Date('2026-10-02T12:00:00') });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');

  await pg.goto(APP + '#settings');
  const card = pg.locator('.card.notif');
  await card.getByRole('button', { name: 'Turn on' }).click();
  await pg.waitForFunction(() => document.querySelector('.card.notif')?.textContent?.includes('on for this device'), null, { timeout: 8000 }).catch(() => {});
  check('turned on: card says so, kinds shown', /on for this device/.test(await card.innerText()) && await card.locator('input[type=checkbox]').count() === 3);
  check('asked for permission from the tap', await pg.evaluate(() => window.__asked === true));
  check('service worker registered for real', await pg.evaluate(async () => !!(await navigator.serviceWorker.getRegistration('/sw.js'))));
  check('subscribed with the server\'s key', await pg.evaluate(() => window.__subOpts?.userVisibleOnly === true && window.__subOpts.applicationServerKey?.byteLength === 65));
  const sub = calls.find((c) => c.op === 'subscribe');
  check('device sent to the server, signed in', sub && sub.body.subscription.endpoint === 'https://fcm.example/1' && /Chrome/.test(sub.body.device) && /^Bearer /.test(sub.auth));
  const plan1 = calls.filter((c) => c.op === 'schedule').pop()?.body.reminders ?? [];
  const fmt = (r) => `${String(new Date(r.at).getHours()).padStart(2, '0')}:${String(new Date(r.at).getMinutes()).padStart(2, '0')} ${r.title}`;
  check(`plan sent (${plan1.slice(0, 4).map(fmt).join(' | ')} …)`, fmt(plan1[0]) === '13:00 How now?' && plan1.some((r) => fmt(r) === '22:00 Evening stack'));
  await pg.screenshot({ path: OUT + 'push-settings.png', fullPage: false, clip: { x: 0, y: Math.max(0, (await card.boundingBox()).y - 10), width: 390, height: 520 } });

  // A check-in at 12:00 → the 13:00 nudge is dropped from the next plan.
  await pg.goto(APP + '#today');
  await rate(pg, 'mood', 7);
  await pg.clock.fastForward(4000); await pg.waitForTimeout(300);
  const plan2 = calls.filter((c) => c.op === 'schedule').pop()?.body.reminders ?? [];
  check(`after rating, today's 13:00 nudge gone, tomorrow's kept (first now: ${plan2[0] && fmt(plan2[0])})`, !plan2.some((r) => fmt(r) === '13:00 How now?' && new Date(r.at).getDate() === 2) && plan2.some((r) => fmt(r) === '13:00 How now?' && new Date(r.at).getDate() === 3));

  // Switch supplements off → re-planned without them.
  await pg.goto(APP + '#settings');
  await card.getByLabel(/Supplements/).uncheck(); await pg.waitForTimeout(400);
  const plan3 = calls.filter((c) => c.op === 'schedule').pop()?.body.reminders ?? [];
  check('supplements off → none planned', plan3.length > 0 && plan3.every((r) => !r.tag.includes('supp')));

  await card.getByRole('button', { name: 'Send a test' }).click(); await pg.waitForTimeout(300);
  check('test: says sent, device shows delivered', /Sent\./.test(await card.innerText()) && /Mac Chrome · delivered/.test(await card.innerText()));
  await card.getByRole('button', { name: 'Turn off here' }).click(); await pg.waitForTimeout(300);
  check('turn off: unsubscribed on the server too', calls.some((c) => c.op === 'unsubscribe') && /Turn on/.test(await card.innerText()));

  // iPhone in Safari (not from the Home Screen): explains how.
  const ios = await b.newContext({ viewport: { width: 390, height: 844 }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
  await ios.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  const ip = await ios.newPage(); await ip.goto(APP);
  await ip.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await ip.fill('input[type=password]', 'secret123');
  await ip.getByRole('button', { name: 'Sign in' }).click(); await ip.waitForSelector('text=Settings');
  await ip.goto(APP + '#settings');
  check('iPhone in Safari: tells you to add it to the Home Screen', /Add to Home Screen/.test(await ip.locator('.card.notif').innerText()) && await ip.locator('.card.notif').getByRole('button', { name: 'Turn on' }).count() === 0);
  console.log('errors:', JSON.stringify(errs));
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
