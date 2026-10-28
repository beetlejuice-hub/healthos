// The night read's numbers going stale (owner, 28 Oct: "as u can see i ate around 1900 kcal (160 left), yet ai digest says
// i ate 650 something calories...???"). Wed 28 Oct: oats and tuna by lunch (671 kcal, 58 g protein); the read-back is
// written at 21:09 from that; dinner (1,330 kcal, 30 g) is logged after it with the "Dinner · 19:00" chip — timed before
// the read, so the old "logged more since" check never fired. Now: the card says what's changed with the day's real
// numbers (the same as Today's kcal tile), "Read it again" sends the AI the new totals, and half an hour on it's written
// again by itself — once. A read from before this fix (no totals kept) is caught by its own words. Control: nothing
// logged since → no line, no extra call.
const { chromium, APP, OUT, handle, forYou } = require('./harness.cjs');

const T = (hm) => new Date(`2026-10-28T${hm}:00`).getTime(), KEY = 'healthos.v1:u-test';
const food = (id, hm, kcal, p) => ({ id, kind: 'food', at: T(hm), name: id, grams: 100, macros: { kcal, p, c: 0, f: 0 } });
const DAY = [food('Oats', '08:30', 380, 14), food('Tuna', '13:00', 291, 44)], DINNER = food('Chicken pasta', '19:00', 1330, 30);
const read = (summary) => ({ summary, happened: [], notes: '', change: [], remember: [], items: [], questions: [] });

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  async function open(at, setup) {
    const calls = [];
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    await ctx.route('**/api/ai/usage**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ usage: null, cap: 50, on: true }) }));
    await ctx.route('**/api/ai?**', (r) => {
      const body = r.request().postDataJSON(); calls.push(body);
      if (body.task !== 'night') return r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' });
      const tot = (body.context.match(/Totals, as the app counts them \(food and drinks\): ([\d,]+) kcal · P (\d+) g/) || []);
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ answer: read(`The day: ${tot[1]} kcal and ${tot[2]} g protein, against goals of 2,160 and 160.`), usage: null, costUsd: 0.02, model: 'sonnet' }) });
    });
    const pg = await ctx.newPage();
    await pg.clock.install({ time: at });
    pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    await pg.goto(APP);
    await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
    await pg.evaluate(([k, setup]) => { const s = JSON.parse(localStorage.getItem(k) || '{}'); Object.assign(s, setup.state); s.ai = { ...(s.ai || {}), ...setup.ai }; localStorage.setItem(k, JSON.stringify(s)); }, [KEY, setup]);
    await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('.t2-status');
    return { ctx, pg, calls };
  }
  const waitNight = async (calls, n) => { for (let i = 0; i < 40 && calls.filter((c) => c.task === 'night').length < n; i++) await new Promise((r) => setTimeout(r, 100)); return calls.filter((c) => c.task === 'night'); };
  const card = (pg) => pg.locator('section.night');
  const show = async (pg) => { await card(pg).waitFor({ state: 'attached', timeout: 8000 }); await forYou(pg, 'night'); await card(pg).waitFor({ timeout: 8000 }); };
  const goals = { kcal: 2160, p: 160, c: 220, f: 70 };

  // 21:00: the day so far; the read is written at 21:09
  let { ctx, pg, calls } = await open(T('21:09'), { state: { entries: DAY, goals }, ai: { night: null, digest: null } });
  let sent = await waitNight(calls, 1);
  check(`21:09: the read is written from 671 kcal, 58 g (${(sent[0]?.context.match(/Totals[^\n]*/) || [''])[0]})`, sent.length === 1 && /Totals, as the app counts them \(food and drinks\): 671 kcal · P 58 g/.test(sent[0].context));
  await show(pg);
  check('no "since then" line while it holds', await card(pg).locator('.night-stale').count() === 0);

  // dinner logged after it, with the 19:00 chip
  await pg.evaluate(([k, d]) => { const s = JSON.parse(localStorage.getItem(k)); s.entries.push(d); localStorage.setItem(k, JSON.stringify(s)); }, [KEY, DINNER]);
  await pg.clock.setFixedTime(T('21:20')); await pg.reload(); await show(pg);
  const line = (await card(pg).locator('.night-stale').innerText().catch(() => '')).replace(/\s+/g, ' ');
  const left = (await pg.locator('.t2-tile[data-card="fuel"]').first().innerText()).replace(/\s+/g, ' ');
  check(`dinner logged after it, timed 19:00: the card says so with the day's numbers (${line})`, /Written at 21:09 — since then you logged 1,330 kcal and 30 g protein\. The day now: 2,001 kcal, 88 g protein\. Read it again/.test(line));
  check(`…the same day Today's kcal tile counts (${left})`, /159/.test(left));
  check('not written again on its own before half an hour', (await waitNight(calls, 2)).length === 1);
  await card(pg).evaluate((el) => el.scrollIntoView({ block: 'center' })); await pg.waitForTimeout(100); await card(pg).screenshot({ path: OUT + 'nightstale.png' });
  await card(pg).getByRole('button', { name: 'Read it again' }).click();
  sent = await waitNight(calls, 2);
  check(`"Read it again" sends the day as it is now (${(sent[1]?.context.match(/Totals[^\n]*/) || [''])[0]})`, sent.length === 2 && /2,001 kcal · P 88 g/.test(sent[1].context) && /19:00 ate Chicken pasta \(1330 kcal, P 30 g\)/.test(sent[1].context));
  await pg.waitForFunction(() => /2,001 kcal/.test(document.querySelector('section.night .greet')?.textContent || ''));
  check('…and the new read holds: no "since then" line', await card(pg).locator('.night-stale').count() === 0);
  await ctx.close();

  // the same evening, not tapped: half an hour after it was written, it's written again by itself — once
  ({ ctx, pg, calls } = await open(T('21:45'), { state: { entries: [...DAY, DINNER], goals }, ai: { night: { ...read('Light eating day so far: 671 kcal and 58 g protein by 21:09.'), day: '2026-10-28', at: T('21:09'), tot: { kcal: 671, p: 58 } }, digest: null } }));
  sent = await waitNight(calls, 1);
  check(`21:45: rewritten by itself with the day's totals (${sent.length} call)`, sent.length === 1 && /2,001 kcal · P 88 g/.test(sent[0].context));
  await pg.waitForFunction(() => /2,001 kcal/.test(document.querySelector('section.night .greet')?.textContent || ''));
  await pg.waitForFunction((k) => JSON.parse(localStorage.getItem(k)).ai.night?.redone === 1, KEY, { timeout: 5000 }).catch(() => {});
  const st = await pg.evaluate((k) => JSON.parse(localStorage.getItem(k)).ai.night, KEY);
  check(`…kept with its totals and that it was redone (${JSON.stringify(st.tot)}, redone ${st.redone})`, st.tot.kcal === 2001 && st.tot.p === 88 && st.redone === 1);
  // more logged, an hour on: a line, but not a second rewrite by itself
  await pg.evaluate(([k, d]) => { const s = JSON.parse(localStorage.getItem(k)); s.entries.push(d); localStorage.setItem(k, JSON.stringify(s)); }, [KEY, food('Ice cream', '22:30', 400, 6)]);
  await pg.clock.setFixedTime(T('22:50')); await pg.reload(); await show(pg); await pg.waitForTimeout(800);
  check(`only once by itself: the line instead (${(await card(pg).locator('.night-stale').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 80)})`, calls.filter((c) => c.task === 'night').length === 1 && /you logged 400 kcal/.test(await card(pg).locator('.night-stale').innerText()));
  await ctx.close();

  // a read from before this fix — no totals kept — is caught by its own words (tonight's, 28 Oct)
  ({ ctx, pg, calls } = await open(T('21:20'), { state: { entries: [...DAY, DINNER], goals }, ai: { night: { ...read('Light eating day so far: 671 kcal and 58 g protein by 21:09, against goals of 2,160 and 160.'), day: '2026-10-28', at: T('21:09') }, digest: null } }));
  await show(pg);
  check(`a read from before the fix: caught by its own numbers (${(await card(pg).locator('.night-stale').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 90)})`, /since then you logged 1,330 kcal and 30 g protein/.test(await card(pg).locator('.night-stale').innerText().catch(() => '')));
  await ctx.close();

  // control: nothing logged since, an hour on — no line, no extra call
  ({ ctx, pg, calls } = await open(T('22:15'), { state: { entries: DAY, goals }, ai: { night: { ...read('Light eating day so far: 671 kcal and 58 g protein by 21:09.'), day: '2026-10-28', at: T('21:09'), tot: { kcal: 671, p: 58 } }, digest: null } }));
  await show(pg); await pg.waitForTimeout(800);
  check('control: nothing since → no line, no call', await card(pg).locator('.night-stale').count() === 0 && calls.filter((c) => c.task === 'night').length === 0);
  await ctx.close();
  console.log('errors: ' + JSON.stringify(errs)); await b.close();
})().catch((e) => { console.log('CRASH ' + e.message); process.exit(1); });
