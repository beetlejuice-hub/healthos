// The weekly deep dive (PLAN 160; owner, 21 Oct: "do 2, 1, 3, 4" — 3 — and "3: ai": the AI picks the topic). Sunday
// 10:00 with two weeks logged: the app asks for this week's dive once; the card on the AI tab shows its question and the
// verdict's start, highlighted until opened; open, why, your data, the studies (a checked link says so), the verdict with
// how sure, and an experiment that starts with a tap. "Pick another topic" asks again with the first left out, twice;
// then "Next one Sunday". A reload doesn't ask again.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

const H = 3_600_000, D = 86_400_000, NOW = new Date('2026-10-25T10:00:00').getTime(), KEY = 'healthos.v1:u-test';
const DIVES = [
  { topic: 'Is magnesium doing anything for your sleep?', why: 'You\'ve taken it 14 nights and rated sleep every morning.', yourData: 'Sleep 7.1 with magnesium vs 7.0 without — not clear (the app\'s test).', verdict: 'Your data can\'t tell yet, and studies show a small effect at best — mostly in people low on it.', sure: 'weak',
    found: [{ title: 'Magnesium for insomnia in older adults', text: 'A review of 3 trials: sleep onset ~17 min faster, low-quality evidence.', source: { title: 'Oral magnesium for insomnia: a systematic review', url: 'https://example.org/mg', checked: true } },
      { title: 'Magnesium and sleep quality', text: 'A cohort study: higher intake went with better sleep scores.', source: { title: 'Dietary magnesium and sleep', url: 'https://example.org/mg2' } }],
    experiment: { name: 'Two weeks without magnesium', how: 'Skip it; keep bedtime and caffeine the same', days: 14, measure: 'sleep' } },
  { topic: 'Do your late coffees cost you deep sleep?', why: 'Three coffees after 15:00 last week.', yourData: '—', verdict: 'Probably a little.', sure: 'moderate', found: [] },
  { topic: 'Is your Friday energy dip the week or the gym?', why: 'Energy 4 on three Fridays.', yourData: '—', verdict: 'The week, mostly.', sure: 'weak', found: [] },
];

(async () => {
  const b = await chromium.launch(); const errs = [], calls = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  await ctx.route('**/api/ai/usage**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ usage: null, cap: 50, on: true }) }));
  await ctx.route('**/api/ai?**', async (r) => {
    const body = r.request().postDataJSON(); calls.push(body);
    if (body.task !== 'dive') return r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' });
    await new Promise((ok) => setTimeout(ok, 150));
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ answer: DIVES[calls.filter((c) => c.task === 'dive').length - 1], usage: null, costUsd: 0.3, model: 'opus' }) });
  });
  const pg = await ctx.newPage();
  await pg.clock.install({ time: NOW });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  // two weeks of sleep ratings
  await pg.evaluate(([k, now]) => { const s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = Array.from({ length: 14 }, (_, i) => ({ id: 'sl' + i, kind: 'sleep', at: now - (i + 1) * 86_400_000 + 3_600_000, rating: 7 })); s.workouts = []; s.ai = { ...(s.ai || {}), dive: null, dives: [], experiments: [], chat: [] }; localStorage.setItem(k, JSON.stringify(s)); }, [KEY, NOW]);
  await pg.goto(APP + '#ai'); await pg.reload(); await pg.waitForSelector('.ai-screen');
  for (let i = 0; i < 60 && !calls.some((c) => c.task === 'dive'); i++) await pg.waitForTimeout(100);
  const first = calls.filter((c) => c.task === 'dive');
  check(`Sunday 10:00: one deep dive asked for, told how to pick its topic (${first.length})`, first.length === 1 && /## This week's deep dive \(the app's ask\)\n- Pick ONE question from their own data/.test(first[0].context) && !/never again|another topic/.test(first[0].context));
  await pg.waitForSelector('.dive', { timeout: 5000 }).catch(() => {});
  const card = pg.locator('.dive');
  const folded = await card.locator('summary').innerText().catch(() => '');
  check(`the card: its week, new, the question, the verdict's start (${folded.replace(/\n/g, ' | ')})`, /^DEEP DIVE · WEEK OF SUN 25 OCT/i.test(folded) && /\bnew\b/i.test(folded) && /Is magnesium doing anything for your sleep\?/.test(folded) && /Your data can't tell yet/.test(folded) && await card.getAttribute('data-new') === 'true');
  await card.screenshot({ path: OUT + 'deepdive-folded.png' });
  await card.locator('summary').click(); await pg.waitForTimeout(200);
  const open = await card.innerText();
  check('open: why, your data, the studies, the verdict with how sure, the experiment',
    /WHY THIS\s*You've taken it 14 nights/i.test(open) && /YOUR DATA\s*Sleep 7\.1 with magnesium vs 7\.0 without/i.test(open) && /WHAT STUDIES FOUND[\s\S]*Magnesium for insomnia in older adults[\s\S]*Oral magnesium for insomnia: a systematic review ↗\s*✓ checked[\s\S]*Dietary magnesium and sleep ↗/i.test(open)
    && /THE VERDICT\s*thin evidence/i.test(open) && /Two weeks without magnesium — Skip it; keep bedtime and caffeine the same \(14 days; the app watches sleep\)/.test(open));
  check('opened once: not new any more', (await card.getAttribute('data-new')) === null && (await pg.evaluate((k) => JSON.parse(localStorage.getItem(k)).ai.dive.seen, KEY)) > 0);
  check(`fits the phone (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
  await card.screenshot({ path: OUT + 'deepdive-open.png' });
  await card.getByRole('button', { name: 'Try it for 14 days' }).click(); await pg.waitForTimeout(200);
  const xs = await pg.evaluate((k) => JSON.parse(localStorage.getItem(k)).ai.experiments, KEY);
  check(`the experiment starts with a tap (${JSON.stringify(xs.map((x) => [x.name, x.days, x.measure]))})`, xs.length === 1 && xs[0].name === 'Two weeks without magnesium' && xs[0].days === 14 && xs[0].measure === 'sleep' && /Running/.test(await card.innerText()));

  // pick another, twice
  await card.getByRole('button', { name: 'Pick another topic (2 left this week)' }).click();
  for (let i = 0; i < 40 && calls.filter((c) => c.task === 'dive').length < 2; i++) await pg.waitForTimeout(100);
  await pg.waitForFunction(() => /late coffees/.test(document.querySelector('.dive summary')?.textContent ?? ''), null, { timeout: 5000 }).catch(() => {});
  const second = calls.filter((c) => c.task === 'dive')[1]?.context ?? '';
  check('"pick another": asked again, the first topic left out', /never again: Is magnesium doing anything for your sleep\?/.test(second) && /They asked for another topic: not "Is magnesium doing anything for your sleep\?"/.test(second));
  check(`…and the card shows the new one, new again, 1 pick left (${(await card.locator('summary').innerText()).split('\n')[2]})`, /Do your late coffees cost you deep sleep\?/.test(await card.innerText()) && /Pick another topic \(1 left this week\)/.test(await card.innerText()));
  await card.getByRole('button', { name: 'Pick another topic (1 left this week)' }).click();
  await pg.waitForFunction(() => /Friday energy/.test(document.querySelector('.dive summary')?.textContent ?? ''), null, { timeout: 5000 }).catch(() => {});
  const third = calls.filter((c) => c.task === 'dive')[2]?.context ?? '';
  check('the second time, both left out; then no more picks this week', /not "Is magnesium doing anything for your sleep\?", not "Do your late coffees cost you deep sleep\?"/.test(third) && /Next one Sunday\./.test(await card.innerText()) && await card.getByRole('button', { name: /Pick another/ }).count() === 0);
  // a reload doesn't ask again
  const n = calls.filter((c) => c.task === 'dive').length;
  await pg.reload(); await pg.waitForSelector('.ai-screen'); await pg.waitForTimeout(1500);
  check(`a reload doesn't ask again (${calls.filter((c) => c.task === 'dive').length - n} more)`, calls.filter((c) => c.task === 'dive').length === n && /Friday energy/.test(await pg.locator('.dive summary').innerText()));
  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
