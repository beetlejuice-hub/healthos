// Discoveries (PLAN 187 phase 1; owner, 3 Nov: "finding new studies, random ones … or reddit forums that talk ab things
// that changed their lives … one or 2 for each day. completely random. like it sent me the kiwi study and i am trying it
// rn"). A fake AI: the morning read brings a kiwi study with something to try, the evening read a forum post. The read was
// told the app's random pick; folded, one line; opened, the study, how sure, its source; "Try it for 14 days" starts a
// watch (in the AI tab, its evening question). The forum post is an anecdote; "Not for me" puts it away. Control: a read
// without one shows none. 320 px fits.
const { chromium, APP, OUT, handle, forYou } = require('./harness.cjs');

const KEY = 'healthos.v1:u-test', T = (h, m = 0) => new Date(2026, 10, 3, h, m).getTime();
const item = (n) => ({ type: 'pattern', topic: `t-${n}`, title: `Item ${n}: short nights cost you focus`, text: 'Focus 5.1 after short nights vs 6.6.', tip: 'Bed by 23:00', sure: 'yours', measure: 'focus' });
const KIWI = { topic: 'sleep', kind: 'study', title: 'Two kiwis before bed: asleep 35% faster', text: 'In a 4-week trial, adults who ate two kiwifruit an hour before bed fell asleep 35% faster and slept 13% longer.', why: 'Your sleep score dips on weeknights.', sure: 'some', source: { title: 'Lin 2011, Asia Pac J Clin Nutr', url: 'https://pubmed.ncbi.nlm.nih.gov/21669584/' },
  try: { what: 'Kiwi before bed → sleep', question: 'Did you fall asleep faster last night?', options: ['No', 'A bit', 'Yes'], days: 14, cause_kind: 'food', cause_name: 'kiwi' } };
const FORUM = { topic: 'brain-fog', kind: 'forum', title: '"Morning sunlight fixed my 3 pm crash"', text: 'A r/Biohackers user says 10 minutes of sun before 9:00 ended his afternoon fog within two weeks.', why: 'Your focus drops after 15:00.', sure: 'strong', source: { title: 'r/Biohackers thread', url: 'https://www.reddit.com/r/Biohackers/comments/abc123/' } };
const ANSWERS = { digest: () => ({ greeting: 'Morning.', items: [item(1), item(2), item(3)], discovery: KIWI }), night: () => ({ summary: 'A calm day.', happened: [], notes: '', change: [], remember: [], discovery: FORUM }), questions: () => ({ questions: [] }) };

(async () => {
  const b = await chromium.launch(); const errs = [], calls = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 320, height: 760 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  await ctx.route('**/api/ai/usage**', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ usage: null, cap: 50, on: true }) }));
  await ctx.route('**/api/ai?**', (r) => { const body = r.request().postDataJSON(); calls.push(body); const a = ANSWERS[body.task]; if (!a) return r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' });
    r.fulfill({ contentType: 'application/json', body: JSON.stringify({ answer: a(), usage: null, costUsd: 0.05, model: 'sonnet' }) }); });
  const pg = await ctx.newPage();
  await pg.clock.install({ time: T(7, 40) });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|fonts|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  await pg.evaluate(([k, at]) => { const s = JSON.parse(localStorage.getItem(k) || '{}'); s.entries = [{ id: 'sl', kind: 'sleep', at, rating: 7 }]; s.ai = { ...(s.ai || {}), digest: null, night: null, watches: [], discoveries: [] }; localStorage.setItem(k, JSON.stringify(s)); }, [KEY, T(7, 20)]);
  await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('text=Settings');
  for (let i = 0; i < 60 && !calls.some((c) => c.task === 'digest'); i++) await pg.waitForTimeout(100);
  const sent = calls.find((c) => c.task === 'digest');
  check(`the morning read was told the app's random pick (${(sent?.context.match(/## Today's discovery[^\n]*/) || [''])[0]})`, /## Today's discovery \(picked at random by the app — topic "[a-z-]+", kind "(study|forum|classic)"\)\n- topic: .+\n- kind: .+/.test(sent?.context ?? ''));
  await forYou(pg, 'morning');
  const mr = pg.locator('section.morning:not(.mr-pending)');
  await mr.waitFor({ timeout: 8000 }).catch(() => {});
  const line = (await mr.locator('.disc-line').innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(`folded: one line (${line})`, /^Found for you Two kiwis before bed: asleep 35% faster$/i.test(line));
  await mr.locator('.disc-line').click(); await pg.waitForTimeout(150);
  const card = mr.locator('.disc');
  const t = (await card.innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(`opened: the study, how sure, why for you, its source (${t.slice(0, 150)}…)`, /Found for you · a study/i.test(t) && /some studies/i.test(t) && /fell asleep 35% faster/.test(t) && /sleep score dips on weeknights/.test(t) && await card.locator('a[href="https://pubmed.ncbi.nlm.nih.gov/21669584/"]').count() === 1);
  check(`320: fits (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 320);
  await card.screenshot({ path: OUT + 'discovery-study.png' });
  await card.getByRole('button', { name: 'Try it for 14 days' }).click(); await pg.waitForTimeout(300);
  const st = await pg.evaluate((k) => JSON.parse(localStorage.getItem(k)).ai, KEY);
  const w = (st.watches || []).find((x) => x.what === 'Kiwi before bed → sleep');
  check(`Try it: a watch, its question, 14 days, the study kept with it (${w ? `${w.what} · ${w.question} · ${w.days} days` : 'none'})`, !!w && w.question === 'Did you fall asleep faster last night?' && w.days === 14 && w.found?.[0]?.source?.url === KIWI.source.url && w.cause?.name === 'kiwi');
  check('…and the card says it\'s on', /Trying it — "Did you fall asleep faster last night\?" each evening/.test(await card.innerText()) && st.discoveries[0].tried > 0 && await card.getByRole('button', { name: /Try it/ }).count() === 0);

  // 21:30 — the evening's forum post
  await pg.clock.setFixedTime(T(21, 30)); await pg.reload(); await pg.waitForSelector('text=Settings');
  for (let i = 0; i < 60 && !calls.some((c) => c.task === 'night'); i++) await pg.waitForTimeout(100);
  const ns = calls.find((c) => c.task === 'night');
  check('the evening read was told its pick, and what was shown this morning', /## Today's discovery/.test(ns?.context ?? '') && /## Discoveries already shown[\s\S]*- Two kiwis before bed/.test(ns?.context ?? ''));
  await forYou(pg, 'night');
  const nr = pg.getByLabel('Your day, read back');
  await nr.locator('.mr-head').click(); await pg.waitForTimeout(150);
  const fc = nr.locator('.disc'), ft = (await fc.innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(`the forum post: one person's story, whatever the AI called it (${ft.slice(0, 120)}…)`, /Found for you · a forum post/i.test(ft) && /anecdote, not studied/i.test(ft) && await fc.getByRole('button', { name: /Try it/ }).count() === 0);
  await fc.getByRole('button', { name: 'Not for me' }).click(); await pg.waitForTimeout(200);
  check('Not for me: put away', await nr.locator('.disc, .disc-line').count() === 0 && (await pg.evaluate((k) => JSON.parse(localStorage.getItem(k)).ai.discoveries.find((d) => d.slot === 'evening').no, KEY)) > 0);

  // the AI tab keeps the ones not put away, to try later
  await pg.goto(APP + '#ai'); await pg.waitForTimeout(400);
  const dl = pg.locator('details.disc-list');
  await dl.locator('summary').click(); await pg.waitForTimeout(100);
  const rows = (await dl.locator('.disc-li').allInnerTexts()).map((x) => x.replace(/\s+/g, ' '));
  check(`AI tab: found for you lately — the kiwi (trying it), not the one put away (${rows.join(' | ')})`, rows.length === 1 && /trying it/i.test(rows[0]) && /Two kiwis/.test(rows[0]));
  await pg.goto(APP + '#today');
  // control: a read with no discovery shows none
  await pg.evaluate(([k, at]) => { const s = JSON.parse(localStorage.getItem(k)); s.ai.discoveries = []; localStorage.setItem(k, JSON.stringify(s)); }, [KEY, T(21, 31)]);
  await pg.reload(); await pg.waitForSelector('text=Settings'); await forYou(pg, 'night');
  check('control: no discovery, no card', await pg.getByLabel('Your day, read back').locator('.disc, .disc-line').count() === 0);
  console.log('errors: ' + JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH ' + e.message); process.exit(1); });
