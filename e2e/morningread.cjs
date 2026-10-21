// The morning read is written in the morning, after last night (owner, 16 Oct: "looks like app does daily read based on
// yyesterdays data" — it was written from 20:00 the evening before, so it called yesterday "today"). The evening before:
// nothing written. Next morning before last night is in: the read written the evening before isn't shown, nothing is
// written yet. A sleep rating comes in: the read is written, told what today is, with today's entries; it's on Today.
const { chromium, APP, OUT, handle } = require('./harness.cjs');

const KEY = 'healthos.v1:u-test', EVE = new Date('2026-10-15T20:30:00').getTime(), MORNING = new Date('2026-10-16T07:40:00').getTime();
const calls = [];
const READ = { greeting: 'Morning! 7 h last night — a better start.', items: [
  // PLAN 150 (owner, 21 Oct: "too long, too much info w no visual"): three short items, a tip and a chart each
  { type: 'pattern', title: 'Yesterday was foggy', text: 'Focus 3 at 11:36 yesterday, after 5 h of sleep.', tip: 'Take the hard task before 11 today', measure: 'focus' },
  { type: 'study', title: 'Protein through the day', text: 'Spreading protein over 3–4 meals kept more muscle in a 12-week trial.', tip: 'Have the protein coffee before 10', measure: 'protein', source: { title: 'Sleep 2025', url: 'https://example.org/s' } },
  // PLAN 132: one new thing to try, from the kind the app picked this morning
  { type: 'try', title: 'Cluster sets for your bench', text: 'Rest 20 s inside a set to keep the bar speed up.', source: { title: 'J Strength Cond Res 2025', url: 'https://example.org/cl' } },
],
  // PLAN 156 (owner, 21 Oct: "asking a question cause it saw a study … tracking something, tracking mental health even")
  questions: [
    { kind: 'study', text: 'A 2025 trial: 3 g glycine before bed, deeper sleep. Ever tried it?', options: ['Yes', 'No', 'Tell me more'], why: 'your deep sleep is under your usual 4 nights of 7', key: 'glycine', source: { title: 'Sleep Med 2025', url: 'https://example.org/gly' } },
    { kind: 'tracking', text: 'Social battery right now?', options: ['Full', 'Half', 'Empty'], why: 'mood dips the day after busy evenings', key: 'social_battery' },
  ],
  // something new (#109): a message in the chat, not on Today
  news: { title: 'Creatine and sleep loss', text: 'A 2026 trial: creatine kept reaction time up after a sleepless night.', source: { title: 'Sci Rep 2026', url: 'https://example.org/cr' } } };

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  await ctx.route('**/api/ai/usage**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ usage: null, cap: 50, on: true }) }));
  await ctx.route('**/api/ai?**', (r) => {
    const body = r.request().postDataJSON(); calls.push(body);
    if (body.task !== 'digest') return r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' });
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ answer: READ, usage: null, costUsd: 0.05, model: 'opus' }) });
  });
  const pg = await ctx.newPage();
  await pg.clock.install({ time: EVE });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  // the 15th: a foggy check-in at 11:36, the 15th's read written that morning
  await pg.evaluate(([k, at]) => { const s = JSON.parse(localStorage.getItem(k) || '{}');
    s.entries = [...(s.entries || []), { id: 'fog', kind: 'feel', at, focus: 3, note: 'foggy' }, { id: 'fog2', kind: 'feel', at: at - 2 * 864e5, focus: 6 },
      // protein: 120 g on the 13th; on the 15th 108 g of food and the protein coffee's 50 (owner, 21 Oct: "in reality it was 158")
      { id: 'm13', kind: 'food', at: at - 2 * 864e5, name: 'Lunch', grams: 400, macros: { kcal: 900, p: 120, c: 80, f: 30 } },
      { id: 'm15', kind: 'food', at, name: 'Lunch', grams: 400, macros: { kcal: 800, p: 108, c: 80, f: 20 } },
      { id: 'pc15', kind: 'drink', at: at - 3 * 3600e3, name: 'Protein coffee', ml: 330, caffeineMg: 80, alcoholG: 0, kcal: 210, p: 50 }];
    s.ai = { ...(s.ai || {}), digest: { day: '2026-10-15', at: at - 4 * 3600e3, greeting: 'Morning from the 15th', items: [] }, chat: [] };
    localStorage.setItem(k, JSON.stringify(s)); }, [KEY, new Date('2026-10-15T11:36:00').getTime()]);
  await pg.reload(); await pg.waitForSelector('text=Settings'); await pg.waitForTimeout(1200);
  check('the evening before: no morning read is written for tomorrow', !calls.some((c) => c.task === 'digest'));

  // what the old version left: tomorrow's read, written the evening before
  await pg.evaluate((k) => { const s = JSON.parse(localStorage.getItem(k)); s.ai.digest = { day: '2026-10-16', greeting: 'Morning! Rough night: 5 hours plus drinks.', items: [] }; localStorage.setItem(k, JSON.stringify(s)); }, KEY);
  await pg.clock.setSystemTime(MORNING); await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('text=Settings'); await pg.waitForTimeout(1200);
  check('next morning, before last night is in: the read written the evening before isn\'t shown', !/Rough night/.test(await pg.locator('body').innerText()) && await pg.locator('section.morning').count() === 0);
  check('…and nothing is written yet', !calls.some((c) => c.task === 'digest'));

  // the sleep rating comes in (07:35): last night is in
  await pg.evaluate(([k, at]) => { const s = JSON.parse(localStorage.getItem(k)); s.entries.push({ id: 'sl', kind: 'sleep', at, rating: 7 }); localStorage.setItem(k, JSON.stringify(s)); }, [KEY, MORNING - 5 * 60e3]);
  await pg.reload(); await pg.waitForSelector('section.morning', { timeout: 5000 }).catch(() => {});
  const dg = calls.filter((c) => c.task === 'digest');
  check(`last night in → one read written, for today (${dg.length})`, dg.length === 1);
  const c = dg[0]?.context ?? '';
  check(`it's told what today is (${c.split('\n')[0]})`, /^Now: Fri 16 Oct 2026, 07:40 — today is 2026-10-16\. "Last 14 days" ends yesterday \(2026-10-15\)/.test(c));
  const today = c.slice(c.indexOf('## Today so far'), c.indexOf('\n##', c.indexOf('## Today so far') + 3));
  check(`today's entries are today's — yesterday's foggy check-in isn't among them (${today.replace(/\n/g, ' | ')})`, /rated last night's sleep 7\/10/.test(today) && !/foggy|11:36/.test(today));
  const card = await pg.locator('section.morning').innerText().catch(() => '');
  check(`Today shows the new read (${card.split('\n').slice(0, 2).join(' · ')})`, /7 h last night — a better start/.test(card) && !/Rough night/.test(card));
  await pg.locator('section.morning').screenshot({ path: OUT + 'morning-read.png' }).catch(() => {});
  // owner, 16 Oct: folded by default, highlighted until opened once
  const mr = pg.locator('section.morning');
  check('the morning read is new until opened', await mr.getAttribute('data-new') === 'true');
  // owner, 20 Oct: "should add timestamp for new messages on today screen so its not just says new"
  const when = await mr.locator('.mr-head .when').innerText().catch(() => '');
  check(`…and says when it was written (${when})`, /^today · 07:4\d$/.test(when));
  // PLAN 132–133 (owner, 20 Oct: "make the digest messages more intereesting"; "recommend me new stuff"): the app's picks
  const picks = c.slice(c.indexOf('## This morning (the app'));
  check(`it's given this morning's angle and the kind of new thing to bring (${picks.split('\n').slice(1, 3).map((l) => l.slice(0, 50)).join(' | ')})`, /^## This morning \(the app's picks, so mornings differ\)\n- Angle for the "pattern" item: .+\n- "try" item today: .+/.test(picks));
  // folded: the three titles, each with a small chart of its number when it has one
  const rows = mr.locator('.mr-row');
  check(`folded: three titles, the two with a number have their small chart (${await rows.count()} rows, ${await mr.locator('.dc-mini').count()} charts)`, await rows.count() === 3 && await mr.locator('.dc-mini').count() === 2 && await mr.locator('.mr-body').count() === 0);
  const mrH = await mr.evaluate((e) => Math.round(e.getBoundingClientRect().height));
  check(`…and still small on a phone (${mrH} px)`, mrH < 240);
  await mr.screenshot({ path: OUT + 'morning-read-folded.png' });
  await mr.locator('.mr-head').click(); await pg.waitForTimeout(150);
  check(`the new thing shows as "New to try" (${(await mr.innerText()).replace(/\s+/g, ' ').match(/NEW TO TRY[^.]*|New to try[^.]*/i)?.[0]})`, /New to try\s*Cluster sets for your bench/i.test(await mr.innerText()));
  // an item open: its two sentences, what to do today, its 14 days drawn from his own data with the goal line
  await rows.filter({ hasText: 'Protein through the day' }).click(); await pg.waitForTimeout(150);
  const body = mr.locator('.mr-body');
  check(`opened: the tip for today (${await body.locator('.mr-tip').innerText().catch(() => '')})`, /Today\s*Have the protein coffee before 10/i.test(await body.locator('.mr-tip').innerText().catch(() => '')));
  const bars = body.locator('.dc-day');
  check(`…14 days drawn, a bar on the days with food (${await bars.count()} days, ${await body.locator('.dc-bar').count()} bars)`, await bars.count() === 14 && await body.locator('.dc-bar').count() === 2);
  const words = await body.locator('.dc-words').innerText();
  check(`…its numbers counted the app's way, the protein coffee included (${words})`, words === 'avg 139 g over 2 days · yesterday 158 g');
  check(`…with the protein goal as a line, named above it (${await body.locator('.dc-head').innerText()})`, await body.locator('.dc-goal').count() === 1 && /^Protein · last 14 days · goal 160 g$/.test(await body.locator('.dc-head').innerText()));
  await bars.nth(12).click();
  check(`tapping a day says its value (${await body.locator('.dc-words').innerText()})`, /^Thu 15 Oct · 158 g$/.test(await body.locator('.dc-words').innerText()));
  await mr.screenshot({ path: OUT + 'morning-read-item.png' });
  // PLAN 159: save it for later — it outlives the read
  await body.getByRole('button', { name: '☆ Save for later' }).click(); await pg.waitForTimeout(150);
  check('☆ saves the item (★ Saved)', await body.getByRole('button', { name: '★ Saved' }).getAttribute('aria-pressed') === 'true'
    && (await pg.evaluate((k) => JSON.parse(localStorage.getItem(k)).ai.saved.map((s) => s.title), KEY)).join() === 'Protein through the day');
  check('opened once: not new any more, and that sticks', await mr.getAttribute('data-new') === null && (await pg.evaluate((k) => JSON.parse(localStorage.getItem(k)).ai.digest.seen, KEY)) > 0);
  check('the news isn\'t on Today — it\'s a message', !/Creatine and sleep loss/.test(card));
  // the read's questions (PLAN 156): asked with the kinds the app picked, shown with the read, a study with its source
  check(`the read is told which kinds of question to ask, and not to repeat words (${c.slice(c.indexOf('## Questions this time')).split('\n').slice(0, 3).join(' | ').slice(0, 160)})`, /## Questions this time \(the app's picks, so days differ\)\n- \w+/.test(c));
  const qc = pg.locator('.question');
  check(`its study question is on Today, labelled, with its source (${(await qc.innerText().catch(() => '')).split('\n').slice(0, 3).join(' | ')})`, /^Saw a study/i.test(await qc.locator('h3').innerText().catch(() => '')) && /glycine before bed/.test(await qc.innerText()) && await qc.locator('a.q-src').getAttribute('href') === 'https://example.org/gly');
  await qc.screenshot({ path: OUT + 'question-study.png' });
  await qc.getByRole('button', { name: 'Skip' }).click(); await pg.waitForTimeout(150);
  check(`then the tracking one, which says it comes back in new words (${await qc.locator('.why').innerText().catch(() => '')})`, /^Tracking/i.test(await qc.locator('h3').innerText()) && /comes back now and then, in new words/.test(await qc.locator('.why').innerText()) && await qc.getByRole('button', { name: 'Stop asking this' }).count() === 1);
  const tr = await pg.evaluate((k) => JSON.parse(localStorage.getItem(k)).ai.daily.map((q) => q.key), KEY);
  check(`what's tracked is remembered by its key (${tr.join()})`, tr.includes('social_battery') && !tr.includes('glycine'));
  const badge = async () => (await pg.locator('nav.tabs a[href="#ai"] .tabbadge').textContent().catch(() => '')) || '0';
  check(`the AI tab's number says there's a message (${await badge()})`, await badge() === '1');
  await pg.reload(); await pg.waitForSelector('section.morning'); await pg.waitForTimeout(800);
  check('a reload doesn\'t write it again', calls.filter((x) => x.task === 'digest').length === 1);
  check('after a reload: folded, not highlighted', await pg.locator('section.morning.open').count() === 0 && await pg.locator('section.morning .mr-body').count() === 0 && await pg.locator('section.morning').getAttribute('data-new') === null);
  await pg.goto(APP + '#ai'); await pg.waitForTimeout(300);
  // the saved item at the top of the AI tab, folded to one line; opened: what it is, the tip, the source
  const sv = pg.locator('details.saved');
  check(`the AI tab has it, folded (${(await sv.locator('summary').innerText().catch(() => 'none')).replace(/\s+/g, ' ')})`, /☆ Saved for later\s*1/.test(await sv.locator('summary').innerText().catch(() => '')) && await sv.getAttribute('open') === null);
  await sv.locator('summary').click(); await pg.waitForTimeout(100);
  check(`…opened: the item, its tip, its source (${(await sv.locator('.sv').innerText()).replace(/\s+/g, ' ').slice(0, 110)})`, /Protein through the day/.test(await sv.innerText()) && /Have the protein coffee before 10/.test(await sv.innerText()) && await sv.locator('.sv a').getAttribute('href') === 'https://example.org/s');
  await sv.getByRole('button', { name: 'Tried it' }).click(); await pg.waitForTimeout(100);
  check(`"Tried it" marks it (${(await sv.locator('summary').innerText()).replace(/\s+/g, ' ')})`, /1 tried/.test(await sv.locator('summary').innerText()) && await sv.locator('.sv[data-tried]').count() === 1);
  await sv.screenshot({ path: OUT + 'saved-card.png' });
  await sv.getByRole('button', { name: 'Not tried yet' }).click(); await pg.waitForTimeout(100);
  const chat = await pg.locator('.chat').innerText();
  check('the chat doesn\'t repeat the read — it\'s on Today (owner, 16 Oct)', !/☀️|a better start|Rough night|Sleep and focus/.test(chat));
  const news = pg.locator('.msg.assistant', { hasText: 'Creatine and sleep loss' });
  check(`the news is there once, with its source as a link (${(await news.innerText().catch(() => '')).replace(/\s+/g, ' ')})`, await news.count() === 1
    && /📰 Creatine and sleep loss A 2026 trial/.test((await news.innerText()).replace(/\s+/g, ' ')) && await news.locator('a.msg-src').getAttribute('href') === 'https://example.org/cr');
  await news.screenshot({ path: OUT + 'news-message.png' });
  check('opening the chat clears the number', await pg.locator('nav.tabs a[href="#ai"] .tabbadge').count() === 0);

  // the next morning, before today's read is written: yesterday's read and its questions are gone (PLAN 155–156; owner,
  // 21 Oct: "if i get them at yesterday morning, it should not be there/ or the same at next morning")
  await pg.clock.setSystemTime(new Date('2026-10-17T07:10:00').getTime()); await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('text=Settings'); await pg.waitForTimeout(800);
  check(`next morning: no read and no question from yesterday (${await pg.locator('section.morning, .question').count()} on Today)`, await pg.locator('section.morning').count() === 0 && await pg.locator('.question').count() === 0);
  await pg.goto(APP + '#ai'); await pg.waitForTimeout(300);
  check('…but what you saved is still in the AI tab', /Saved for later\s*1/.test(await pg.locator('details.saved summary').innerText().catch(() => '')));
  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
