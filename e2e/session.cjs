// A past session, opened (PLAN 216; owner, 13 Nov: "on the latest workout session i should be able to open it, change
// times, when it ended, and just look at what i did … i didnt end the cardio session and not sure when the app decided
// that its over" · "and should be able to add comment"). Yesterday: an incline walk from 18:00 the app ended itself —
// heart rate last at working level 18:41, noticed at 21:05 — and an Upper A that ended an hour after its last set.
// Workout → Recent: both marked; the walk opens: how it ended in words, the heart rate with the working line and the end;
// its end moved to 18:30 → kept, and said ("You set the end to 18:30. Before that: …"); a comment saved and shown on the
// list. Upper A: its sets. Control: one you finished yourself says so. On a phone: fits.
const { chromium, APP, OUT, handle, tables } = require('./harness.cjs');

const NOW = new Date('2026-11-13T10:00:00').getTime(), D = 864e5, KEY = 'healthos.v1:u-test', MIN = 60_000;
const at = (h, m = 0) => new Date(new Date(NOW - D).setHours(h, m, 0, 0)).getTime();

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const hr = []; for (let t = at(17, 40); t <= at(19, 30); t += MIN) hr.push([t, t >= at(18) && t < at(18, 42) ? 125 : 72, 70, 130]);
  const rhr = {}; for (let i = 14; i >= 0; i--) { const d = new Date(NOW - i * D); rhr[`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`] = 55; }
  async function open(width) {
    tables.entries.clear(); tables.docs.clear();
    const ctx = await b.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2, isMobile: width < 600, hasTouch: width < 600 });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    await ctx.route('**/api/ai**', (rt) => rt.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' }));
    await ctx.route(/\/api\/band\//, (rt) => {
      const op = new URL(rt.request().url()).pathname.split('/').pop();
      const st = { connected: true, needsReconnect: false, connectedAt: NOW - 60 * D, lastSync: NOW - MIN, latest: NOW - 2 * MIN, error: null, gapSec: 60 };
      rt.fulfill({ contentType: 'application/json', body: JSON.stringify(op === 'data' ? { hr, steps: [], sleep: [], rhr, hrv: {}, ...st } : st) });
    });
    const pg = await ctx.newPage();
    await pg.clock.install({ time: NOW });
    pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
    await pg.goto(APP);
    await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
    await pg.evaluate(([k, t]) => {
      const s = JSON.parse(localStorage.getItem(k) || '{}');
      s.settings = { ...(s.settings || {}), maxHr: 190 };
      s.workouts = [
        { id: 'up', template: 'Upper A', startedAt: t.u0, endedAt: t.uEnd },
        { id: 'own', template: 'Cardio', kind: 'cardio', startedAt: t.o0, endedAt: t.o1, cardio: { what: 'Bike', startedAt: t.o0, done: true, at: t.o1 } },
        { id: 'walk', template: 'Cardio', kind: 'cardio', startedAt: t.w0, endedAt: t.w1, autoEnded: true, ended: { by: 'heart', noticed: t.seen, line: 96 }, cardio: { what: 'Incline walk', startedAt: t.w0, done: true, at: t.w1 } },
      ];
      s.entries = [0, 1, 2].map((i) => ({ id: 'b' + i, kind: 'set', at: t.u0 + (5 + i * 3) * 60000, workoutId: 'up', exercise: 'Bench press', kg: 60, reps: 8 }));
      localStorage.setItem(k, JSON.stringify(s));
    }, [KEY, { u0: at(9), uEnd: at(9, 13), o0: at(12), o1: at(12, 30), w0: at(18), w1: at(18, 42), seen: at(21, 5) }]);
    await pg.goto(APP + '#workout'); await pg.reload(); await pg.waitForSelector('.cockpit'); await pg.waitForTimeout(800);
    return { ctx, pg };
  }
  const flat = (t) => t.replace(/\s+/g, ' ').trim();

  let { ctx, pg } = await open(1280);
  const row = (id) => pg.locator(`.rec-open[data-id="${id}"]`);
  check(`Recent: the walk and Upper A marked "ended by itself"; your bike not`, /ended by itself/.test(await row('walk').innerText()) && !/ended by itself/.test(await row('own').innerText()));
  await row('walk').click(); await pg.waitForTimeout(400);
  const sh = pg.getByRole('dialog');
  const why = flat(await sh.locator('.ss-end-why').innerText().catch(() => ''));
  check(`how it ended, in words (${why})`, /^How it ended Ended by itself: your heart rate was last at working level \(96 bpm or more\) at 18:41\. After 15 minutes under it, the app counted the session over from 18:42\. The app noticed at 21:05 — it checks only while it's open, then sets the end back to when it happened\.$/i.test(why));
  check(`the heart rate with the working line and the end (${await sh.locator('.ss-hr svg').getAttribute('aria-label').catch(() => '')})`, await sh.locator('.ss-hrl').count() === 1 && await sh.locator('.ss-line').count() === 1 && /ended 18:42/.test(await sh.locator('.ss-hr').innerText()));
  await sh.screenshot({ path: OUT + 'session-1280.png' });
  await sh.locator('input[type=time]').nth(1).fill('18:30');
  await sh.getByRole('button', { name: 'Save times' }).click(); await pg.waitForTimeout(300);
  const kept = await pg.evaluate((k) => JSON.parse(localStorage.getItem(k)).workouts.find((w) => w.id === 'walk'), KEY);
  const why2 = flat(await sh.locator('.ss-end-why').innerText());
  check(`the end moved to 18:30 — kept, and said (${why2.slice(0, 90)})`, kept.endedAt === at(18, 30) && kept.ended.was === at(18, 42) && kept.cardio.at === at(18, 30) && /You set the end to 18:30\. Before that: ended by itself: your heart rate was last at working level \(96 bpm or more\) at 18:41/.test(why2));
  await sh.getByRole('textbox', { name: /Comment/ }).fill('legs heavy, stopped early'); await sh.getByRole('textbox', { name: /Comment/ }).blur(); await pg.waitForTimeout(200);
  await sh.getByRole('button', { name: 'Close' }).click(); await pg.waitForTimeout(200);
  check(`the comment saved and shown on the list`, /“legs heavy, stopped early”/.test(await row('walk').innerText()));
  await row('up').click(); await pg.waitForTimeout(300);
  const up = flat(await pg.getByRole('dialog').innerText());
  check(`Upper A: its sets, how it ended (${up.slice(0, 160)})`, /Bench press 60 × 8 · 60 × 8 · 60 × 8/.test(up) && /no set for an hour, so it ended 2 minutes after your last one \(09:11\), at 09:13/.test(up));
  await pg.getByRole('button', { name: 'Close' }).click(); await pg.waitForTimeout(200);
  await row('own').click(); await pg.waitForTimeout(300);
  check(`control: one you finished yourself says so`, /You finished it at 12:30\./.test(await pg.getByRole('dialog').innerText()));
  await ctx.close();

  ({ ctx, pg } = await open(390));
  await pg.locator('.rec-open[data-id="walk"]').click(); await pg.waitForTimeout(400);
  check(`390: fits (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
  await pg.getByRole('dialog').screenshot({ path: OUT + 'session-390.png' });
  await ctx.close();
  console.log('errors: ' + JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})();
