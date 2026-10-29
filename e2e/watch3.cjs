// Watching, phase 3 (owner: "do 3" — "i mean phase 3"; 28 Oct: "propose it when i log a bad mood, low energy etc").
// Thu 29 Oct. A walk watch ("i feel better after a walk", energy, asked 30 min after each) with 6 walks behind it, energy
// +1.5 after each. 15:00 check-in: energy 3, mood 3. For you leads with "Energy 3 · you said it helps": the note, your
// data (CLEAR), the study, "Start a walk" — and the same note isn't offered again as a plain tip. "Start a walk" starts
// the walk timer and puts the offer away; the walk ends 15:40, and at 16:15 its question is there. Controls: energy 6 →
// no offer; "Not now" puts it away. A creatine watch that ran its 14 days: "Watching · done" says what it showed;
// "Two more weeks" makes it run again; a coffee watch's "End it" keeps it in the list with what it showed, off Today.
const { chromium, APP, OUT, handle, forYou, tables } = require('./harness.cjs');

const KEY = 'healthos.v1:u-test', T = (d, hm) => new Date(`${d}T${hm}:00`).getTime();
const day = (k) => { const x = new Date('2026-10-29T12:00:00'); x.setDate(x.getDate() - k); return x.toISOString().slice(0, 10); };
const WALK = { id: 'wk', at: T(day(3), '08:00'), start: day(3), what: 'Walks → more energy', note: 'i feel better after a walk', question: 'Better than before the walk?', options: ['Worse', 'Same', 'Better'], days: 14,
  found: [{ text: 'A 10-minute walk lifts energy for about an hour', sure: 'some', source: { title: 'Ekkekakis 2008', url: 'https://example.org/walk' } }], cause: { kind: 'cardio', name: 'Walk' }, feel: 'energy', afterMin: 30 };
const CR = { id: 'cr', at: T(day(14), '08:00'), start: day(14), what: 'Creatine → fuller muscles', note: 'creatine makes my muscles fuller', question: 'Muscles feel full today?', options: ['Not really', 'A bit', 'Very'], days: 14, found: [], cause: { kind: 'supplement', name: 'Creatine', suppId: 'cre' } };
const COFFEE = { id: 'cf', at: T(day(14), '09:00'), start: day(14), what: 'Coffee → jittery', note: 'coffee makes me jittery', question: 'Jittery today?', options: ['No', 'Yes'], days: 14, found: [] };

function world() {
  const entries = [], workouts = [];
  [2, 4, 6, 8, 10, 12].forEach((k, i) => {
    const d = day(k);
    workouts.push({ id: `wk${i}`, template: 'Walk', kind: 'cardio', startedAt: T(d, '17:00'), endedAt: T(d, '17:30'), cardio: { what: 'Walk' }, plan: [] });
    entries.push({ id: `fb${i}`, kind: 'feel', at: T(d, '16:00'), energy: 5 }, { id: `fa${i}`, kind: 'feel', at: T(d, '18:15'), energy: 6 + (i % 2 ? 0.7 : 0.3) });
  });
  for (let k = 1; k <= 14; k++) entries.push({ id: `ca${k}`, kind: 'answer', at: T(day(k), '20:30'), key: 'watch:cr', question: CR.question, answer: k < 4 ? 'A bit' : 'Very' });
  for (let k = 1; k <= 14; k += 2) entries.push({ id: `cr${k}`, kind: 'supp', at: T(day(k), '08:00'), suppId: 'cre', status: 'taken' });
  entries.push({ id: 'note', kind: 'notice', at: T(day(3), '08:00'), text: 'i feel better after a walk' });
  return { entries, workouts };
}

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  async function open(at, extra = []) {
    tables.entries.clear(); tables.docs.clear();
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    const pg = await ctx.newPage();
    await pg.clock.install({ time: at });
    pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    await pg.goto(APP);
    await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
    const w = world();
    await pg.evaluate(([k, entries, workouts, watches]) => { const s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = entries; s.workouts = workouts;
      s.supplements = [{ id: 'cre', name: 'Creatine', dose: '5 g', slot: 'morning', at: 480, active: true }]; s.ai = { ...(s.ai || {}), watches, digest: null, night: null }; localStorage.setItem(k, JSON.stringify(s)); }, [KEY, [...w.entries, ...extra], w.workouts, [WALK, CR, COFFEE]]);
    await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('.t2-status');
    return { ctx, pg, st: () => pg.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}'), KEY) };
  }
  const low = { id: 'low', kind: 'feel', at: T('2026-10-29', '15:00'), energy: 3, mood: 3 };

  // 15:10: energy 3 → your own fix
  let { ctx, pg, st } = await open(T('2026-10-29', '15:10'), [low]);
  const first = await pg.locator('.fy-item[data-current]').getAttribute('data-key');
  const offer = pg.locator('.watchoffer');
  const txt = (await offer.innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(`For you leads with it (${first})`, first === 'watchoffer');
  check(`energy 3: your note, your data, the study, a walk (${txt.slice(0, 260)})`, /^ENERGY 3 you said it helps “?i feel better after a walk”? Your data: after 6 walks, energy at your next check-in was \+1\.5 against the one before CLEAR Studies: A 10-minute walk lifts energy for about an hour SOME Ekkekakis 2008 ↗ Start a walk Not now 30 minutes after, it asks “Better than before the walk\?”/i.test(txt));
  check('the same note isn\'t offered again as a plain tip', await pg.locator('.tipask').count() === 0);
  await pg.locator('.fy').screenshot({ path: OUT + 'watch3-offer.png' });
  check(`fits (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
  await offer.getByRole('button', { name: 'Start a walk' }).click(); await pg.waitForTimeout(250);
  let s = await st();
  const running = s.workouts.find((w) => w.endedAt === null);
  check(`"Start a walk": the walk timer runs, the offer is put away (${running?.kind} ${running?.cardio?.what ?? running?.template})`, running && running.kind === 'cardio' && /walk/i.test(running.cardio?.what ?? running.template) && s.entries.some((e) => e.kind === 'answer' && e.key === 'watchtry:wk' && e.answer === 'doing it') && await pg.locator('.watchoffer').count() === 0);
  // the walk ends 15:40; 16:15 its question
  await pg.evaluate(([k, id, end]) => { const s = JSON.parse(localStorage.getItem(k)); s.workouts = s.workouts.map((w) => (w.id === id ? { ...w, endedAt: end } : w)); localStorage.setItem(k, JSON.stringify(s)); }, [KEY, running.id, T('2026-10-29', '15:40')]);
  await pg.clock.setSystemTime(T('2026-10-29', '16:15')); await pg.reload(); await pg.waitForSelector('.t2-status');
  check('16:15: the walk\'s question is in For you', await forYou(pg, 'watch:wk') && /Walk at 15:40 — how is it now\?/.test(await pg.locator('.fy-item[data-current] .watchask').innerText()));
  await ctx.close();

  // controls: energy 6 → nothing; "Not now" → put away
  ({ ctx, pg, st } = await open(T('2026-10-29', '15:10'), [{ ...low, energy: 6, mood: 6 }]));
  check('control: energy 6 → no offer', await pg.locator('.watchoffer').count() === 0);
  await ctx.close();
  ({ ctx, pg, st } = await open(T('2026-10-29', '15:10'), [low]));
  await pg.locator('.watchoffer').getByRole('button', { name: 'Not now' }).click(); await pg.waitForTimeout(200);
  check('"Not now" puts it away', await pg.locator('.watchoffer').count() === 0 && (await st()).entries.some((e) => e.key === 'watchtry:wk' && e.answer === 'not now'));

  // what a finished watch showed
  check('the creatine watch ran its 14 days: what it showed is in For you', await forYou(pg, 'watchdone:cr'));
  const done = (await pg.locator('.fy-item[data-current] .watchdone').innerText()).replace(/\s+/g, ' ');
  check(`…its answers, the most given, your data with the app's word (${done.slice(0, 240)})`, /14 answers in 14 days to “Muscles feel full today\?”: “Very” 11 times\. On creatine days you answered “Very” \([\d.]+ of 2\), without “Very” \([\d.]+\) — not clear. Two more weeks End it/.test(done));
  await pg.locator('.fy').screenshot({ path: OUT + 'watch3-done.png' });
  await pg.locator('.fy-item[data-current] .watchdone').getByRole('button', { name: 'Two more weeks' }).click(); await pg.waitForTimeout(200);
  s = await st();
  check(`"Two more weeks": it runs again, 28 days (${s.ai.watches.find((w) => w.id === 'cr').days})`, s.ai.watches.find((w) => w.id === 'cr').days === 28 && await pg.locator('.watchdone', { hasText: 'Creatine' }).count() === 0);
  await forYou(pg, 'watchdone:cf');
  await pg.locator('.watchdone', { hasText: 'Coffee' }).getByRole('button', { name: 'End it' }).click(); await pg.waitForTimeout(200);
  await pg.goto(APP + '#ai'); await pg.waitForSelector('.watchlist');
  const cf = (await pg.locator('.watch-item', { hasText: 'Coffee → jittery' }).innerText()).replace(/\s+/g, ' ');
  check(`"End it": off Today, still in the list with what it showed (${cf.slice(0, 120)})`, /What it showed: No answers in its 14 days — nothing to go on\./.test(cf) && !/Two more weeks/.test(cf) && /Remove/.test(cf));
  await ctx.close();
  console.log('errors: ' + JSON.stringify(errs)); await b.close();
})().catch((e) => { console.log('CRASH ' + e.message); process.exit(1); });
