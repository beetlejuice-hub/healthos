// Different every time (PLAN 194; owner, 4 Nov: "make sure studies are good, not the same thing, also im bored of the
// advice of adding skyr to my breakfast for protein, we talked ab this, make research, protocols, studies fun and
// different, sometimes random ones"). A fake AI writes the morning read on Wed 4 Nov and again on Tue 10 Nov.
// 4 Nov: a skyr bowl is never shown (his words, built in); the study shows its design; the read is told the never-again
//   list, the bar for a study and today's random field. "Not again" on the steps item; Settings lists both.
// 10 Nov (past the 5-day rest): the steps item under another name — gone (never again); the bath study's paper again
//   under another address — gone (cited); control: the bath topic with a new paper comes back. The read is told what was
//   cited. ✕ in Settings lifts it. 320 px fits.
const { chromium, APP, OUT, handle, forYou } = require('./harness.cjs');

const KEY = 'healthos.v1:u-test', T = (d, h, m = 0) => new Date(2026, 10, d, h, m).getTime();
const BATH = 'https://pubmed.ncbi.nlm.nih.gov/31102877/';
const DAY1 = { greeting: 'Morning.', items: [
  { type: 'pattern', topic: 'skyr-bowl', title: 'Skyr bowl: 30 g before 9', text: 'Your protein lands late.', tip: 'Have 250 g skyr with berries', sure: 'yours' },
  { type: 'pattern', topic: 'step-count-evening', title: 'Your evening steps lift your mood', text: 'Mood 7.4 on 8k-step evenings vs 6.1.', sure: 'yours' },
  { type: 'try', topic: 'nasal-breathing-cardio', title: 'Nose-only breathing on the bike', text: 'Lower heart rate at the same power.', sure: 'some', source: { title: 'Nasal breathing during exercise', url: 'https://pubmed.ncbi.nlm.nih.gov/29800000/' } },
  { type: 'study', topic: 'warm-bath-sleep', title: 'A warm bath 90 minutes before bed', text: 'Asleep about 10 minutes faster.', design: 'meta-analysis · 17 studies · 2019', sure: 'strong', source: { title: 'Before-bedtime passive body heating', url: BATH } },
] };
const DAY2 = { greeting: 'Morning again.', items: [
  { type: 'pattern', topic: 'evening-step-count', title: 'Evening steps and mood, once more', text: 'Still 7.4 vs 6.1.', sure: 'yours' },
  { type: 'study', topic: 'bath-before-bed', title: 'Hot bath, better sleep', text: 'The same review.', design: 'meta-analysis · 17 studies · 2019', sure: 'strong', source: { title: 'Passive body heating and sleep', url: 'https://pubmed.ncbi.nlm.nih.gov/31102877?from=x' } },
  { type: 'study', topic: 'warm-bath-sleep', title: 'Warm feet, faster sleep', text: 'Bed socks: asleep 7.5 min sooner.', design: 'RCT · 26 adults · 2018', sure: 'some', source: { title: 'Bed socks and sleep onset', url: 'https://pubmed.ncbi.nlm.nih.gov/30123456/' } },
  { type: 'pattern', topic: 'lunch-timing', title: 'Late lunches, slower afternoons', text: 'Energy 5.2 after lunch past 14:00 vs 6.4.', sure: 'yours' },
  { type: 'try', topic: 'cold-shower-finish', title: 'End the shower cold', text: '30 s of cold: more alert for an hour.', sure: 'some', source: { title: 'Cold showers and sickness absence', url: 'https://pubmed.ncbi.nlm.nih.gov/27631616/' } },
] };

(async () => {
  const b = await chromium.launch(); const errs = [], calls = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 320, height: 760 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  await ctx.route('**/api/ai/usage**', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ usage: null, cap: 50, on: true }) }));
  await ctx.route('**/api/ai?**', (r) => { const body = r.request().postDataJSON(); calls.push(body);
    const a = body.task === 'digest' ? (/today is 2026-11-10/.test(body.context) ? DAY2 : DAY1) : body.task === 'questions' ? { questions: [] } : null;
    if (!a) return r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' });
    r.fulfill({ contentType: 'application/json', body: JSON.stringify({ answer: a, usage: null, costUsd: 0.05, model: 'sonnet' }) }); });
  const pg = await ctx.newPage();
  await pg.clock.install({ time: T(4, 7, 40) });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  // both mornings' sleep ratings, written the way harness seed() does (after the sync's own save, checked)
  for (let k = 0; k < 3; k++) {
    await pg.waitForLoadState('networkidle');
    await pg.evaluate(([k, a, b]) => { const s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = [{ id: 'sl4', kind: 'sleep', at: a, rating: 7 }, { id: 'sl10', kind: 'sleep', at: b, rating: 7 }];
      s.ai = { ...(s.ai || {}), digest: null, night: null, said: [], shown: [], never: [], neverLifted: [], cited: [], memory: [] }; localStorage.setItem(k, JSON.stringify(s)); }, [KEY, T(4, 7, 20), T(10, 7, 20)]);
    await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('text=Settings');
    if (await pg.evaluate((k) => (JSON.parse(localStorage.getItem(k)).entries || []).some((e) => e.id === 'sl4'), KEY)) break;
  }
  const read = async (day) => {
    for (let i = 0; i < 80 && !calls.some((c) => c.task === 'digest' && c.context.includes(`today is ${day}`)); i++) await pg.waitForTimeout(100);
    await forYou(pg, 'morning');
    const mr = pg.locator('section.morning:not(.mr-pending)');
    await mr.waitFor({ timeout: 8000 }).catch(() => {});
    if (!(await mr.getAttribute('class')).includes('open')) await mr.locator('.mr-head').click();
    await pg.waitForTimeout(150);
    return mr;
  };

  // Wed 4 Nov
  let mr = await read('2026-11-04');
  let titles = await mr.locator('.mr-row b').allInnerTexts();
  check(`4 Nov: the skyr bowl isn't shown — protein at breakfast is on the never-again list (${titles.join(' | ')})`, titles.length === 3 && !titles.some((t) => /skyr/i.test(t)));
  const c1 = calls.find((c) => c.task === 'digest').context;
  check('…the read is told it', /## Never again — I'm tired of these[^\n]*\n- protein-breakfast: protein at breakfast — skyr, quark or Greek yoghurt/.test(c1));
  check(`…and today's random field for its study (${(c1.match(/- Today's study[^\n]*/) || [''])[0].slice(0, 120)})`, /- Today's study \(the third on a study morning, or the spare\) is from this field, the app's pick at random: \S/.test(c1));
  await mr.locator('.mr-row', { hasText: 'A warm bath' }).click(); await pg.waitForTimeout(120);
  const design = await mr.locator('.mr-design').innerText().catch(() => '');
  check(`the study says what kind it is, how big, when (${design})`, design === 'meta-analysis · 17 studies · 2019');
  await mr.locator('.mr-row', { hasText: 'Your evening steps' }).click(); await pg.waitForTimeout(120);
  const btn = mr.locator('.mr-never');
  check(`each item has "Not again" (${await btn.innerText().catch(() => '')})`, (await btn.innerText().catch(() => '')) === 'Not again');
  await btn.click(); await pg.waitForTimeout(200);
  const never = await pg.evaluate((k) => JSON.parse(localStorage.getItem(k)).ai.never, KEY);
  check(`tapped: "✓ Won't come back", kept by its topic (${await btn.innerText()} · ${JSON.stringify(never.map((n) => n.topic))})`, (await btn.innerText()) === "✓ Won't come back" && never.length === 1 && never[0].topic === 'step-count-evening');
  check(`320: fits (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 320);
  await mr.screenshot({ path: OUT + 'notagain-read.png' });
  const cited = await pg.evaluate((k) => JSON.parse(localStorage.getItem(k)).ai.cited, KEY);
  check(`the read's links are kept, by paper (${JSON.stringify(cited.map((c) => c.key))})`, JSON.stringify(cited.map((c) => c.key)) === '["pmid:29800000","pmid:31102877"]');

  // Settings → AI: the never-again list
  await pg.goto(APP + '#settings'); await pg.waitForTimeout(500);
  const list = (await pg.locator('.readlog.never').innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(`Settings lists them: his words and the tap (${list.slice(0, 160)})`, /protein breakfast you said, 4 Nov protein at breakfast — skyr/.test(list) && /step count evening since Wed 4 Nov Your evening steps lift your mood/.test(list));
  await pg.locator('.readlog.never').screenshot({ path: OUT + 'notagain-settings.png' }).catch(() => {});

  // Tue 10 Nov: past the 5-day rest
  await pg.clock.setFixedTime(T(10, 7, 40)); await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('text=Settings');
  mr = await read('2026-11-10');
  titles = await mr.locator('.mr-row b').allInnerTexts();
  check(`10 Nov: the steps item under another name is gone; the bath paper again, under another address, is gone (${titles.join(' | ')})`,
    !titles.some((t) => /Evening steps|Hot bath/.test(t)));
  check('…control: the same bath topic with a new paper comes back (the rest is over, the paper is new)', titles.join('|') === 'Warm feet, faster sleep|Late lunches, slower afternoons|End the shower cold');
  const c2 = calls.filter((c) => c.task === 'digest').at(-1).context;
  check('…the read was told what was cited, and the tap', /## Papers and pages already cited[^\n]*\n- Before-bedtime passive body heating\n- Nasal breathing during exercise/.test(c2) && /- step-count-evening: Your evening steps lift your mood/.test(c2));

  // ✕ lifts it
  await pg.goto(APP + '#settings'); await pg.waitForTimeout(400);
  await pg.getByRole('button', { name: 'Let step count evening come back' }).click(); await pg.waitForTimeout(200);
  check('✕ in Settings lifts it', (await pg.evaluate((k) => JSON.parse(localStorage.getItem(k)).ai.never, KEY)).length === 0 && !/step count evening/.test(await pg.locator('.readlog.never').innerText()));
  console.log('errors: ' + JSON.stringify(errs)); check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH ' + e.message); process.exit(1); });
