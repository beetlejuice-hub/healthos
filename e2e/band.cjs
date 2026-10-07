// The Fitbit band (PLAN 48), the app's side. The Worker and Google are faked here (worker/band.test.ts
// covers them): Connect → Google's page → back to Settings connected; the card's facts; heart rate and
// sleep stages on the timeline; a "no" from Google; a sign-in Google dropped; disconnect; no keys.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const NOW = new Date('2026-10-07T13:00:00').getTime(), MIN = 60_000;
  // A day of minutes (resting ~58 at night, ~75 by day, a workout spike at 11:00), off the wrist 09:00–09:30.
  const hr = [];
  for (let t = NOW - 24 * 60 * MIN; t <= NOW - 2 * MIN; t += MIN) {
    const h = new Date(t).getHours(), m = new Date(t).getMinutes();
    if (h === 9 && m < 30) continue;
    const avg = h >= 0 && h < 7 ? 58 : h === 11 ? 128 : 74;
    hr.push([t, avg, avg - 4, avg + 5]);
  }
  hr[hr.length - 1][1] = 72;
  const at = (d, h, m) => new Date(2026, 9, d, h, m).getTime();
  const night = { id: 'n1', start: at(6, 23, 40), end: at(7, 7, 10), asleepMin: 412, awakeMin: 38, toFallAsleepMin: 12, nap: false, stageMin: { deep: 70, light: 240, rem: 102, awake: 38 },
    stages: [['light', 23, 52, 0, 30], ['deep', 0, 30, 1, 40], ['light', 1, 40, 3, 0], ['rem', 3, 0, 3, 45], ['awake', 3, 45, 3, 55], ['light', 3, 55, 5, 30], ['rem', 5, 30, 6, 40], ['light', 6, 40, 7, 10]]
      .map(([type, h1, m1, h2, m2]) => ({ type, start: at(h1 >= 12 ? 6 : 7, h1, m1), end: at(h2 >= 12 ? 6 : 7, h2, m2) })) };

  let server = { configured: true, connected: false, needsReconnect: false };
  const calls = [];
  const status = () => ({ connected: server.connected, needsReconnect: server.needsReconnect, connectedAt: server.connected ? NOW - 3600_000 : null, lastSync: server.connected ? NOW - 4 * MIN : null, latest: server.connected ? hr.at(-1)[0] : null, error: null });

  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  await ctx.route(/\/api\/band\//, (r) => {
    const u = new URL(r.request().url()), op = u.pathname.split('/').pop();
    calls.push({ op, method: r.request().method(), auth: r.request().headers().authorization || '', search: u.search });
    if (!server.configured) return r.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: "the band isn't set up on this server" }) });
    const body = op === 'start' ? { url: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=cid&state=s' }
      : op === 'disconnect' ? (server.connected = false, { ok: true })
      : op === 'data' ? { hr: server.connected ? hr : [], sleep: server.connected ? [night] : [], rhr: server.connected ? { '2026-10-07': 54 } : {}, hrv: {}, ...status() }
      : status();
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  // Google's page, faked: you say yes, Google sends you through our callback, which lands on Settings.
  await ctx.route('https://accounts.google.com/**', (r) => { server.connected = true; r.fulfill({ status: 302, headers: { location: APP + '#settings/band-ok' } }); });

  const pg = await ctx.newPage();
  await pg.clock.install({ time: NOW });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  await pg.evaluate(() => { const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k) || '{}');
    s.entries = [{ id: 'c1', kind: 'drink', at: new Date(2026, 9, 7, 8, 10).getTime(), name: 'Coffee', ml: 250, caffeineMg: 95, alcoholG: 0, kcal: 2 }]; localStorage.setItem(k, JSON.stringify(s)); });

  // 1. Not connected: what it reads, read-only promise, one button.
  await pg.goto(APP + '#settings'); await pg.reload();
  const card = pg.locator('.card.band');
  await card.getByRole('button', { name: 'Connect Fitbit' }).waitFor({ timeout: 5000 }).catch(() => {});
  check('not connected: says what it reads, read-only, Connect button', /not connected/.test(await card.innerText()) && /Read-only/.test(await card.innerText()) && await card.getByRole('button', { name: 'Connect Fitbit' }).count() === 1);
  check('opening the app asked the server, signed in', calls.some((c) => c.op === 'status' && /^Bearer tok-u-test$/.test(c.auth)));
  check('not connected: no pull, no data asked for', !calls.some((c) => c.op === 'sync' || c.op === 'data'));

  // 2. Connect → Google → back, connected.
  await card.getByRole('button', { name: 'Connect Fitbit' }).click();
  await pg.waitForURL(/#settings$/, { timeout: 8000 }).catch(() => {});
  await pg.waitForFunction(() => /Latest heart rate/.test(document.querySelector('.card.band')?.textContent ?? ''), null, { timeout: 8000 }).catch(() => {});
  const txt = await card.innerText();
  check(`start asked by POST, signed in`, calls.some((c) => c.op === 'start' && c.method === 'POST' && /^Bearer /.test(c.auth)));
  check(`back from Google: "Connected", the address cleaned up (${await pg.evaluate(() => location.hash)})`, /Connected\. The first pull/.test(txt) && await pg.evaluate(() => location.hash) === '#settings');
  check(`card shows it working: last pull, latest HR, last night, resting HR\n      ${txt.replace(/\n/g, ' | ')}`,
    /Last pull\s*12:56/.test(txt) && /Latest heart rate\s*72 bpm · 12:58/.test(txt) && /Last night\s*6 h 52 m asleep · 23:40–07:10/.test(txt) && /Resting heart rate\s*54 bpm/.test(txt));
  check('connected: asked for a pull, then a week of data', calls.some((c) => c.op === 'sync' && c.method === 'POST') && calls.some((c) => c.op === 'data' && Math.abs(+new URLSearchParams(c.search).get('from') - (NOW - 7 * 86_400_000)) < 120_000));
  const cb = await card.boundingBox();
  check(`card fits the phone (${Math.round(cb.width)} px, page ${await pg.evaluate(() => document.documentElement.scrollWidth)})`, cb.x >= 0 && cb.x + cb.width <= 390 && await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
  await card.scrollIntoViewIfNeeded();
  await pg.screenshot({ path: OUT + 'band-settings.png', clip: { x: 0, y: Math.max(0, (await card.boundingBox()).y - 10), width: 390, height: Math.min(560, (await card.boundingBox()).height + 20) } });

  // 3. The timeline: heart rate and sleep stages drawn, readouts filled.
  await pg.goto(APP + '#insights/timeline'); await pg.waitForSelector('.master'); await pg.waitForTimeout(600);
  const cv = pg.locator('.mg-canvas');
  const lanes = (await cv.getAttribute('data-lanes')).split(',');
  check(`timeline has heart rate and sleep lanes (${lanes.join(' ')})`, lanes.includes('hr') && lanes.includes('sleep'));
  const ro = await pg.locator('.readout').innerText();
  check(`readout at now: heart rate 72, the band's night, resting HR\n      ${ro.replace(/\n/g, ' | ')}`, /Heart rate\s*72 bpm/.test(ro) && /Band\s*23:40–07:10 · 6 h 52 asleep/.test(ro) && /Deep · REM\s*70 · 102 min/.test(ro) && /Resting HR\s*54 bpm/.test(ro));
  const openLanes = async () => { if (await pg.locator('.lanes-t').getAttribute('aria-expanded') !== 'true') await pg.locator('.lanes-t').click(); };
  await openLanes();
  const leg = await pg.locator('.legend').innerText();
  check('lanes list: heart rate and sleep stages are real lanes now, ticked on, no "wearable" placeholder', /Heart rate/.test(leg) && !leg.includes('wearable') && await pg.locator('#lg-hr').isChecked() && await pg.locator('#lg-sleep').isChecked());
  // Point at 03:20 (REM) and 09:15 (off the wrist).
  await cv.evaluate((el) => { el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -140); }); await pg.waitForTimeout(100);
  const [t0, t1] = (await cv.getAttribute('data-view')).split(',').map(Number);
  const box = await cv.boundingBox(), [LEFT, RIGHT] = (await cv.getAttribute('data-plot')).split(',').map(Number);
  const xOf = (t) => box.x + LEFT + ((t - t0) / (t1 - t0)) * (box.width - LEFT - RIGHT);
  await pg.mouse.move(xOf(at(7, 3, 20)), box.y + 40); await pg.waitForTimeout(150);
  const ro2 = await pg.locator('.readout').innerText();
  check(`pointing at 03:20: asleep, REM, ~58 bpm (${ro2.split('\n').slice(0, 3).join(' | ')})`, /Heart rate\s*58 bpm/.test(ro2) && /Sleep\s*rem/.test(ro2));
  await pg.mouse.move(xOf(at(7, 9, 15)), box.y + 40); await pg.waitForTimeout(150);
  check('pointing at a gap (band off): no heart rate made up', /Heart rate\s*—/.test(await pg.locator('.readout').innerText()));
  // The HR lane is drawn: some pixels in it carry the heart-rate red.
  const hrDrawn = await cv.evaluate((el) => {
    const ctx = el.getContext('2d'), d = ctx.getImageData(0, 0, el.width, el.height).data; let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] > 100 && d[i + 1] < 150 && d[i + 2] > 90 && d[i + 2] < 130 && d[i + 3] > 200) n++;
    return n;
  });
  check(`heart-rate line drawn (${hrDrawn} red pixels)`, hrDrawn > 200);
  await pg.mouse.move(0, 0);
  await cv.screenshot({ path: OUT + 'band-graph.png' });

  // 4. Google said no.
  await pg.goto(APP + '#settings/band-failed?why=you%20said%20no%20on%20Google%27s%20page'); await pg.reload();
  await pg.waitForFunction(() => /Didn't connect/.test(document.querySelector('.card.band')?.textContent ?? ''), null, { timeout: 5000 }).catch(() => {});
  check('a "no" on Google\'s page says so, in words', /Didn't connect: you said no on Google's page/.test(await card.innerText()));

  // 5. Google dropped the sign-in: reconnect, nothing lost.
  server.connected = false; server.needsReconnect = true;
  await pg.goto(APP + '#settings'); await pg.reload();
  await card.getByRole('button', { name: 'Reconnect' }).waitFor({ timeout: 5000 }).catch(() => {});
  check('dropped sign-in: "needs you" + Reconnect', /needs you/.test(await card.innerText()) && await card.getByRole('button', { name: 'Reconnect' }).count() === 1);

  // 6. Disconnect (asks first).
  server.connected = true; server.needsReconnect = false;
  await pg.reload();
  await card.getByRole('button', { name: 'Disconnect' }).waitFor({ timeout: 5000 }).catch(() => {});
  let asked = '';
  pg.once('dialog', (d) => { asked = d.message(); void d.accept(); });
  await card.getByRole('button', { name: 'Disconnect' }).click();
  await card.getByRole('button', { name: 'Connect Fitbit' }).waitFor({ timeout: 5000 }).catch(() => {});
  check(`disconnect asks first, then it's gone ("${asked.slice(0, 40)}…")`, /deletes the heart rate/.test(asked) && calls.some((c) => c.op === 'disconnect' && c.method === 'POST') && await card.getByRole('button', { name: 'Connect Fitbit' }).count() === 1);
  await pg.goto(APP + '#insights/timeline'); await pg.waitForSelector('.master'); await pg.waitForTimeout(300);
  await openLanes();
  check('after disconnect the timeline is back to the placeholder', /Heart rate · wearable/.test(await pg.locator('.legend').innerText()) && /Heart rate\s*no wearable/.test(await pg.locator('.readout').innerText()));

  // 7. No Google keys on the server.
  server.configured = false;
  await pg.goto(APP + '#settings'); await pg.reload(); await pg.waitForTimeout(800);
  check('no keys on the server: "not set up", no button', /not set up/.test(await card.innerText()) && await card.getByRole('button').count() === 0);

  console.log('errors:', JSON.stringify(errs));
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
