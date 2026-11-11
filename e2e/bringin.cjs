// Bring in (PLAN 210; owner, 11 Nov: "1 love (all) - i have ios" — board R). Settings: an Aranet Home CSV (45 nights,
// day-first dates) and a Google Maps Timeline export (45 days) picked from files. Planted: the more CO₂ in the bedroom
// overnight, the lower the next day's focus (−1 per 400 ppm); places random. Known answers: 46 nights in, last night's
// average and peak; 45 days of places, home first in the top places, a name saved; Insights → What makes a day puts
// bedroom CO₂ among what sets your best focus days apart. Control: a CSV that isn't Aranet's says so and keeps nothing.
// On a phone: fits.
const { chromium, APP, OUT, handle, tables } = require('./harness.cjs');

const NOW = new Date('2026-11-11T15:00:00').getTime(), D = 864e5, KEY = 'healthos.v1:u-test';
const pad = (n) => String(n).padStart(2, '0');
const day = (t) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  let x = 17; const r = () => { x = (x * 16807) % 2147483647; return x / 2147483647; };
  const g = () => (r() + r() + r() - 1.5) * 1.1;
  // night i ends on the morning of day (NOW − i days): its CO₂ level
  const level = {}; for (let i = 45; i >= 0; i--) level[i] = Math.round(600 + r() * 1000);
  const csv = ['Time(dd/mm/yyyy),Carbon dioxide(ppm),Temperature(°C),Relative humidity(%),Atmospheric pressure(hPa)'];
  for (let t = new Date(new Date(NOW - 46 * D).setHours(20, 0, 0, 0)).getTime(); t <= new Date(new Date(NOW).setHours(9, 0, 0, 0)).getTime(); t += 600_000) {
    const d = new Date(t), h = d.getHours();
    const i = Math.max(0, Math.round((new Date(new Date(NOW).setHours(12, 0, 0, 0)) - new Date(new Date(t + (h >= 12 ? D : 0)).setHours(12, 0, 0, 0))) / D));
    const night = h >= 22 || h < 7, co2 = night ? level[i] + Math.round(g() * 40) : 480;
    csv.push(`${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(h)}:${pad(d.getMinutes())}:00,${co2},19.${Math.floor(r() * 9)},44,1013`);
  }
  const iso = (t) => new Date(t).toISOString();
  const segs = [];
  for (let i = 45; i >= 1; i--) {
    const d0 = new Date(new Date(NOW - i * D).setHours(0, 0, 0, 0)).getTime(), out = 8 + Math.floor(r() * 4) * 2;
    segs.push({ startTime: iso(d0), endTime: iso(d0 + 8 * 36e5), visit: { topCandidate: { placeId: 'HOME', semanticType: 'HOME', placeLocation: { latLng: '47.4979°, 19.0402°' } } } });
    segs.push({ startTime: iso(d0 + 8 * 36e5), endTime: iso(d0 + 8.5 * 36e5), activity: { distanceMeters: 2500, topCandidate: { type: 'WALKING' } } });
    segs.push({ startTime: iso(d0 + 8.5 * 36e5), endTime: iso(d0 + (8.5 + out / 2) * 36e5), visit: { topCandidate: { placeId: i % 3 ? 'WORK' : 'GYM', semanticType: 'UNKNOWN', placeLocation: { latLng: i % 3 ? '47.51°, 19.06°' : '47.50°, 19.08°' } } } });
    segs.push({ startTime: iso(d0 + (8.5 + out / 2) * 36e5), endTime: iso(d0 + 24 * 36e5), visit: { topCandidate: { placeId: 'HOME', semanticType: 'HOME', placeLocation: { latLng: '47.4979°, 19.0402°' } } } });
  }
  const timeline = JSON.stringify({ semanticSegments: segs });

  async function open(width) {
    tables.entries.clear(); tables.docs.clear();
    const ctx = await b.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2, isMobile: width < 600, hasTouch: width < 600 });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    await ctx.route('**/api/ai**', (rt) => rt.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' }));
    const pg = await ctx.newPage();
    await pg.clock.install({ time: NOW });
    pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
    await pg.goto(APP);
    await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
    await pg.evaluate(([k, now, D, level]) => {
      const s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = []; s.workouts = []; s.imports = {};
      let x = 5; const r = () => { x = (x * 16807) % 2147483647; return x / 2147483647; };
      const g = () => (r() + r() + r() - 1.5) * 1.1;
      for (let i = 45; i >= 1; i--) {
        const d0 = new Date(new Date(now - i * D).setHours(0, 0, 0, 0)).getTime();
        s.entries.push({ id: 'm' + i, kind: 'feel', at: d0 + 15 * 36e5, mood: 6, energy: 6, stress: 4, focus: Math.round(Math.max(1, Math.min(10, 8.5 - (level[i] - 600) / 400 + g() * 0.4))) });
      }
      localStorage.setItem(k, JSON.stringify(s));
    }, [KEY, NOW, D, level]);
    await pg.goto(APP + '#settings'); await pg.reload(); await pg.waitForSelector('#bringin');
    return { ctx, pg };
  }
  const flat = (t) => t.replace(/\s+/g, ' ').trim();

  let { ctx, pg } = await open(1280);
  const card = pg.locator('#bringin'), air = card.getByRole('region', { name: 'Bedroom air' }), pl = card.getByRole('region', { name: 'Places' });
  // control first: a CSV that isn't Aranet's
  await air.locator('input[type=file]').setInputFiles({ name: 'weights.csv', mimeType: 'text/csv', buffer: Buffer.from('name,weight\nme,80\n') });
  await pg.waitForTimeout(300);
  check(`control: not an Aranet CSV — says so, keeps nothing (${flat(await air.locator('.err').innerText().catch(() => ''))})`, /No time or CO₂ column/.test(await air.innerText()) && await air.locator('.bi-sum').count() === 0);
  await air.locator('input[type=file]').setInputFiles({ name: 'Aranet4.csv', mimeType: 'text/csv', buffer: Buffer.from(csv.join('\n')) });
  await pg.waitForTimeout(500);
  const asum = flat(await air.locator('.bi-sum').innerText().catch(() => ''));
  // 46: the 45 nights before the check-ins' days and last night's
  const avg0 = +(asum.match(/averaged (\d+) ppm/) || [])[1];
  check(`Aranet: 46 nights, last night's average near its planted level ${level[0]} (${asum})`, await air.locator('.bi-sum').getAttribute('data-nights') === '46' && Math.abs(avg0 - level[0]) <= 30 && /peaked \d+ · 19\.\d °C/.test(asum));
  await pl.locator('input[type=file]').setInputFiles({ name: 'Timeline.json', mimeType: 'application/json', buffer: Buffer.from(timeline) });
  await pg.waitForTimeout(500);
  const psum = flat(await pl.locator('.bi-sum').innerText().catch(() => ''));
  check(`Timeline: 45 days, home first in the top places (${psum})`, await pl.locator('.bi-sum').getAttribute('data-days') === '45' && await pl.locator('.bi-top li').first().getAttribute('data-id') === 'HOME' && /home ·/.test(await pl.locator('.bi-top li').first().innerText()));
  const work = pl.locator('.bi-top li[data-id="WORK"] input');
  await work.fill('Office'); await work.blur(); await pg.waitForTimeout(200);
  const kept = await pg.evaluate((k) => { const s = JSON.parse(localStorage.getItem(k)); return { name: s.imports.places.names.WORK, d: Object.values(s.imports.places.days)[3], raw: JSON.stringify(s.imports).length }; }, KEY);
  check(`a name saved; only the day's numbers kept, not the file (${kept.name} · ${JSON.stringify(kept.d)} · ${kept.raw} bytes)`, kept.name === 'Office' && typeof kept.d.awayH === 'number' && kept.raw < timeline.length / 3);
  await card.screenshot({ path: OUT + 'bringin-1280.png' });

  await pg.goto(APP + '#insights/connections'); await pg.waitForTimeout(1500);
  const bd = pg.getByRole('region', { name: 'What makes a day' });
  await bd.waitFor({ timeout: 15000 }).catch(() => {});
  const row = bd.locator('li[data-key="co2"]');
  check(`What makes a day: bedroom CO₂ sets your best focus days apart (${flat(await row.innerText().catch(() => ''))})`, await row.getAttribute('data-says').catch(() => '') === 'strongly' && /Bedroom CO₂ last night/.test(flat(await row.innerText())));
  await ctx.close();

  ({ ctx, pg } = await open(390));
  check(`390: fits (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
  await ctx.close();
  console.log('errors: ' + JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})();
