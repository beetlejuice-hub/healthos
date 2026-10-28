// The reads stop repeating themselves (owner, 28 Oct: "in the last liike 7 days it only recommended me to take in more
// protein w breakfast, it gets boring, it can repeat sometimes but not every day dude...should keep a log of what it
// said, what it thinks of me, what it should dive in more, what it should research etc"). Planted: protein-breakfast
// advice every day for 7 days. Wed 28 Oct, 07:40, the morning read comes back with it under a new name ("high-protein-
// breakfast", "Tuna toast: 35 g before 9") next to two new things: the AI was told the topic is resting; Today shows only
// the two new ones; the log keeps them, not the dropped one. Its "look into" lands on the list. At 21:30 the night read's
// "Tomorrow, maybe" has a walk after lunch again (said that morning, other words) and lights out by 23:00: only the
// second stays; it covers the creatine question, which leaves the list. Settings → AI shows all of it; ✕ forgets a
// topic. Control: no history — all three morning items stay.
const { chromium, APP, OUT, handle, forYou } = require('./harness.cjs');

const KEY = 'healthos.v1:u-test', DAY = 864e5, MORNING = new Date('2026-10-28T07:40:00').getTime();
const SAID = Array.from({ length: 7 }, (_, k) => ({ topic: 'protein-breakfast', text: `Protein at breakfast, take ${k + 1} — Add 30 g protein before 9`, at: MORNING - (7 - k) * DAY, from: 'morning' }));
const src = { title: 'Nutrients 2025', url: 'https://example.org/n' };
const READ = { greeting: 'Morning! 7 h last night.', items: [
  { type: 'pattern', topic: 'high-protein-breakfast', title: 'Tuna toast: 35 g before 9', text: 'Your best focus days started with 30 g+ protein.', tip: 'Eat 35 g protein by 09:00', measure: 'protein' },
  { type: 'try', topic: 'walk-after-lunch', title: 'A 10-minute walk after lunch', text: 'Lowers the post-lunch glucose bump in trials.', tip: 'Walk 10 minutes after lunch', source: src },
  { type: 'study', topic: 'caffeine-cutoff', title: 'Coffee after 14:00 and deep sleep', text: 'A 2025 trial: 200 mg at 6 h before bed cut deep sleep.', tip: 'Last coffee by 14:00', source: src },
], look_into: ['Does creatine on training days only change how full your muscles feel?'] };
const NIGHT = { summary: 'A steady day.', happened: [], notes: '', remember: [],
  change: [{ what: 'Walk 10 minutes after your lunch', why: 'the 15:00 dip', topic: 'after-lunch-walk' }, { what: 'Lights out by 23:00', why: '6 h last two nights', topic: 'bedtime-2300' }] };

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  async function open(said) {
    const calls = [];
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
    await ctx.route('**/api/ai/usage**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ usage: null, cap: 50, on: true }) }));
    await ctx.route('**/api/ai?**', (r) => {
      const body = r.request().postDataJSON(); calls.push(body);
      const id = (body.context.match(/\[t:(\w+)\] Does creatine/) || [])[1];
      const answer = body.task === 'digest' ? READ : body.task === 'night' ? { ...NIGHT, ...(id ? { looked_into: [`t:${id}`] } : {}) } : null;
      if (!answer) return r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not in this test"}' });
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ answer, usage: null, costUsd: 0.05, model: 'sonnet' }) });
    });
    const pg = await ctx.newPage();
    await pg.clock.install({ time: MORNING });
    pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    await pg.goto(APP);
    await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
    await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
    await pg.evaluate(([k, said, at]) => { const s = JSON.parse(localStorage.getItem(k) || '{}');
      s.entries = [{ id: 'sl', kind: 'sleep', at: at - 5 * 60e3, rating: 7 }, { id: 'f1', kind: 'food', at: at - 30 * 60e3, name: 'Oats', grams: 80, macros: { kcal: 300, p: 10, c: 50, f: 6 } }];
      s.ai = { ...(s.ai || {}), digest: null, night: null, chat: [], said, threads: [] }; localStorage.setItem(k, JSON.stringify(s)); }, [KEY, said, MORNING]);
    await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('.t2-status');
    for (let i = 0; i < 50 && !calls.some((c) => c.task === 'digest'); i++) await pg.waitForTimeout(100);
    await pg.waitForFunction((k) => !!JSON.parse(localStorage.getItem(k)).ai.digest, KEY, { timeout: 5000 }).catch(() => {});
    return { ctx, pg, calls, st: () => pg.evaluate((k) => JSON.parse(localStorage.getItem(k)).ai, KEY) };
  }

  let { ctx, pg, calls, st } = await open(SAID);
  const sent = calls.find((c) => c.task === 'digest');
  const told = (sent?.context.match(/## What the reads already told me[^\n]*\n(- [^\n]*\n?)+/) || [''])[0];
  check(`the morning read is told what's been said, and that it's resting (${told.split('\n')[1]?.slice(0, 120)})`, /- protein-breakfast — 7× since Wed 21 Oct, last Tue 27 Oct \(morning\): "Protein at breakfast, take 7[^"]*" — resting until Sun 1 Nov/.test(told));
  let ai = await st();
  check(`the repeat under a new name is dropped; the two new ones stay (${ai.digest.items.map((i) => i.title).join(' | ')})`,
    ai.digest.items.map((i) => i.topic).join() === 'walk-after-lunch,caffeine-cutoff');
  await forYou(pg, 'morning');
  const shown = (await pg.locator('section.morning').innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(`Today shows the two, not the tuna toast (${shown.slice(0, 160)})`, /A 10-minute walk after lunch/.test(shown) && /Coffee after 14:00/.test(shown) && !/Tuna toast/.test(shown));
  check(`the log keeps what was said, not what was dropped (${ai.said.slice(-2).map((s) => s.topic).join(', ')})`,
    ai.said.length === 9 && ai.said.slice(-2).map((s) => s.topic).join() === 'walk-after-lunch,caffeine-cutoff' && !ai.said.some((s) => s.topic === 'high-protein-breakfast'));
  check(`its "look into" is on the list (${JSON.stringify(ai.threads.map((t) => t.text))})`, ai.threads.length === 1 && /creatine on training days/.test(ai.threads[0].text));

  // 21:30: the night read — a walk after lunch again (said this morning), and lights out by 23:00
  await pg.clock.setSystemTime(new Date('2026-10-28T21:30:00').getTime()); await pg.reload(); await pg.waitForSelector('.t2-status');
  for (let i = 0; i < 50 && !calls.some((c) => c.task === 'night'); i++) await pg.waitForTimeout(100);
  await pg.waitForFunction((k) => !!JSON.parse(localStorage.getItem(k)).ai.night, KEY, { timeout: 5000 }).catch(() => {});
  const nsent = calls.find((c) => c.task === 'night');
  check('the night read sees this morning\'s topics resting, and the list with its id', /walk-after-lunch — 1×[^\n]*resting until/.test(nsent?.context ?? '') && /## On my list to look into[^\n]*\n- \[t:\w+\] Does creatine/.test(nsent?.context ?? ''));
  ai = await st();
  check(`"Tomorrow, maybe": the walk (this morning's, other words) goes; lights out stays (${ai.night.change.map((c) => c.what).join(' | ')})`, ai.night.change.map((c) => c.topic).join() === 'bedtime-2300');
  check(`it covered the creatine question: off the list (${ai.threads.length})`, ai.threads.length === 0);

  // Settings → AI shows the log
  await pg.goto(APP + '#settings'); await pg.waitForTimeout(300);
  const ai2 = pg.getByRole('button', { name: /^AI/ }); if (await ai2.count()) { await ai2.first().click().catch(() => {}); }
  const log = pg.locator('.readlog');
  await log.waitFor({ timeout: 5000 }).catch(() => {});
  const txt = (await log.innerText().catch(() => '')).replace(/\s+/g, ' ');
  check(`Settings → AI: what the reads told me (${txt.slice(0, 160)})`, /bedtime 2300 1× · last Wed 28 Oct · resting till 2 Nov/.test(txt) && /protein breakfast 7× · last Tue 27 Oct · resting till 1 Nov/.test(txt));
  await log.getByRole('button', { name: 'Forget protein breakfast' }).click(); await pg.waitForTimeout(200);
  check('✕ forgets a topic: it may come back', !(await st()).said.some((s) => s.topic === 'protein-breakfast'));
  await log.screenshot({ path: OUT + 'said-settings.png' }).catch(() => {});
  check(`fits (${await pg.evaluate(() => document.documentElement.scrollWidth)} px)`, await pg.evaluate(() => document.documentElement.scrollWidth) <= 390);
  await ctx.close();

  // control: no history — all three stay
  ({ ctx, pg, calls, st } = await open([]));
  ai = await st();
  check(`control: nothing said before → all three morning items stay (${ai.digest?.items.length})`, ai.digest?.items.length === 3 && ai.said.length === 3);
  await ctx.close();

  // an account from before the log (no said, no threads at all): Settings opens and says so (28 Oct: a fresh [] from the
  // store re-rendered forever — React #185 — on every Settings open)
  ({ ctx, pg, calls, st } = await open([]));
  await pg.evaluate((k) => { const s = JSON.parse(localStorage.getItem(k)); delete s.ai.said; delete s.ai.threads; localStorage.setItem(k, JSON.stringify(s)); }, KEY);
  await pg.clock.setSystemTime(MORNING - 10 * 3600e3); // the evening before: no read is written
  await pg.goto(APP + '#settings'); await pg.reload(); await pg.waitForTimeout(800);
  check(`no log yet: Settings opens and says nothing yet (${(await pg.locator('h3', { hasText: 'What the reads told me' }).locator('xpath=following-sibling::*[1]').innerText().catch(() => 'none')).slice(0, 60)})`,
    /Nothing yet — it starts with the next read/.test(await pg.locator('body').innerText()));
  await ctx.close();
  console.log('errors: ' + JSON.stringify(errs)); await b.close();
})().catch((e) => { console.log('CRASH ' + e.message); process.exit(1); });
