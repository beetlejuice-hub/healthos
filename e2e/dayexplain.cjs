// Why today, what makes a day, the day lines, ripples (PLAN 208; owner, 11 Nov: "yea lets do this 4"). 120 days planted:
// each drink the evening before goes with focus 1 lower and the morning's HRV 4 ms lower; a training day goes with mood
// 0.8 higher the next day; 3 drinks yesterday. Today: "Why today" — drinks pull focus down, below your usual; mood picks
// training. Insights → Findings: "Your best focus days: no drinks…", the drinks row furthest apart; the day lines; the
// ripple of a night out — HRV clearly down at +1. A control: protein, random, reads "alike". On a phone: fits.
const { chromium, APP, OUT, handle, tables } = require('./harness.cjs');

const NOW = new Date('2026-11-11T15:00:00').getTime(), D = 864e5, KEY = 'healthos.v1:u-test', MIN = 60_000;
const day = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  // the world, the same in the page and the band: drinks[i] = drinks the evening of day i (i days ago); today's from yesterday is 3
  let x = 5; const r = () => { x = (x * 16807) % 2147483647; return x / 2147483647; };
  const g = () => (r() + r() + r() - 1.5) * 1.1;
  const drinks = {}, trained = {};
  for (let i = 121; i >= 1; i--) { drinks[i] = i === 1 ? 3 : Math.floor(r() * 4); trained[i] = r() < 0.4; }
  const hrv = {};
  for (let i = 120; i >= 0; i--) hrv[day(NOW - i * D)] = Math.round(58 + g() * 2.5 - 4 * drinks[i + 1]);
  const world = { drinks, trained, noise: Array.from({ length: 130 }, () => [g(), g(), g(), r()]) };
  async function open(width) {
    tables.entries.clear(); tables.docs.clear();
    const ctx = await b.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2, isMobile: width < 600, hasTouch: width < 600 });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    await ctx.route('**/api/ai**', (rt) => rt.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' }));
    await ctx.route(/\/api\/band\//, (rt) => {
      const op = new URL(rt.request().url()).pathname.split('/').pop();
      const st = { connected: true, needsReconnect: false, connectedAt: NOW - 200 * D, lastSync: NOW - MIN, latest: NOW - 2 * MIN, error: null, gapSec: 60 };
      rt.fulfill({ contentType: 'application/json', body: JSON.stringify(op === 'data' ? { hr: [], steps: [], sleep: [], rhr: {}, hrv, ...st } : st) });
    });
    const pg = await ctx.newPage();
    await pg.clock.install({ time: NOW });
    pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
    await pg.goto(APP);
    await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  await pg.evaluate(() => localStorage.setItem('healthos.ui.tmore', '1')); await pg.reload(); await pg.waitForSelector('nav.tabs'); // Today's \"More about today\", open
    await pg.evaluate(([k, now, D, w]) => {
      const s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = []; s.workouts = []; s.supplements = []; s.scout = {};
      for (let i = 121; i >= 1; i--) {
        const day0 = new Date(new Date(now - i * D).setHours(0, 0, 0, 0)).getTime(), [a, bb, c, u] = w.noise[i];
        // how day i went, from the evening and day before it (i + 1)
        if (i <= 120) s.entries.push({ id: 'm' + i, kind: 'feel', at: day0 + 15 * 36e5, mood: Math.round(Math.max(1, Math.min(10, 6 + (w.trained[i + 1] ? 0.8 : 0) + a * 0.5))), energy: Math.round(6 + bb * 0.8), stress: 4,
          focus: Math.round(Math.max(1, Math.min(10, 8 - 1.0 * w.drinks[i + 1] + c * 0.5))) });
        s.entries.push({ id: 'f' + i, kind: 'food', at: day0 + 13 * 36e5, name: 'Lunch', grams: 500, macros: { kcal: 2200, p: Math.round(110 + u * 60), c: 250, f: 70 } });
        for (let k = 0; k < w.drinks[i]; k++) s.entries.push({ id: `b${i}-${k}`, kind: 'drink', at: day0 + (20 + k) * 36e5, name: 'Wine', ml: 150, caffeineMg: 0, alcoholG: 14, kcal: 120 });
        if (w.trained[i]) s.workouts.push({ id: 't' + i, template: 'Upper', startedAt: day0 + 10 * 36e5, endedAt: day0 + 11 * 36e5 });
      }
      s.ai = { ...(s.ai || {}), digest: { day: '2026-11-11', at: now, greeting: 'Hi.', items: [] }, night: null, chat: [], experiments: [], researched: [] };
      localStorage.setItem(k, JSON.stringify(s));
    }, [KEY, NOW, D, world]);
    await pg.reload();
    await pg.waitForTimeout(1200);
    return { ctx, pg };
  }
  const flat = (t) => t.replace(/\s+/g, ' ').trim();

  let { ctx, pg } = await open(1280);
  const why = pg.getByRole('region', { name: 'Why today' });
  await why.waitFor({ timeout: 15000 }).catch(() => {});
  const wt = flat(await why.innerText().catch(() => ''));
  const exp = +(await why.getAttribute('data-expected').catch(() => 'NaN')), usual = +(wt.match(/Your usual focus ([\d.]+)/i) || [])[1];
  check(`Why today: drinks pulled focus down (${wt.slice(0, 140)})`, /3 drinks[^.;]*pulled it down/i.test(wt) && await why.locator('li[data-key="drinks"] b.down').count() === 1);
  check(`below your usual (${exp} < ${usual})`, exp < usual - 1);
  await why.getByRole('button', { name: 'Mood' }).click(); await pg.waitForTimeout(300);
  check(`mood: training the day before is a push (${flat(await why.innerText()).slice(0, 120)})`, await why.getAttribute('data-outcome') === 'mood' && await why.locator('li[data-key="trained"]').count() === 1);
  await why.screenshot({ path: OUT + 'whytoday-1280.png' });

  await pg.goto(APP + '#insights/connections'); await pg.waitForTimeout(1200);
  const bd = pg.getByRole('region', { name: 'What makes a day' });
  await bd.waitFor({ timeout: 15000 }).catch(() => {});
  const say = flat(await bd.locator('.bd-say').innerText().catch(() => ''));
  check(`the sentence (${say})`, /^Your best focus days: no drinks/.test(say) && /Your worst: [23](\.\d)? drinks/.test(say));
  check(`drinks furthest apart, "far apart" (${await bd.locator('.bd-rows li').first().getAttribute('data-key').catch(() => '')})`, await bd.locator('.bd-rows li').first().getAttribute('data-key') === 'drinks' && await bd.locator('.bd-rows li').first().getAttribute('data-says') === 'strongly');
  check(`control: protein reads alike (${await bd.locator('li[data-key="protein"]').getAttribute('data-says').catch(() => 'none')})`, await bd.locator('li[data-key="protein"]').getAttribute('data-says') === 'not');
  await bd.screenshot({ path: OUT + 'bestdays-1280.png' });
  await bd.getByRole('button', { name: 'Day lines' }).click(); await pg.waitForTimeout(300);
  const lines = await bd.locator('.bd-l').count();
  check(`day lines: a line a rated day, the two middle days thick (${lines}, ${await bd.locator('.bd-mid').count()})`, lines >= 110 && lines <= 121 && await bd.locator('.bd-mid').count() === 2);
  await bd.screenshot({ path: OUT + 'daylines-1280.png' });

  const rp = pg.getByRole('region', { name: 'Ripples' });
  const hp = rp.locator('[data-measure="hrv"]');
  check(`ripples: a night out first (${await rp.getAttribute('data-event').catch(() => '')})`, await rp.getAttribute('data-event') === 'out');
  const hcap = flat(await hp.locator('figcaption').innerText().catch(() => ''));
  check(`HRV clearly down at +1 (${hcap})`, await hp.getAttribute('data-clear') === 'true' && /−([5-9]|1[0-9])(\.\d)? ms at \+1/.test(hcap) && /worse/.test(await hp.getAttribute('class')));
  check(`thin line each, one mean (${await hp.locator('.rp-thin').count()})`, await hp.locator('.rp-thin').count() >= 15 && await hp.locator('.rp-mean').count() === 1);
  await rp.screenshot({ path: OUT + 'ripples-1280.png' });
  await ctx.close();

  ({ ctx, pg } = await open(390));
  await pg.getByRole('region', { name: 'Why today' }).waitFor({ timeout: 15000 }).catch(() => {});
  check(`390 Today: fits (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
  await pg.getByRole('region', { name: 'Why today' }).screenshot({ path: OUT + 'whytoday-390.png' });
  await pg.goto(APP + '#insights/connections'); await pg.waitForTimeout(1200);
  check(`390 Findings: fits (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
  await pg.getByRole('region', { name: 'What makes a day' }).screenshot({ path: OUT + 'bestdays-390.png' });
  await ctx.close();
  console.log('errors: ' + JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})();
