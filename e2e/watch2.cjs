// Watching, phase 2 (owner: "phase2"): your own data on each watch, and a question right after the thing itself.
// Thu 29 Oct. Planted: 6 walks in the last two weeks (cardio "Walk"), each with a check-in an hour before (energy 5) and
// 45 minutes after (energy ~6.5). He notes "i feel better after a walk" — the AI (faked) proposes a watch tied to walks,
// energy, asked 30 min after each. The card says so; once it's on, the AI tab shows "Your data: after 6 walks, energy at
// your next check-in was +1.5 against the one before" marked CLEAR. A walk today ends 17:30: no question at 17:50, at
// 18:05 it's in For you ("Walk at 17:30 — how is it now?"), answered once, gone. A creatine watch taken every day says
// "nothing to compare yet" (EARLY), never a made-up difference. Control: a watch with no data link shows no "Your data".
const { chromium, APP, OUT, handle, forYou, tables } = require('./harness.cjs');

const KEY = 'healthos.v1:u-test', T = (d, hm) => new Date(`${d}T${hm}:00`).getTime();
const day = (k) => { const x = new Date('2026-10-29T12:00:00'); x.setDate(x.getDate() - k); return x.toISOString().slice(0, 10); };
const CALL = { id: 'w2', name: 'propose', input: { change: 'watch', why: 'two weeks of after-walk answers', what: 'Walks → more energy', note: 'i feel better after a walk',
  question: 'Better than before the walk?', options: ['Worse', 'Same', 'Better'], days: 14, cause_kind: 'cardio', cause_name: 'Walk', feel: 'energy', after_min: 30,
  found: [{ text: 'A 10-minute walk lifts energy and mood for about an hour', sure: 'some', title: 'Ekkekakis 2008', url: 'https://example.org/walk' }] } };

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  tables.entries.clear(); tables.docs.clear();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  await ctx.route('**/api/ai/usage**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ usage: null, cap: 50, on: true }) }));
  await ctx.route('**/api/ai?**', (r) => {
    const body = r.request().postDataJSON();
    if (body.task !== 'chat') return r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' });
    const answer = body.turn ? { reply: 'Watching walks → energy.', remember: [] } : { reply: '', remember: [], calls: [CALL], turn: [{ role: 'assistant', content: [{ type: 'tool_use', ...CALL }] }] };
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ answer, usage: null, costUsd: 0.01, model: 'sonnet' }) });
  });
  const pg = await ctx.newPage();
  await pg.clock.install({ time: T('2026-10-29', '12:00') });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  // two weeks: 6 walks with check-ins around them; creatine every morning for 5 days, answered "Very" each evening
  const entries = [], workouts = [], lifts = [1.4, 1.6, 1.5, 1.7, 1.3, 1.5];
  [2, 4, 6, 8, 10, 12].forEach((k, i) => {
    const d = day(k);
    workouts.push({ id: `wk${i}`, template: 'Walk', kind: 'cardio', startedAt: T(d, '17:00'), endedAt: T(d, '17:30'), cardio: { what: 'Walk' }, plan: [] });
    entries.push({ id: `fb${i}`, kind: 'feel', at: T(d, '16:00'), energy: 5 }, { id: `fa${i}`, kind: 'feel', at: T(d, '18:15'), energy: 5 + lifts[i] });
  });
  for (let k = 1; k <= 5; k++) entries.push({ id: `cr${k}`, kind: 'supp', at: T(day(k), '08:00'), suppId: 'cre', status: 'taken' }, { id: `ca${k}`, kind: 'answer', at: T(day(k), '20:30'), key: 'watch:cr', question: 'Muscles feel full today?', answer: 'Very' });
  const CR = { id: 'cr', at: T(day(5), '08:00'), start: day(5), what: 'Creatine → fuller muscles', note: 'creatine makes my muscles fuller', question: 'Muscles feel full today?', options: ['Not really', 'A bit', 'Very'], days: 14, found: [], cause: { kind: 'supplement', name: 'Creatine', suppId: 'cre' } };
  const PLAIN = { id: 'pl', at: T(day(1), '20:00'), start: day(1), what: 'Coffee → jittery', note: 'coffee makes me jittery', question: 'Jittery today?', options: ['No', 'Yes'], days: 14, found: [] };
  await pg.evaluate(([k, entries, workouts, watches]) => { const s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = entries; s.workouts = workouts;
    s.supplements = [{ id: 'cre', name: 'Creatine', dose: '5 g', slot: 'morning', at: 480, active: true }]; s.ai = { ...(s.ai || {}), chat: [], watches, digest: null, night: null }; localStorage.setItem(k, JSON.stringify(s)); }, [KEY, entries, workouts, [CR, PLAIN]]);
  await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('.t2-status');
  const st = () => pg.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}'), KEY);

  // the note → a watch tied to walks
  await pg.getByLabel('Something you noticed').fill('i feel better after a walk'); await pg.getByLabel('Something you noticed').press('Enter');
  const card = pg.locator('.notice-box .propose'); await card.waitFor({ timeout: 8000 });
  check(`the card: asked 30 min after each walk (${(await card.locator('b').innerText())})`, /Watch: Walks → more energy — ask “Better than before the walk\?” 30 min after each walk for 14 days/.test(await card.locator('b').innerText()));
  await card.getByRole('button', { name: 'Watch it' }).click(); await pg.waitForTimeout(200);
  const walk = (await st()).ai.watches.find((w) => w.what === 'Walks → more energy');
  check(`kept with what it's about (${JSON.stringify([walk?.cause, walk?.feel, walk?.afterMin])})`, walk && walk.cause.kind === 'cardio' && walk.cause.name === 'Walk' && walk.feel === 'energy' && walk.afterMin === 30);

  // the AI tab: your data on each
  await pg.goto(APP + '#ai'); await pg.waitForSelector('.watchlist');
  const item = async (what) => (await pg.locator('.watch-item', { hasText: what }).innerText()).replace(/\s+/g, ' ');
  const wk = await item('Walks → more energy');
  check(`walks: your data from the last two weeks, the app's test (${wk.slice(0, 200)})`, /Your data: after 6 walks, energy at your next check-in was \+1\.5 against the one before CLEAR/i.test(wk) && /asks “Better than before the walk\?” 30 min after each walk/.test(wk));
  const cr = await item('Creatine → fuller muscles');
  check(`creatine every day: nothing to compare yet, early (${cr.slice(0, 160)})`, /Your data: 5 answers, all on creatine days — nothing to compare yet EARLY/i.test(cr) && !/CLEAR/.test(cr));
  check('control: a watch with no link to the data says nothing about your data', !/Your data/.test(await item('Coffee → jittery')));
  await pg.locator('.watchlist').screenshot({ path: OUT + 'watch2-list.png' });
  check(`fits (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);

  // a walk today, 17:00–17:30
  await pg.evaluate(([k, w]) => { const s = JSON.parse(localStorage.getItem(k)); s.workouts.push(w); localStorage.setItem(k, JSON.stringify(s)); }, [KEY, { id: 'today', template: 'Walk', kind: 'cardio', startedAt: T('2026-10-29', '17:00'), endedAt: T('2026-10-29', '17:30'), cardio: { what: 'Walk' }, plan: [] }]);
  const asked = async (hm) => { await pg.clock.setSystemTime(T('2026-10-29', hm)); await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('.t2-status'); return forYou(pg, `watch:${walk.id}`); };
  check('17:50: not yet (30 min after the walk is 18:00)', !(await asked('17:50')));
  check('18:05: its question is in For you', await asked('18:05'));
  const q = (await pg.locator('.fy-item[data-current] .watchask').innerText()).replace(/\s+/g, ' ');
  check(`…about that walk, with your data (${q.slice(0, 220)})`, /Better than before the walk\? Walk at 17:30 — how is it now\? Worse Same Better Your data: after 6 walks/i.test(q));
  await pg.locator('.fy').screenshot({ path: OUT + 'watch2-ask.png' });
  await pg.locator('.fy-item[data-current] .watchask').getByRole('button', { name: 'Better' }).click(); await pg.waitForTimeout(200);
  check('answered once: gone, even at 19:00', !(await asked('19:00')) && (await st()).entries.some((e) => e.kind === 'answer' && e.key === `watch:${walk.id}` && e.answer === 'Better'));
  await ctx.close();
  console.log('errors: ' + JSON.stringify(errs)); await b.close();
})().catch((e) => { console.log('CRASH ' + e.message); process.exit(1); });
