// Noticed something? (PLAN 135; owner, 20 Oct: "a small text box where i can write things like I went downstairs to do
// something, something else distracted me, came back up and realized i didnt do what i wanted … The app can … ask me
// about that, dive deep into it" + "a checkup from time to time … based on my health markers"). Typed on Today, saved,
// undoable; in the day's log; the questions get it with what the day held, and a check-up; the night read-back sees it.
const { chromium, APP, OUT, handle } = require('./harness.cjs');
const calls = [];

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  await ctx.route('**/api/ai/usage**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ usage: null, cap: 50, on: true }) }));
  await ctx.route('**/api/ai?**', (r) => { const body = r.request().postDataJSON(); calls.push(body);
    const answer = body.task === 'questions' ? { questions: [] } : body.task === 'night' ? { summary: 'A day.', happened: [], notes: '', change: [], remember: [] } : { greeting: 'Hi', items: [] };
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ answer, usage: null, costUsd: 0.01, model: 'opus' }) }); });
  const pg = await ctx.newPage();
  await pg.clock.install({ time: new Date('2026-10-20T15:20:00') });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  const KEY = 'healthos.v1:u-test', st = async () => { await pg.waitForTimeout(300); return pg.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}'), KEY); };
  await pg.evaluate((k) => { const s = JSON.parse(localStorage.getItem(k) || '{}'), t = (hm) => new Date(`2026-10-20T${hm}:00`).getTime();
    s.entries = [{ id: 'c1', kind: 'drink', at: t('08:00'), name: 'Coffee', ml: 250, caffeineMg: 95, alcoholG: 0, kcal: 2 }, { id: 'f1', kind: 'feel', at: t('12:00'), stress: 7 }];
    s.ai = { ...(s.ai || {}), questions: null, asked: [], daily: [] }; localStorage.setItem(k, JSON.stringify(s)); }, KEY);
  await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('.notice-box');

  const box = pg.getByLabel('Something you noticed');
  await box.fill('went downstairs, forgot why');
  await pg.locator('.notice-box').evaluate((el) => el.scrollIntoView({ block: 'center' })); await pg.waitForTimeout(100); await pg.locator('.notice-box').screenshot({ path: OUT + 'notice-box.png' });
  await pg.locator('.notice-box').getByRole('button', { name: 'Save' }).click();
  const n = (await st()).entries.find((e) => e.kind === 'notice');
  check(`saved in his words, now (${n && n.text})`, n && n.text === 'went downstairs, forgot why' && Math.abs(n.at - new Date('2026-10-20T15:20:00').getTime()) < 60_000 && await box.inputValue() === '');
  check('…with an undo', await pg.getByRole('button', { name: /undo/i }).count() >= 1);
  const wide = await pg.evaluate(() => document.documentElement.scrollWidth);
  check(`phone: nothing wider than the screen (${wide} px)`, wide <= 390);
  await pg.goto(APP + '#log'); await pg.waitForTimeout(300);
  check('in the day\'s log', /Noticed\s*15:20 · “went downstairs, forgot why”/.test(await pg.locator('body').innerText()));

  // the next questions: the notice with what the day held, and a check-up (none answered yet)
  await pg.evaluate((k) => { const s = JSON.parse(localStorage.getItem(k)); s.ai.questions = null; localStorage.setItem(k, JSON.stringify(s)); }, KEY);
  const asked = calls.filter((c) => c.task === 'questions').length;
  // no read brought questions: the cheap call from 13:00 (PLAN 156)
  await pg.clock.setFixedTime(new Date('2026-10-21T13:30:00')); await pg.goto(APP + '#today'); await pg.reload(); await pg.waitForSelector('.notice-box');
  for (let i = 0; i < 40 && calls.filter((c) => c.task === 'questions').length === asked; i++) await pg.waitForTimeout(100);
  const q = calls.filter((c) => c.task === 'questions').at(-1);
  check(`the questions get it with that day up to then (${q ? (q.context.match(/- Tue 20 Oct 15:20[^\n]*/) || [''])[0] : 'no call'})`, q && /## Things I noticed about myself[^\n]*\n- Tue 20 Oct 15:20: "went downstairs, forgot why" \(95 mg caffeine so far; last check-in 12:00: stress 7\)/.test(q.context));
  check('…and a check-up is due', q && /## Check-up due \(none yet\)/.test(q.context));

  // that evening's read-back (the 20th, read the next morning) has it in the day
  const night = calls.filter((c) => c.task === 'night').at(-1);
  check(`the read-back of the 20th has it in the day (${night ? 'asked' : 'not asked'})`, !night || /15:20 noticed about myself: "went downstairs, forgot why"/.test(night.context));

  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
