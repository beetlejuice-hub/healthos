// Suggestions toward his goals (PLAN 131; owner, 20 Oct: "can we let ai … give me suggestions based on my goals (it can
// ask me what my goals are)"). With none given, the AI tab asks: two taps and his own words, Save; they're in About me,
// changeable; the chat's first starter becomes "Suggestions for my goals" and the AI gets them in its context.
const { chromium, APP, OUT, handle } = require('./harness.cjs');
const calls = [];

(async () => {
  const b = await chromium.launch(); const errs = [];
  const check = (label, ok) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) process.exitCode = 1; };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('https://ubfvaewfdbmecowoeuni.supabase.co/**', handle);
  await ctx.route('**/api/ai/usage**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ usage: null, cap: 50, on: true }) }));
  await ctx.route('**/api/ai?**', (r) => { const body = r.request().postDataJSON(); calls.push(body);
    const answer = body.task === 'chat' ? { reply: 'For **losing fat**: 3 cardio sessions this week.', remember: [] } : body.task === 'questions' ? { questions: [] } : { greeting: 'Hi', items: [] };
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ answer, usage: null, costUsd: 0.01, model: 'opus' }) }); });
  const pg = await ctx.newPage();
  await pg.clock.install({ time: new Date('2026-10-20T15:00:00') });
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await pg.goto(APP);
  await pg.fill('input[type=email]', 'lukacsarnold9+healthtest@gmail.com'); await pg.fill('input[type=password]', 'secret123');
  await pg.getByRole('button', { name: 'Sign in' }).click(); await pg.waitForSelector('text=Settings');
  const KEY = 'healthos.v1:u-test', st = async () => { await pg.waitForTimeout(300); return pg.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}'), KEY); };
  await pg.evaluate((k) => { const s = JSON.parse(localStorage.getItem(k) || '{}'); s.profile = { conditions: [], meds: [], allergies: [], notes: '' }; localStorage.setItem(k, JSON.stringify(s)); }, KEY);
  await pg.goto(APP + '#ai'); await pg.reload(); await pg.waitForSelector('.ai-screen');

  const card = pg.getByRole('region', { name: 'Your goals' });
  check('no goals given: the AI tab asks what he\'s working towards', await card.count() === 1 && /What are you working towards\?/.test(await card.innerText()));
  check('…and no goals starter yet', await pg.getByRole('button', { name: 'Suggestions for my goals' }).count() === 0);
  await card.getByRole('button', { name: 'Lose fat, keep muscle' }).click();
  await card.getByRole('button', { name: 'Sleep better' }).click();
  await card.getByLabel('Your own goal').fill('run a 10k by June');
  await card.screenshot({ path: OUT + 'goals-ask.png' });
  // found by eye: the picked ones didn't look picked
  const bg = (name) => card.getByRole('button', { name }).evaluate((e) => getComputedStyle(e).backgroundColor);
  check(`a picked goal looks picked (${await bg('Sleep better')} vs ${await bg('Get stronger')})`, await bg('Sleep better') !== await bg('Get stronger'));
  await card.getByRole('button', { name: 'Save 3' }).click();
  const aims = (await st()).profile.aims;
  check(`saved to About me, in his words (${JSON.stringify(aims)})`, JSON.stringify(aims) === JSON.stringify(['Lose fat, keep muscle', 'Sleep better', 'run a 10k by June']) && await card.count() === 0);

  await pg.getByRole('button', { name: 'Suggestions for my goals' }).click();
  await pg.waitForFunction(() => /losing fat/.test(document.querySelector('.chat')?.textContent || ''), null, { timeout: 5000 }).catch(() => {});
  const chat = calls.filter((c) => c.task === 'chat')[0];
  const sent = chat ? JSON.stringify(chat) : '';
  check('the starter asks for suggestions toward them', /Based on my goals, what are 3 concrete things to try this week/.test(sent));
  check('…and the AI gets them in About me', /My goals \(in my words\): Lose fat, keep muscle; Sleep better; run a 10k by June\./.test(sent));
  check('the reply shows', /losing fat/.test(await pg.locator('.chat').innerText()));
  const wide = await pg.evaluate(() => document.documentElement.scrollWidth);
  check(`phone: nothing wider than the screen (${wide} px)`, wide <= 390);

  // About me: changeable
  await pg.goto(APP + '#settings'); await pg.waitForSelector('#about');
  const about = (await pg.locator('#about').innerText()).replace(/\s+/g, ' ');
  check(`Settings → About me lists them, each removable (${about.slice(0, 120)})`, /run a 10k by June/.test(about) && await pg.getByRole('button', { name: 'Remove Sleep better' }).count() === 1);
  await pg.getByRole('button', { name: 'Remove Sleep better' }).click();
  check('removed there, gone', !(await st()).profile.aims.includes('Sleep better'));

  console.log('errors:', JSON.stringify(errs));
  check('no page errors', errs.length === 0);
  await b.close();
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
