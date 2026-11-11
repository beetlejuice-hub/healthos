// Places on their own (PLAN 212; owner, 11 Nov: "i told u no bedroom air sensor · For the damn google maps pls automate it,
// somehow. like pulling every now and then"). Settings → Places: no air sensor anywhere; Overland's three steps; "Set up
// Overland" makes a key and opens Overland's setup link (the address and key shown to paste if it didn't open). Then the
// Worker has 45 days of places worked out from Overland's points: the app pulls them on its own (no file), names a place,
// and What makes a day finds the planted effect — focus 0.4 lower for each hour away from home the day before. A Timeline
// file still brings in the past without overwriting Overland's days. Control: before Overland sends anything — nothing
// pulled, the steps still shown. On a phone: fits.
const { chromium, APP, OUT, handle, tables } = require('./harness.cjs');

const NOW = new Date('2026-11-11T15:00:00').getTime(), D = 864e5, KEY = 'healthos.v1:u-test';
const pad = (n) => String(n).padStart(2, '0');
const day = (t) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  let x = 17; const r = () => { x = (x * 16807) % 2147483647; return x / 2147483647; };
  const away = {}; for (let i = 46; i >= 1; i--) away[i] = Math.round((2 + r() * 10) * 10) / 10;
  const days = {}; for (let i = 45; i >= 1; i--) days[day(NOW - i * D)] = { awayH: away[i], km: Math.round(away[i] * 3), activeMin: 20 + Math.round(r() * 40), places: 1 + Math.floor(r() * 3), awayNight: false };
  const places = { days, top: [{ id: '23749:6347', lat: 47.4979, lng: 19.0402, visits: 90, hours: 900, home: true }, { id: '23762:6347', lat: 47.5249, lng: 19.0402, visits: 30, hours: 160, home: false }], home: '23749:6347', from: day(NOW - 45 * D), to: day(NOW - D) };

  async function open(width, sent) {
    tables.entries.clear(); tables.docs.clear();
    const ctx = await b.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2, isMobile: width < 600, hasTouch: width < 600 });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    await ctx.route('**/api/ai**', (rt) => rt.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' }));
    const seen = { key: 0, data: 0, tz: null };
    let keyed = false;
    await ctx.route(/\/api\/places\//, (rt) => {
      const op = new URL(rt.request().url()).pathname.split('/').pop();
      if (op === 'key') { seen.key++; keyed = true; return rt.fulfill({ contentType: 'application/json', body: JSON.stringify({ key: 'u-test.' + 'a'.repeat(48), url: 'https://healthos.example/api/places/in', setup: 'overland://setup?url=x&token=y&device_id=healthos' }) }); }
      seen.data++; seen.tz = rt.request().headers()['x-tz'];
      rt.fulfill({ contentType: 'application/json', body: JSON.stringify(sent ? { key: true, last: { at: NOW - 20 * 60_000, n: 200 }, places, points: 21000 } : { key: keyed, last: null, places: null, points: 0 }) });
    });
    const pg = await ctx.newPage();
    await pg.clock.install({ time: NOW });
    pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource|overland:/.test(m.text())) errs.push('console: ' + m.text()); });
    await pg.goto(APP);
    await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
    await pg.evaluate(([k, now, D, away]) => {
      const s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = []; s.workouts = []; s.imports = {};
      let x = 5; const r = () => { x = (x * 16807) % 2147483647; return x / 2147483647; };
      const g = () => (r() + r() + r() - 1.5) * 1.1;
      for (let i = 45; i >= 1; i--) {
        const d0 = new Date(new Date(now - i * D).setHours(0, 0, 0, 0)).getTime();
        s.entries.push({ id: 'm' + i, kind: 'feel', at: d0 + 20 * 36e5, mood: 6, energy: 6, stress: 4, focus: Math.round(Math.max(1, Math.min(10, 9 - 0.4 * away[i + 1] + g() * 0.4))) });
      }
      localStorage.setItem(k, JSON.stringify(s));
    }, [KEY, NOW, D, away]);
    await pg.goto(APP + '#settings'); await pg.reload(); await pg.waitForSelector('#bringin'); await pg.waitForTimeout(800);
    return { ctx, pg, seen };
  }
  const flat = (t) => t.replace(/\s+/g, ' ').trim();

  // control: Overland not sending yet
  let { ctx, pg, seen } = await open(1280, false);
  const card = pg.locator('#bringin');
  const t0 = flat(await card.innerText());
  check(`no air sensor anywhere (${/Aranet|CO₂|bedroom air/i.test(await pg.locator('main').innerText()) ? 'found' : 'none'})`, !/Aranet|CO₂|bedroom air/i.test(await pg.locator('main').innerText()));
  check(`Overland's three steps; nothing pulled yet (${seen.data} asks)`, /Get Overland GPS Tracker — free, open source, no account\./.test(t0) && /Set up Overland here/.test(t0) && seen.data >= 1 && await card.locator('.bi-sum').count() === 0);
  await card.getByRole('button', { name: 'Set up Overland' }).click(); await pg.waitForTimeout(500);
  const man = flat(await card.locator('.bi-manual').innerText().catch(() => ''));
  check(`a key made; the address shown to paste if Overland didn't open (${man.slice(0, 120)})`, seen.key === 1 && /Receiver endpoint https:\/\/healthos\.example\/api\/places\/in/.test(man) && /Access token u-test\.aa/.test(man));
  await ctx.close();

  ({ ctx, pg, seen } = await open(1280, true));
  const c2 = pg.locator('#bringin');
  const sum = flat(await c2.innerText());
  check(`pulled on its own, in your time zone (x-tz ${seen.tz}): last in, points, 45 days (${sum.match(/Last in:[^.]*\./)?.[0]})`, /^-?\d+$/.test(seen.tz ?? '') && /Last in: .* · 21,000 points kept \(120 days\) · 45 days worked out\./.test(sum) && /45 days of places/.test(sum));
  const kept = await pg.evaluate((k) => Object.keys(JSON.parse(localStorage.getItem(k)).imports.places.days).length, KEY);
  check(`kept in the account (${kept} days)`, kept === 45);
  const work = c2.locator('.bi-top li[data-id="23762:6347"] input');
  await work.fill('Office'); await work.blur(); await pg.waitForTimeout(200);
  check(`a place named`, await pg.evaluate((k) => JSON.parse(localStorage.getItem(k)).imports.places.names['23762:6347'], KEY) === 'Office');
  // the past from a Timeline file: days Overland has stay Overland's
  const old = { semanticSegments: [{ startTime: new Date(NOW - 80 * D).toISOString(), endTime: new Date(NOW - 80 * D + 8 * 36e5).toISOString(), visit: { topCandidate: { placeId: 'X', semanticType: 'HOME', placeLocation: { latLng: '47.49°, 19.04°' } } } }, { startTime: new Date(NOW - 80 * D + 8 * 36e5).toISOString(), endTime: new Date(NOW - 80 * D + 9 * 36e5).toISOString(), activity: { distanceMeters: 4000, topCandidate: { type: 'WALKING' } } }, { startTime: new Date(NOW - 5 * D).toISOString(), endTime: new Date(NOW - 5 * D + 20 * 36e5).toISOString(), visit: { topCandidate: { placeId: 'Y', semanticType: 'UNKNOWN', placeLocation: { latLng: '46.0°, 20.0°' } } } }] };
  await c2.getByRole('region', { name: 'The past from Google Maps' }).locator('input[type=file]').setInputFiles({ name: 'Timeline.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(old)) });
  await pg.waitForTimeout(400);
  const after = await pg.evaluate(([k, d5]) => { const p = JSON.parse(localStorage.getItem(k)).imports.places; return { n: Object.keys(p.days).length, d5: p.days[d5] }; }, [KEY, day(NOW - 5 * D)]);
  check(`the file adds the past, Overland's days kept (${after.n} days; ${JSON.stringify(after.d5)})`, after.n > 45 && after.d5.awayH === away[5]);

  await pg.goto(APP + '#insights/connections'); await pg.waitForTimeout(1500);
  const bd = pg.getByRole('region', { name: 'What makes a day' });
  await bd.waitFor({ timeout: 15000 }).catch(() => {});
  const row = bd.locator('li[data-key="away"]');
  check(`What makes a day: away from home the day before sets your best focus days apart (${flat(await row.innerText().catch(() => ''))})`, await row.getAttribute('data-says').catch(() => '') === 'strongly' && /Away from home the day before/.test(flat(await row.innerText())));
  await ctx.close();

  ({ ctx, pg } = await open(390, true));
  check(`390: fits (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
  await pg.locator('#bringin').screenshot({ path: OUT + 'places-390.png' });
  await ctx.close();
  console.log('errors: ' + JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})();
