// Body watch (PLAN 210; owner, 11 Nov: "1 love (all)" — the illness early warning, board P). 150 mornings from the band:
// ordinary noise, three earlier episodes (resting heart rate +7, HRV −25 %, skin +0.7 °C, two mornings each), each
// followed by a check-in — two saying ill (the body word, a note "flu"), one the morning after a night out with nothing —
// and one starting yesterday. Today: the card with 3 of 5 off, the 2nd morning, each against your usual, and the track
// record: 3 times before, twice ill, once after a night out. Not a diagnosis; no "you should". Control: the same band
// without today's episode — no body watch card. On a phone: fits.
const { chromium, APP, OUT, handle, tables } = require('./harness.cjs');

const NOW = new Date('2026-11-11T09:00:00').getTime(), D = 864e5, KEY = 'healthos.v1:u-test', MIN = 60_000;
const day = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const EPIS = [100, 70, 40];
  function band(today) {
    let x = 13; const r = () => { x = (x * 16807) % 2147483647; return x / 2147483647; };
    const g = () => (r() + r() + r() - 1.5) * 1.1;
    const o = { rhr: {}, hrv: {}, skin: {}, breath: {}, spo2: {} };
    const sick = new Set([...EPIS.flatMap((i) => [i, i - 1]), ...(today ? [1, 0] : [])]);
    for (let i = 150; i >= 0; i--) {
      const d = day(NOW - i * D), s = sick.has(i);
      o.rhr[d] = Math.round(55 + g() * 1.1 + (s ? 7 : 0)); o.hrv[d] = Math.round(60 * Math.exp(g() * 0.07) * (s ? 0.75 : 1));
      o.skin[d] = +(33.8 + g() * 0.13 + (s ? 0.7 : 0)).toFixed(2); o.breath[d] = +(14 + g() * 0.25).toFixed(1); o.spo2[d] = +(96 + g() * 0.35).toFixed(1);
    }
    return o;
  }
  async function open(width, today) {
    tables.entries.clear(); tables.docs.clear();
    const ctx = await b.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2, isMobile: width < 600, hasTouch: width < 600 });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    await ctx.route('**/api/ai**', (rt) => rt.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' }));
    const w = band(today);
    await ctx.route(/\/api\/band\//, (rt) => {
      const op = new URL(rt.request().url()).pathname.split('/').pop();
      const st = { connected: true, needsReconnect: false, connectedAt: NOW - 200 * D, lastSync: NOW - MIN, latest: NOW - 2 * MIN, error: null, gapSec: 60 };
      rt.fulfill({ contentType: 'application/json', body: JSON.stringify(op === 'data' ? { hr: [], steps: [], sleep: [], ...w, ...st } : st) });
    });
    const pg = await ctx.newPage();
    await pg.clock.install({ time: NOW });
    pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
    await pg.goto(APP);
    await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
    await pg.evaluate(([k, now, D, EPIS]) => {
      const s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = []; s.workouts = [];
      const noon = (i) => new Date(new Date(now - i * D).setHours(12, 0, 0, 0)).getTime();
      s.entries.push({ id: 'i1', kind: 'feel', at: noon(EPIS[0] - 1), mood: 4, energy: 3, stress: 5, body: { sick: 2 } });
      s.entries.push({ id: 'i2', kind: 'feel', at: noon(EPIS[1] - 2), mood: 4, energy: 3, stress: 5, note: 'think I have the flu' });
      for (let k = 0; k < 4; k++) s.entries.push({ id: 'o' + k, kind: 'drink', at: noon(EPIS[2] + 1) + (8 + k) * 36e5, name: 'Beer', ml: 500, caffeineMg: 0, alcoholG: 20, kcal: 200 });
      s.entries.push({ id: 'f', kind: 'food', at: noon(EPIS[2] + 1), name: 'Lunch', grams: 400, macros: { kcal: 800, p: 40, c: 90, f: 30 } });
      localStorage.setItem(k, JSON.stringify(s));
    }, [KEY, NOW, D, EPIS]);
    await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('#feel');
    await pg.waitForTimeout(1200);
    return { ctx, pg };
  }
  const flat = (t) => t.replace(/\s+/g, ' ').trim();

  let { ctx, pg } = await open(1280, true);
  const bw = pg.getByRole('region', { name: 'Body watch' });
  await bw.waitFor({ timeout: 15000 }).catch(() => {});
  const t = flat(await bw.innerText().catch(() => ''));
  check(`the card: 3 of 5 off, 2nd morning (${t.slice(0, 160)})`, await bw.getAttribute('data-off') === '3' && /3 of 5 off · 2nd morning/i.test(t) && /Your body looks like it's working on something — resting heart rate, HRV and skin temperature are off your usual, 2 mornings running\./.test(t));
  const off = await bw.locator('li.off').evaluateAll((l) => l.map((e) => e.dataset.id).sort().join(','));
  check(`marked off: resting heart rate, HRV, skin (${off}); breathing, oxygen usual`, off === 'hrv,rhr,skin' && /Breathing usual/.test(t) && /Blood oxygen usual/.test(t));
  check(`your own track record (${flat(await bw.locator('.bw-track').innerText().catch(() => ''))})`, /This pattern showed up 3 times before\. Twice you logged feeling ill within 2 days; once it came the morning after a night out\./.test(t));
  check(`not a diagnosis, nothing to do`, /Not a diagnosis/.test(t) && !/you should|take it easy|rest today/i.test(t));
  await bw.screenshot({ path: OUT + 'bodywatch-1280.png' });
  await ctx.close();

  ({ ctx, pg } = await open(1280, false));
  check(`control: no episode today — no body watch card`, await pg.getByRole('region', { name: 'Body watch' }).count() === 0);
  await ctx.close();

  ({ ctx, pg } = await open(390, true));
  await pg.getByRole('region', { name: 'Body watch' }).waitFor({ timeout: 15000 }).catch(() => {});
  check(`390: fits (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
  await pg.getByRole('region', { name: 'Body watch' }).screenshot({ path: OUT + 'bodywatch-390.png' }).catch(() => {});
  await ctx.close();
  console.log('errors: ' + JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})();
