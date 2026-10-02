// A "why?" note on a check-in, and the nightly read-back that takes it seriously (owner, 2 Oct).
// Fake /api/ai: no credits spent; we check what the AI was sent, and what the app shows.
const { chromium, APP, OUT, handle, rate } = require('./harness.cjs');
const calls = [];
const NIGHT = { summary: 'A steady day with one spike: stress hit 8 at 14:00, right when the deadline you wrote about landed.', happened: ['Coffee at 08:10, nothing after', 'Check-in at 14:00: mood 4, stress 8'], notes: 'You said the stress was the deadline at work — the 8 fits that, and nothing else in your log points elsewhere.', change: [{ what: 'A 10-minute walk before the next deadline block.', why: 'Your stress tends to ease after time outside.' }] };
const ANSWERS = { night: () => NIGHT, digest: () => ({ greeting: 'Hi', items: [] }), questions: () => ({ questions: [] }) };

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  await ctx.route('**/api/ai/usage**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ usage: null, cap: 50, on: true }) }));
  await ctx.route('**/api/ai?**', (r) => { const body = r.request().postDataJSON(); calls.push(body); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ answer: ANSWERS[body.task](body), usage: null, costUsd: 0.02, model: 'opus' }) }); });
  const pg = await ctx.newPage();
  await pg.clock.install({ time: new Date(2026, 9, 1, 14, 0) });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  const local = () => pg.evaluate(() => JSON.parse(localStorage.getItem('healthos.v1:u-test') || '{}'));
  await pg.evaluate(() => { const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = [{ id: 'c1', kind: 'drink', at: new Date(2026, 9, 1, 8, 10).getTime(), name: 'Coffee', ml: 250, caffeineMg: 95, alcoholG: 0, kcal: 2 }]; localStorage.setItem(k, JSON.stringify(s)); });
  await pg.reload(); await pg.waitForSelector('text=Settings');

  // 14:00 — rate, then say why.
  await rate(pg, 'mood', 4);
  await rate(pg, 'stress', 8); await pg.waitForTimeout(150);
  const note = pg.getByLabel('Why? A note on this check-in');
  check('after rating: an optional "Why?" field', await note.count() === 1);
  await note.fill('deadline at work'); await note.press('Enter'); await pg.waitForTimeout(200);
  const feel = ((await local()).entries || []).find((e) => e.kind === 'feel');
  check('the note is saved on the check-in', feel && feel.note === 'deadline at work' && feel.stress === 8);
  await pg.screenshot({ path: OUT + 'night-note.png' });
  await pg.goto(APP + '#log/food'); await pg.waitForTimeout(150);
  check('the log shows it', /mood 4 · stress 8 — “deadline at work”/.test(await pg.locator('text=Logged today').locator('..').innerText()));
  check('no read-back before 21:00', !calls.some((c) => c.task === 'night'));

  // 21:30 — the day is read back.
  await pg.clock.setFixedTime(new Date(2026, 9, 1, 21, 30)); await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('text=Settings'); await pg.waitForTimeout(500);
  const sent = calls.filter((c) => c.task === 'night');
  check('one read-back asked for, for today', sent.length === 1 && sent[0].day === '2026-10-01');
  check('the AI gets the day in order, the note quoted exactly', /## Today, as it happened \(2026-10-01\)[\s\S]*08:10 drank Coffee[\s\S]*14:00 check-in: mood 4, stress 8 · my note: "deadline at work"/.test(sent[0].context));
  check('…and the notes marked as the user\'s own reasons', /## Why I felt that way \(my own notes on check-ins — take these seriously\)/.test(sent[0].context));
  const card = pg.getByLabel('Your day, read back');
  const txt = await card.innerText();
  check('Today: the read-back card with notes and tomorrow', /stress hit 8 at 14:00/.test(txt) && /YOUR NOTES|Your notes/i.test(txt) && /A 10-minute walk/.test(txt));
  await card.scrollIntoViewIfNeeded(); await pg.screenshot({ path: OUT + 'night-card.png' });
  await pg.goto(APP + '#ai'); await pg.waitForTimeout(200);
  check('it lands in the AI chat too', /🌙 A steady day/.test(await pg.locator('body').innerText()));

  // Logged more after it was written → offer to read it again.
  await pg.evaluate(() => { const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k)); s.entries.push({ id: 'b1', kind: 'drink', at: new Date(2026, 9, 1, 21, 40).getTime(), name: 'Beer', ml: 500, caffeineMg: 0, alcoholG: 20, kcal: 210 }); localStorage.setItem(k, JSON.stringify(s)); });
  await pg.clock.setFixedTime(new Date(2026, 9, 1, 21, 45)); await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('text=Settings'); await pg.waitForTimeout(300);
  check('no automatic second call', calls.filter((c) => c.task === 'night').length === 1);
  await pg.getByRole('button', { name: /read it again/ }).click(); await pg.waitForTimeout(300);
  check('"read it again" asks once more, with the beer in it', calls.filter((c) => c.task === 'night').length === 2 && /21:40 drank Beer/.test(calls.filter((c) => c.task === 'night')[1].context));

  // Next morning it's still there; after noon it's gone.
  await pg.clock.setFixedTime(new Date(2026, 9, 2, 8, 0)); await pg.reload(); await pg.waitForSelector('text=Settings'); await pg.waitForTimeout(300);
  check('next morning: shown as "last night", not re-asked', /last night/.test(await pg.getByLabel('Your day, read back').innerText()) && calls.filter((c) => c.task === 'night').length === 2);
  await pg.clock.setFixedTime(new Date(2026, 9, 2, 12, 30)); await pg.reload(); await pg.waitForSelector('text=Settings'); await pg.waitForTimeout(200);
  check('after noon: gone', await pg.getByLabel('Your day, read back').count() === 0);
  console.log('errors:', JSON.stringify(errs));
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
