// Two things together, and new in your data (PLAN 209; owner, 11 Nov: "3, 4"). 120 days planted: a drink the evening
// before costs focus 0.5, late coffee 0.5, and the two together 1.5 more (worse together); training does nothing to focus
// (the control: it adds up). Five nights out (4 drinks) — three before a week ago, two in the last week — each followed by
// HRV 10 ms lower: too few to say a week ago, clear now. Findings: "Drinks and late caffeine together: focus … lower than
// the two alone would add up to", the 2×2 with both outlined; drinks × trained in "the rest". AI tab: "New in your data"
// — the night out's HRV, no AI asked; tapping it opens Findings. On a phone: fits.
const { chromium, APP, OUT, handle, tables } = require('./harness.cjs');

const NOW = new Date('2026-11-11T15:00:00').getTime(), D = 864e5, KEY = 'healthos.v1:u-test', MIN = 60_000;
const day = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

(async () => {
  const b = await chromium.launch(); const errs = []; let aiCalls = 0;
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  let x = 9; const r = () => { x = (x * 16807) % 2147483647; return x / 2147483647; };
  const g = () => (r() + r() + r() - 1.5) * 1.1;
  // i days ago: drinks / late coffee / trained that day; nights out on these
  const OUTS = new Set([40, 30, 20, 6, 4]), w = { drink: {}, caf: {}, trained: {}, out: {}, n: {} };
  for (let i = 121; i >= 1; i--) { w.out[i] = OUTS.has(i); w.drink[i] = w.out[i] || r() < 0.4; w.caf[i] = r() < 0.4; w.trained[i] = r() < 0.4; w.n[i] = g(); }
  const hrv = {};
  for (let i = 120; i >= 0; i--) hrv[day(NOW - i * D)] = Math.round(60 + g() * 2 - (w.out[i + 1] ? 10 : 0));
  async function open(width) {
    tables.entries.clear(); tables.docs.clear();
    const ctx = await b.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2, isMobile: width < 600, hasTouch: width < 600 });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    await ctx.route('**/api/ai**', (rt) => { aiCalls++; rt.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' }); });
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
    await pg.evaluate(([k, now, D, w]) => {
      const s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = []; s.workouts = []; s.supplements = []; s.scout = {};
      for (let i = 121; i >= 1; i--) {
        const day0 = new Date(new Date(now - i * D).setHours(0, 0, 0, 0)).getTime(), p = i + 1;
        if (i <= 120) s.entries.push({ id: 'm' + i, kind: 'feel', at: day0 + 12 * 36e5, mood: 6, energy: 6, stress: 4,
          focus: Math.round(Math.max(1, Math.min(10, 7.5 - 0.5 * w.drink[p] - 0.5 * w.caf[p] - 1.5 * (w.drink[p] && w.caf[p]) + w.n[i] * 0.5))) });
        s.entries.push({ id: 'f' + i, kind: 'food', at: day0 + 13 * 36e5, name: 'Lunch', grams: 500, macros: { kcal: 2200, p: 140, c: 250, f: 70 } });
        if (w.caf[i]) s.entries.push({ id: 'c' + i, kind: 'drink', at: day0 + 16 * 36e5, name: 'Coffee', ml: 200, caffeineMg: 120, alcoholG: 0, kcal: 5 });
        for (let k = 0; k < (w.out[i] ? 4 : w.drink[i] ? 1 : 0); k++) s.entries.push({ id: `b${i}-${k}`, kind: 'drink', at: day0 + (20 + k * 0.5) * 36e5, name: 'Wine', ml: 150, caffeineMg: 0, alcoholG: 14, kcal: 120 });
        if (w.trained[i]) s.workouts.push({ id: 't' + i, template: 'Upper', startedAt: day0 + 10 * 36e5, endedAt: day0 + 11 * 36e5 });
      }
      s.ai = { ...(s.ai || {}), digest: { day: '2026-11-11', at: now, greeting: 'Hi.', items: [] }, night: null, chat: [], experiments: [], researched: [] };
      localStorage.setItem(k, JSON.stringify(s));
    }, [KEY, NOW, D, w]);
    await pg.goto(APP + '#insights/connections'); await pg.reload();
    await pg.waitForTimeout(1200);
    return { ctx, pg };
  }
  const flat = (t) => t.replace(/\s+/g, ' ').trim();

  let { ctx, pg } = await open(1280);
  const cb = pg.getByRole('region', { name: 'Two things together' });
  await cb.waitFor({ timeout: 15000 }).catch(() => {});
  const say = flat(await cb.locator('.cb-say').innerText().catch(() => ''));
  check(`the sentence leads with the planted pair (${say})`, /^Drinks and late caffeine together: focus \d\.\d — 1\.\d lower than the two alone would add up to \(\d\.\d\)\./.test(say));
  const p = cb.locator('li.pb').first();
  check(`first row: drinks + late caffeine, worse together (${await p.getAttribute('data-pair').catch(() => '')} · ${await p.getAttribute('data-verdict').catch(() => '')})`, await p.getAttribute('data-pair') === 'drinks:lateCaf' && await p.getAttribute('data-verdict') === 'worse together');
  check(`its bars: both red, below the tick (${flat(await p.locator('.pb-row.both').innerText().catch(() => ''))})`, await p.locator('.pb-row.both .pb-track i.bad').count() === 1 && await p.locator('.pb-row.both em').count() === 1 && /both \d+ d −[12]\.\d/.test(flat(await p.locator('.pb-row.both').innerText())));
  const worst = cb.locator('.cb-st.bad'), wt = flat(await worst.innerText().catch(() => ''));
  check(`your worst pair, which half, and a fix (${wt})`, await worst.getAttribute('data-pair') === 'drinks:lateCaf' && /^Your worst pair Drinks \+ late caffeine: focus −\d\.\d against a day with neither \(\d+ days\)\. /i.test(wt) && /Fix: /.test(wt));
  await cb.getByRole('button', { name: /See all \d+ pairs/ }).click(); await pg.waitForTimeout(200);
  check(`control: drinks + trained adds up, in the full list`, await cb.locator('li[data-pair="drinks:trained"]').getAttribute('data-verdict') === 'adds up');
  check(`what it's for, with the colours`, /The bars show your focus against a day with neither: green a better day, red a worse one\./.test(flat(await cb.locator('.cb-what').innerText())));
  await cb.screenshot({ path: OUT + 'combos-1280.png' });
  // nothing planted for mood: says so, no stand-outs
  await cb.getByRole('button', { name: 'Mood' }).click(); await pg.waitForTimeout(300);
  const none = flat(await cb.locator('.cb-say').innerText().catch(() => ''));
  check(`mood (nothing planted): no pair stands out (${none.slice(0, 90)})`, /^No pair is clearly worse \(or better\) together than its two halves for mood yet — \d+ checked\./.test(none) && await cb.locator('.cb-st').count() === 0);
  await cb.screenshot({ path: OUT + 'combos-none-1280.png' });
  await cb.getByRole('button', { name: 'Focus' }).click(); await pg.waitForTimeout(300);

  await pg.goto(APP + '#ai'); await pg.waitForTimeout(1200);
  const nd = pg.getByRole('region', { name: 'New in your data' });
  await nd.waitFor({ timeout: 15000 }).catch(() => {});
  const item = nd.locator('li[data-key="ripple:out:hrv"]');
  check(`AI tab: the night out's HRV dip is new (${flat(await item.innerText().catch(() => ''))})`, await item.getAttribute('data-kind') === 'New' && /After a night out, HRV −\d+(\.\d)? ms at \+1 \(from 5\) — clear now\./.test(await item.innerText()));
  check(`worked out with every AI call failing (${aiCalls} AI calls, all 500)`, aiCalls >= 0 && await nd.isVisible());
  await nd.screenshot({ path: OUT + 'newdata-1280.png' });
  await item.locator('a').click(); await pg.waitForTimeout(1500);
  check(`tapping it opens Findings (${await pg.evaluate(() => location.hash)})`, (await pg.evaluate(() => location.hash)) === '#insights/connections' && await pg.getByRole('region', { name: 'Ripples' }).isVisible());
  await ctx.close();

  ({ ctx, pg } = await open(390));
  await pg.getByRole('region', { name: 'Two things together' }).waitFor({ timeout: 15000 }).catch(() => {});
  check(`390 Findings: fits (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
  await pg.getByRole('region', { name: 'Two things together' }).screenshot({ path: OUT + 'combos-390.png' });
  await pg.goto(APP + '#ai'); await pg.waitForTimeout(1200);
  check(`390 AI tab: fits (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
  await pg.getByRole('region', { name: 'New in your data' }).screenshot({ path: OUT + 'newdata-390.png' }).catch(() => {});
  await ctx.close();
  console.log('errors: ' + JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})();
