// A "why?" note on a check-in, and the nightly read-back that takes it seriously (owner, 2 Oct).
// Fake /api/ai: no credits spent; we check what the AI was sent, and what the app shows.
const { chromium, APP, OUT, handle, rate } = require('./harness.cjs');
const calls = [];
const NIGHT = { summary: 'A steady day with one spike: stress hit 8 at 14:00, right when the deadline you wrote about landed.', happened: ['Coffee at 08:10, nothing after', 'Check-in at 14:00: mood 4, stress 8'], notes: 'You said the stress was the deadline at work — the 8 fits that, and nothing else in your log points elsewhere.', change: [{ what: 'A 10-minute walk before the next deadline block.', why: 'Your stress tends to ease after time outside.' }], remember: ['Stress runs high on deadline days; it eases after time outside.'] };
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
  // the read-back is asked on the app's first tick; a loaded machine can take longer than half a second to get there
  for (let i = 0; i < 40 && !calls.some((c) => c.task === 'night'); i++) await pg.waitForTimeout(100);
  const sent = calls.filter((c) => c.task === 'night');
  check('one read-back asked for, for today', sent.length === 1 && sent[0].day === '2026-10-01');
  check('the AI gets the day in order, the note quoted exactly', /## The day being read back: Thu 1 Oct \(today\), as it happened[^\n]*\n[\s\S]*08:10 drank Coffee[\s\S]*14:00 check-in: mood 4, stress 8 · my note: "deadline at work"/.test(sent[0].context));
  check('…and the notes marked as the user\'s own reasons', /## Why I felt that way \(my own notes on check-ins — take these seriously\)/.test(sent[0].context));
  check('…and the mood journal: every check-in of the last weeks', /## Mood journal, every check-in[\s\S]*2026-10-01: 14:00 M4 S8 "deadline at work"/.test(sent[0].context));
  check('what it learned that lasts goes into its memory', (await pg.evaluate(() => JSON.parse(localStorage.getItem('healthos.v1:u-test')))).ai.memory.some((m) => /deadline days/.test(m.text)));
  // owner, 16 Oct: "collapsed at default … a subtle highlight … when it wasnt opened … after opening its just sits tehre
  // collapsed not highlighted"
  const card = pg.getByLabel('Your day, read back'), isNew = async () => (await card.getAttribute('data-new')) === 'true';
  let txt = await card.innerText();
  const foldedH = await card.evaluate((e) => Math.round(e.getBoundingClientRect().height));
  check(`arrives folded — the summary, not the rest — and highlighted as new (${foldedH} px)`, /stress hit 8 at 14:00/.test(txt) && !/YOUR NOTES|Your notes|A 10-minute walk/i.test(txt) && await isNew() && /new/i.test(await card.locator('.mr-head').innerText()) && foldedH < 170);
  const when = await card.locator('.mr-head .when').innerText().catch(() => '');
  check(`…saying when it was written, not just "new" (${when})`, /^tonight · 21:30$/.test(when));
  await card.scrollIntoViewIfNeeded();
  const bx = await card.boundingBox(); await pg.screenshot({ path: OUT + 'night-card-new.png', clip: { x: Math.max(0, bx.x - 24), y: bx.y - 12, width: Math.min(390, bx.width + 48), height: bx.height + 24 } });
  const bar = await card.evaluate((e) => getComputedStyle(e, '::before').width);
  check(`…the highlight shows inside the Now panel: an accent bar (${bar})`, bar === '3px');
  await card.locator('.mr-head').click(); await pg.waitForTimeout(150);
  txt = await card.innerText();
  check('opened: notes and tomorrow; the highlight goes', /YOUR NOTES|Your notes/i.test(txt) && /A 10-minute walk/.test(txt) && !(await isNew()));
  await card.screenshot({ path: OUT + 'night-card.png' });
  await pg.reload(); await pg.waitForSelector('text=Settings'); await pg.waitForTimeout(200);
  check('back on Today: folded again, not highlighted', !/YOUR NOTES|Your notes/i.test(await card.innerText()) && !(await isNew()));
  await pg.goto(APP + '#ai'); await pg.waitForTimeout(200);
  check('it isn\'t repeated in the AI chat — it\'s on Today (owner, 16 Oct)', !/🌙|A steady day/.test(await pg.locator('.chat').innerText()));

  // Logged more after it was written → offer to read it again.
  await pg.evaluate(() => { const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k)); s.entries.push({ id: 'b1', kind: 'drink', at: new Date(2026, 9, 1, 21, 40).getTime(), name: 'Beer', ml: 500, caffeineMg: 0, alcoholG: 20, kcal: 210 }); localStorage.setItem(k, JSON.stringify(s)); });
  await pg.clock.setFixedTime(new Date(2026, 9, 1, 21, 45)); await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('text=Settings'); await pg.waitForTimeout(300);
  check('no automatic second call', calls.filter((c) => c.task === 'night').length === 1);
  await pg.getByRole('button', { name: /read it again/ }).click(); await pg.waitForTimeout(300);
  check('"read it again" asks once more, with the beer in it', calls.filter((c) => c.task === 'night').length === 2 && /21:40 drank Beer/.test(calls.filter((c) => c.task === 'night')[1].context));
  check('the new read-back is new again: highlighted', await isNew());

  // Past midnight it's still that evening (#107): a beer at 00:20 belongs to the 1st, the card still says tonight.
  await pg.evaluate(() => { const k = 'healthos.v1:u-test', s = JSON.parse(localStorage.getItem(k)); s.entries.push({ id: 'b2', kind: 'drink', at: new Date(2026, 9, 2, 0, 20).getTime(), name: 'Beer', ml: 500, caffeineMg: 0, alcoholG: 20, kcal: 210 }); localStorage.setItem(k, JSON.stringify(s)); });
  await pg.clock.setFixedTime(new Date(2026, 9, 2, 0, 30)); await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('text=Settings'); await pg.waitForTimeout(300);
  check(`00:30: still "tonight", not re-asked by itself (${(await pg.getByLabel('Your day, read back').locator('.mr-head').innerText()).replace(/\s+/g, ' ')})`, /tonight/.test(await pg.getByLabel('Your day, read back').locator('.mr-head').innerText()) && calls.filter((c) => c.task === 'night').length === 2);
  await pg.getByRole('button', { name: /read it again/ }).click(); await pg.waitForTimeout(300);
  const third = calls.filter((c) => c.task === 'night')[2];
  check('…the 00:20 beer offers a re-read; it\'s the 1st\'s, after the 21:40 one, marked, the header saying so', third && third.day === '2026-10-01'
    && /## The day being read back: Thu 1 Oct \(tonight, past midnight\)[\s\S]*21:40 drank Beer[\s\S]*00:20 \(after midnight\) drank Beer/.test(third.context));

  // Next morning it's still there; after noon it's gone.
  await pg.clock.setFixedTime(new Date(2026, 9, 2, 8, 0)); await pg.reload(); await pg.waitForSelector('text=Settings'); await pg.waitForTimeout(300);
  check('next morning: shown as "last night", not re-asked', /last night/.test(await pg.getByLabel('Your day, read back').innerText()) && calls.filter((c) => c.task === 'night').length === 3);
  await pg.clock.setFixedTime(new Date(2026, 9, 2, 12, 30)); await pg.reload(); await pg.waitForSelector('text=Settings'); await pg.waitForTimeout(200);
  check('after noon: gone', await pg.getByLabel('Your day, read back').count() === 0);
  console.log('errors:', JSON.stringify(errs));
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
