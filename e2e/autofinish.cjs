// A workout that finishes itself (PLAN 202; owner, 10 Nov: "Workout should be finished automatically, app should detect
// when my heartrate started to come down … if its just for a couple minutes it should ask if its just a break or
// finished"). A fake band: sets at ~135, rests at ~105 (resting 55, age 30 → max 187, "working" 95).
// A — heart rate down for 8 minutes, the band live: Today asks "a break, or done?"; "A break" — the question goes and
//     the workout runs on. B — down for 20 minutes: the workout finished itself at the minute it came down, and says so
//     with Undo; Undo puts it back. Control C — sets still going: nothing asked, nothing ended. D — the Finish sheet
//     has a 1–10 for how it went, kept on the workout. 390 px fits.
const { chromium, APP, OUT, handle, tables, forYou } = require('./harness.cjs');

const MIN = 60_000, KEY = 'healthos.v1:u-test';
const NOW = new Date('2026-11-10T18:00:00').getTime();
const hm = (t) => new Date(t).toTimeString().slice(0, 5);

/** Heart rate per minute from 17:00: lifting until `endMin` minutes before NOW, then straight down under 90 and on to 75. */
function band(endMin) {
  const hr = [];
  for (let t = NOW - 60 * MIN; t <= NOW - MIN; t += MIN) {
    const m = Math.round((t - (NOW - 60 * MIN)) / MIN), end = 60 - endMin;
    const v = m < end ? (m % 3 === 0 ? 135 : 106) : Math.max(75, 88 - (m - end) * 5);
    hr.push([t, v, v - 3, v + 3]);
  }
  return hr;
}

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  async function open(endMin, hash = '#today') {
    tables.entries.clear(); tables.docs.clear(); // each scenario its own account state
    const hr = band(endMin);
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    await ctx.route('**/api/ai**', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' }));
    await ctx.route(/\/api\/band\//, (r) => {
      const u = new URL(r.request().url()), op = u.pathname.split('/').pop(), from = +u.searchParams.get('from') || 0, to = +u.searchParams.get('to') || Infinity;
      const st = { connected: true, needsReconnect: false, connectedAt: NOW - 30 * 864e5, lastSync: NOW - MIN, latest: hr.at(-1)[0], error: null, gapSec: 60 };
      const rhr = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [new Date(NOW - i * 864e5).toISOString().slice(0, 10), 55]));
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(op === 'data' ? { hr: hr.filter((m) => m[0] >= from && m[0] <= to), sleep: [], rhr, hrv: {}, steps: [], ...st } : st) });
    });
    const pg = await ctx.newPage();
    await pg.clock.install({ time: NOW });
    pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
    await pg.goto(APP);
    await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
    // an Upper A session from 17:00, its sets up to the end
    await pg.evaluate(([k, now, endMin]) => {
      const s = JSON.parse(localStorage.getItem(k) || '{}');
      s.settings = { ...s.settings, age: 30 };
      s.workouts = [{ id: 'w1', template: 'Upper A', startedAt: now - 60 * 60_000, endedAt: null, plan: [{ name: 'Bench press', sets: 12, reps: 8, restSec: 120 }] }];
      s.entries = Array.from({ length: Math.floor((60 - endMin) / 3) }, (_, i) => ({ id: `set${i}`, kind: 'set', at: now - 60 * 60_000 + (i * 3 + 1) * 60_000, workoutId: 'w1', exercise: 'Bench press', kg: 60, reps: 8 }));
      localStorage.setItem(k, JSON.stringify(s));
    }, [KEY, NOW, endMin]);
    await pg.goto(APP + hash); await pg.reload(); await pg.waitForSelector('.t2-head, .cockpit', { timeout: 15000 }).catch(() => {});
    await pg.waitForTimeout(1500);
    return { ctx, pg, w: () => pg.evaluate((k) => JSON.parse(localStorage.getItem(k)).workouts[0], KEY) };
  }
  const ask = (pg) => pg.getByRole('region', { name: 'A break, or done?' });

  // A — down 8 minutes
  let { ctx, pg, w } = await open(8);
  await ask(pg).waitFor({ timeout: 8000 }).catch(() => {});
  const t = (await ask(pg).innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(`8 minutes down, the band live: Today asks (${t})`, /^Your heart rate's been down since \d\d:\d\d — a break, or done\? A break Done$/.test(t));
  check(`390: fits (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
  await ask(pg).screenshot({ path: OUT + 'autofinish-ask.png' }).catch(() => {});
  await ask(pg).getByRole('button', { name: 'A break' }).click(); await pg.waitForTimeout(400);
  const a = await w();
  check(`"A break": the question goes, the workout runs on (endedAt ${a.endedAt}, breakAt ${a.breakAt ? hm(a.breakAt) : 'none'})`, await ask(pg).count() === 0 && a.endedAt === null && !!a.breakAt);
  await ctx.close();

  // B — down 20 minutes: finished by itself
  ({ ctx, pg, w } = await open(20));
  let bw = null; for (let i = 0; i < 30 && !(bw && bw.endedAt); i++) { bw = await w(); await pg.waitForTimeout(200); }
  const wantEnd = NOW - 20 * MIN;
  check(`20 minutes down: finished itself at the minute it came down (${bw.endedAt ? hm(bw.endedAt) : 'not ended'}, wanted about ${hm(wantEnd)}; auto ${bw.autoEnded})`, !!bw.endedAt && Math.abs(bw.endedAt - wantEnd) <= 3 * MIN && bw.autoEnded === true);
  const toast = (await pg.locator('.undo, [role="status"]').filter({ hasText: /finished at/ }).first().innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(`…and says so, with Undo (${toast})`, /Upper A finished at \d\d:\d\d — your heart rate came down/.test(toast));
  await pg.getByRole('button', { name: 'Undo' }).click({ timeout: 3000 }).catch(() => {}); await pg.waitForTimeout(500);
  const u = await w();
  check(`Undo: running again (endedAt ${u.endedAt}), not ended again for that drop`, u.endedAt === null);
  // finished by itself, it has no 1–10: For you asks
  await pg.evaluate(([k, at]) => { const s = JSON.parse(localStorage.getItem(k)); s.workouts[0] = { ...s.workouts[0], endedAt: at, autoEnded: true }; localStorage.setItem(k, JSON.stringify(s)); }, [KEY, NOW - 20 * MIN]);
  await pg.reload(); await pg.waitForSelector('.t2-head'); await pg.waitForTimeout(600);
  await forYou(pg, 'rateworkout');
  const rate = pg.getByRole('region', { name: 'How the workout went' });
  check(`finished by itself: For you asks how it went (${(await rate.innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 80)})`, /Upper A 17:00–17:40 · finished by itself/i.test((await rate.innerText().catch(() => '')).replace(/\s+/g, ' ')));
  await ctx.close();

  // C — control: still lifting
  ({ ctx, pg, w } = await open(0));
  await pg.waitForTimeout(1000);
  const cw = await w();
  check(`control: sets still going — nothing asked, nothing ended (${await ask(pg).count()} asks, endedAt ${cw.endedAt})`, await ask(pg).count() === 0 && cw.endedAt === null);
  await ctx.close();

  // D — the Finish sheet's 1–10
  ({ ctx, pg, w } = await open(0, '#workout'));
  await pg.getByRole('button', { name: /Finish (workout|early)/ }).click(); await pg.waitForTimeout(300);
  const slider = pg.getByRole('slider', { name: /How did it go/ });
  check('the Finish sheet asks how it went, 1–10', await slider.count() === 1);
  await slider.focus(); for (let i = 0; i < 8; i++) await pg.keyboard.press('ArrowRight'); await pg.waitForTimeout(200);
  const r = (await w()).rating;
  check(`…kept on the workout (${r})`, typeof r === 'number' && r >= 1 && r <= 10);
  await pg.locator('.cockpit').screenshot({ path: OUT + 'autofinish-rating.png' }).catch(() => {});
  await ctx.close();

  console.log('errors: ' + JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH ' + e.message); process.exit(1); });
